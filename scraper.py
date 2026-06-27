"""Parks Canada oTENTik availability scraper.

Scans the Parks Canada reservation API for every tracked oTENTik unit across the
next 6 months (180 days) and writes a structured availability report.

The report schema is:

    {
      "metadata": { ...summary stats, generated_at, errors... },
      "history":  [ { "date", "available_slots", "available_units", "available_days" } ],
      "dates":    { "YYYY-MM-DD": [ { ParkName, PageTitle, ResourceName, status } ] }
    }

The pure helpers (`load_otentiks`, `build_report`, `load_prior_history`,
`summarize`) contain no network code so they can be unit-tested. The network
scan lives in `scan_availability`, which imports Playwright lazily.
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

BASE_URL = "https://reservation.pc.gc.ca"
OTENTIKS_FILE = "otentiks.json"
REPORT_FILE = "availability_report.json"
PUBLIC_REPORT_FILE = os.path.join("public", "availability_report.json")

# Parks Canada booking category id for oTENTiks.
BOOKING_CATEGORY_OTENTIK = 4

# The reservation API returns one record per day shaped like
#   {"processedAvailability": 5, "availability": 1, "remainingQuota": null}
# Confirmed against the live API (see probe): `availability == 0` means the
# date is OPEN/bookable; `1` means booked/unavailable. (The earlier code had
# this inverted, which made nearly everything show as available.)
AVAILABLE_CODE = 0

# Scan window: the next 6 months.
SCAN_DAYS = 180

# How many daily history points to retain (~4 months of trend).
HISTORY_LIMIT = 120

# If more than this fraction of requests fail, treat the scan as blocked and
# refuse to overwrite the existing report (prevents zeroing out the site).
MAX_ERROR_RATE = 0.30


def load_otentiks(path=OTENTIKS_FILE):
    """Load the tracked oTENTik units."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _date_range(start_date, days):
    for i in range(days):
        yield (start_date + timedelta(days=i)).strftime("%Y-%m-%d")


def summarize(dates):
    """Compute summary stats from a {date: [sites]} mapping."""
    total_slots = 0
    available_days = 0
    available_units = set()
    parks = set()
    for date_str, sites in dates.items():
        day_count = 0
        for site in sites:
            parks.add(site.get("ParkName"))
            if site.get("status"):
                day_count += 1
                available_units.add(site.get("ResourceName"))
        total_slots += day_count
        if day_count:
            available_days += 1
    return {
        "total_available_slots": total_slots,
        "available_days": available_days,
        "available_units": len(available_units),
        "parks": sorted(p for p in parks if p),
    }


def build_report(otentiks, available_set, start_date, days=SCAN_DAYS,
                 prior_history=None, generated_at=None, errors=None):
    """Build the structured report (pure function, no network).

    `available_set` is a set of (resource_id, "YYYY-MM-DD") tuples that are
    available. `prior_history` is a list of previous history points to carry
    forward. `generated_at` is an ISO-8601 string (caller supplies it so this
    stays deterministic and testable).
    """
    dates = {}
    for date_str in _date_range(start_date, days):
        daily = []
        for otentik in otentiks:
            resource_id = otentik["NegativeResourceValue"]
            daily.append({
                "ParkName": otentik.get("ParkName"),
                "PageTitle": otentik.get("PageTitle"),
                "ResourceName": otentik.get("ResourceName"),
                "status": (resource_id, date_str) in available_set,
            })
        dates[date_str] = daily

    date_keys = sorted(dates.keys())
    stats = summarize(dates)
    generated_at = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    metadata = {
        "generated_at": generated_at,
        "start_date": date_keys[0] if date_keys else None,
        "end_date": date_keys[-1] if date_keys else None,
        "days": days,
        "total_units": len(otentiks),
        "total_parks": len(stats["parks"]),
        "parks": stats["parks"],
        "always_available_parks": always_available_parks(dates),
        "errors": errors or [],
        **{k: stats[k] for k in ("total_available_slots", "available_days", "available_units")},
    }

    history = _append_history(prior_history, generated_at[:10], stats)

    return {"metadata": metadata, "history": history, "dates": dates}


def always_available_parks(dates):
    """Parks where every unit is open on every single day of the window.

    Such a perfectly-constant pattern is statistically implausible for a real
    in-demand site, so the UI flags these as "verify on Parks Canada" (a
    resource can be valid in the system yet not actually open for booking).
    """
    if not dates:
        return []
    sample = next(iter(dates.values()))
    totals = {}
    for s in sample:
        totals[s["ParkName"]] = totals.get(s["ParkName"], 0) + 1
    flagged = set(totals)
    for sites in dates.values():
        open_by = {}
        for s in sites:
            if s["status"]:
                open_by[s["ParkName"]] = open_by.get(s["ParkName"], 0) + 1
        for park in list(flagged):
            if open_by.get(park, 0) != totals[park]:
                flagged.discard(park)
        if not flagged:
            break
    return sorted(flagged)


def _append_history(prior_history, scan_date, stats):
    """Append today's summary to history, de-duplicating by date and trimming."""
    history = [h for h in (prior_history or []) if h.get("date") != scan_date]
    history.append({
        "date": scan_date,
        "available_slots": stats["total_available_slots"],
        "available_units": stats["available_units"],
        "available_days": stats["available_days"],
    })
    history.sort(key=lambda h: h.get("date", ""))
    return history[-HISTORY_LIMIT:]


