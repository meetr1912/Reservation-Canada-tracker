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

# Scan window: the next 6 months.
SCAN_DAYS = 180

# How many daily history points to retain (~4 months of trend).
HISTORY_LIMIT = 120


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
        "errors": errors or [],
        **{k: stats[k] for k in ("total_available_slots", "available_days", "available_units")},
    }

    history = _append_history(prior_history, generated_at[:10], stats)

    return {"metadata": metadata, "history": history, "dates": dates}


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


def scan_availability(otentiks, start_date, days=SCAN_DAYS):
    """Hit the reservation API for each unit. Returns (available_set, errors)."""
    from playwright.sync_api import sync_playwright

    end_date = start_date + timedelta(days=days)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    available_set = set()
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            )
        )
        page = context.new_page()

        print("Initializing session...")
        page.goto(BASE_URL, timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as e:  # noqa: BLE001 - tolerated; page is usually ready
            print(f"Network idle timeout (this is ok): {e}")

        api = page.request

        for otentik in otentiks:
            resource_id = otentik["NegativeResourceValue"]
            resource_name = otentik["ResourceName"]
            url = (
                f"{BASE_URL}/api/availability/resourcedailyavailability?"
                f"resourceId={resource_id}&"
                f"bookingCategoryId={BOOKING_CATEGORY_OTENTIK}&"
                f"startDate={start_str}&endDate={end_str}&isReserving=true"
            )
            print(f"Checking {resource_name} ({resource_id})...")
            try:
                response = api.get(url)
                if not response.ok:
                    msg = f"{resource_name}: HTTP {response.status} {response.status_text}"
                    print(f"  -> {msg}")
                    errors.append(msg)
                    continue
                _collect_available(response.json(), resource_id, start_date, available_set)
            except Exception as e:  # noqa: BLE001 - record and keep going
                msg = f"{resource_name}: {e}"
                print(f"  -> error: {msg}")
                errors.append(msg)

        browser.close()

    return available_set, errors


def _collect_available(data, resource_id, start_date, available_set):
    """Parse an API response into (resource_id, date) availability tuples."""
    if isinstance(data, dict):
        for date, details in data.items():
            if isinstance(details, dict) and details.get("availability") == 1:
                available_set.add((resource_id, date.split("T")[0]))
    elif isinstance(data, list):
        for i, details in enumerate(data):
            if isinstance(details, dict) and details.get("availability") == 1:
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