def load_prior_history(*paths):
    """Read history from the first existing report file (new schema only)."""
    for path in paths:
        if not path or not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("history"), list):
                return data["history"]
        except (json.JSONDecodeError, OSError):
            continue
    return []


# A modern, realistic browser UA. The reservation site rate-limits/forbids
# bursts of requests, so we pace requests and back off on 403/429.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_DELAY = 0.6          # base polite delay between resources (seconds)
MAX_ATTEMPTS = 4            # attempts per resource on a 403/429
THROTTLE_STATUSES = (403, 429, 503)


def scan_availability(otentiks, start_date, days=SCAN_DAYS, request_delay=REQUEST_DELAY):
    """Hit the reservation API for each unit. Returns (available_set, errors).

    Paces requests and backs off on throttling (403/429), refreshing the
    browser session between retries, so a full 122-unit sweep isn't blocked.
    """
    import time
    import random
    from playwright.sync_api import sync_playwright

    end_date = start_date + timedelta(days=days)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    available_set = set()
    errors = []

    def refresh(page):
        try:
            page.goto(BASE_URL, timeout=60000)
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception as e:  # noqa: BLE001 - page is usually ready enough
            print(f"  (session refresh timeout, ok): {e}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT,
                                      locale="en-CA")
        page = context.new_page()

        print("Initializing session...")
        refresh(page)
        api = page.request

        for i, otentik in enumerate(otentiks):
            resource_id = otentik["NegativeResourceValue"]
            resource_name = otentik["ResourceName"]
            url = (
                f"{BASE_URL}/api/availability/resourcedailyavailability?"
                f"resourceId={resource_id}&"
                f"bookingCategoryId={BOOKING_CATEGORY_OTENTIK}&"
                f"startDate={start_str}&endDate={end_str}&isReserving=true"
            )
            print(f"[{i + 1}/{len(otentiks)}] {resource_name} ({resource_id})...")

            last_err = None
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    response = api.get(url, timeout=30000)
                    if response.ok:
                        _collect_available(response.json(), resource_id,
                                           start_date, available_set)
                        last_err = None
                        break
                    last_err = f"HTTP {response.status} {response.status_text}"
                    if response.status in THROTTLE_STATUSES and attempt < MAX_ATTEMPTS:
                        backoff = 4 * attempt + random.uniform(0, 2)
                        print(f"  -> {last_err}; backing off {backoff:.1f}s "
                              f"(attempt {attempt}/{MAX_ATTEMPTS})")
                        time.sleep(backoff)
                        refresh(page)
                        continue
                    break  # non-throttle error, or out of attempts
                except Exception as e:  # noqa: BLE001
                    last_err = str(e)
                    if attempt < MAX_ATTEMPTS:
                        time.sleep(2 * attempt)
                        continue
                    break

            if last_err:
                print(f"  -> failed: {last_err}")
                errors.append(f"{resource_name}: {last_err}")

            # Polite pacing between resources with a little jitter.
            time.sleep(request_delay + random.uniform(0, 0.4))

        browser.close()

    return available_set, errors


def _is_open(details):
    """True if a per-day record represents a bookable (open) date."""
    return isinstance(details, dict) and details.get("availability") == AVAILABLE_CODE


def _collect_available(data, resource_id, start_date, available_set):
    """Parse an API response into (resource_id, date) availability tuples.

    The live endpoint returns a list (one entry per day from startDate); an
    older dict-keyed form is also tolerated. A date counts as available only
    when its `availability` code equals AVAILABLE_CODE (0).
    """
    if isinstance(data, dict):
        for date, details in data.items():
            if _is_open(details):
                available_set.add((resource_id, date.split("T")[0]))
    elif isinstance(data, list):
        for i, details in enumerate(data):
            if _is_open(details):
                clean = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
                available_set.add((resource_id, clean))


def write_report(report, *paths):
    for path in paths:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"Wrote {path}")


def main():
    otentiks = load_otentiks()
    start_date = datetime.now()
    print(f"Scanning {len(otentiks)} oTENTiks for the next {SCAN_DAYS} days...")

    available_set, errors = scan_availability(otentiks, start_date, SCAN_DAYS)

    # Safety guard: if the scan was largely blocked (e.g. mass 403s), do NOT
    # overwrite the existing report with a near-empty one. Keep yesterday's
    # data and fail the run so it's visible.
    error_rate = len(errors) / len(otentiks) if otentiks else 1.0
    if error_rate > MAX_ERROR_RATE:
        print(f"\nABORT: {len(errors)}/{len(otentiks)} requests failed "
              f"({error_rate:.0%} > {MAX_ERROR_RATE:.0%}). The scan was likely "
              f"throttled; keeping the existing report unchanged.")
        return 1

    prior_history = load_prior_history(REPORT_FILE, PUBLIC_REPORT_FILE)
    report = build_report(
        otentiks, available_set, start_date, SCAN_DAYS,
        prior_history=prior_history, errors=errors,
    )

    write_report(report, REPORT_FILE, PUBLIC_REPORT_FILE)

    meta = report["metadata"]
    print(
        f"\nDone. {meta['total_available_slots']} available slots across "
        f"{meta['available_units']} units on {meta['available_days']} days "
        f"({len(errors)} errors)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
