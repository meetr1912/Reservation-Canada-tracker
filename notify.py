"""Send availability alerts for watch requests filed as GitHub issues.

Runs in CI after each scan. Reads open issues that contain an ```alert fenced
block (created by the site's "Alert me" flow), checks the freshly-scraped
availability report, and emails (and optionally texts via a carrier SMS
gateway) when a watched park has an opening on a watched date.

Design notes:
- No backend: subscriptions live as GitHub issues; this is the consumer.
- Per the chosen behaviour, an active watch is re-notified on every run while
  the opening persists; an issue comment is added only when the set of open
  slots changes (keeps the issue readable). State persists in alerts_state.json.
- Pure helpers (parse_alert_block, matches_for, recipients, build_email,
  signature) are network-free and unit-tested. main() does the I/O.
- Fails soft: missing email secrets or API hiccups never fail the workflow.
"""

import json
import os
import re
import smtplib
import sys
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlencode

import requests

REPORT_FILE = "availability_report.json"
STATE_FILE = "alerts_state.json"
BOOKING_URL = "https://reservation.pc.gc.ca/"
API = "https://api.github.com"

# SMS-over-email gateways we allow (must match CARRIERS in src/lib/alerts.js).
# Restricting to an allowlist prevents the notifier becoming an open relay.
CARRIER_GATEWAYS = {
    "pcs.rogers.com", "txt.bell.ca", "msg.telus.com", "fido.ca",
    "msg.koodomobile.com", "vmobile.ca", "txt.freedommobile.ca",
    "vtext.com", "txt.att.net", "tmomail.net",
}

# Bounds to keep a public, self-serve signup from turning into an abuse vector.
MAX_PAGES = 20            # up to 2000 open issues scanned
MAX_WATCHES_PER_RUN = 200  # cap watches (and thus emails) acted on per run

# Free, no-registration push via ntfy.sh. Keep prefix/slug in sync with
# src/lib/alerts.js so the topics the site shows match what we publish to.
NTFY_BASE = "https://ntfy.sh"
NTFY_PREFIX = "pc-otentik-9k2q"

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALERT_BLOCK_RE = re.compile(r"```alert\s*(\{.*?\})\s*```", re.DOTALL)


# ---------------------------------------------------------------------------
# Pure helpers (no network)
# ---------------------------------------------------------------------------

def parse_alert_block(body):
    """Extract and validate the alert payload from an issue body, or None."""
    if not body:
        return None
    m = ALERT_BLOCK_RE.search(body)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None

    email = str(data.get("email", "")).strip()
    if not EMAIL_RE.match(email):
        return None
    start = str(data.get("start", "")).strip()
    end = str(data.get("end", "")).strip()
    if not (DATE_RE.match(start) and DATE_RE.match(end)) or end < start:
        return None

    parks = data.get("parks", [])
    if not isinstance(parks, list):
        parks = []
    parks = [str(p) for p in parks if isinstance(p, (str,))]

    phone = re.sub(r"[^\d]", "", str(data.get("phone", "")))
    carrier = str(data.get("carrier", "")).strip().lower()
    if carrier not in CARRIER_GATEWAYS:
        carrier = ""

    return {"email": email, "phone": phone, "carrier": carrier,
            "parks": parks, "start": start, "end": end}


def matches_for(report_dates, criteria, today):
    """Return [{date, park, units:[names]}] for watched park/date openings.

    Only considers dates from today onward within [start, end]. An empty
    `parks` list means "any park".
    """
    today_str = today.isoformat() if isinstance(today, date) else str(today)
    lo = max(criteria["start"], today_str)
    hi = criteria["end"]
    want = set(criteria["parks"])
    out = []
    for d in sorted(report_dates):
        if d < lo or d > hi:
            continue
        by_park = {}
        for s in report_dates[d]:
            if not s.get("status"):
                continue
            park = s.get("ParkName")
            if want and park not in want:
                continue
            by_park.setdefault(park, []).append(s.get("ResourceName"))
        for park in sorted(by_park):
            out.append({"date": d, "park": park, "units": sorted(by_park[park])})
    return out


def signature(matches):
    """Stable signature of a match set (date+park+count) for change detection."""
    return ";".join(f"{m['date']}|{m['park']}|{len(m['units'])}" for m in matches)


def recipients(criteria):
    """Email recipients: the email plus a carrier SMS gateway if configured."""
    out = [criteria["email"]]
    if criteria["phone"] and criteria["carrier"] in CARRIER_GATEWAYS:
        out.append(f"{criteria['phone']}@{criteria['carrier']}")
    return out


def _pretty_unit(name):
    m = re.match(r"^O?\s*0*(\d+)$", str(name or "").strip(), re.IGNORECASE)
    return f"oTENTik {m.group(1)}" if m else str(name)


def _shift_date(date_str, n):
    """YYYY-MM-DD shifted by n days (used for the booking end date)."""
    d = datetime.strptime(date_str, "%Y-%m-%d").date() + timedelta(days=n)
    return d.isoformat()


def booking_url(loc, date_str):
    """Deep-link to the Parks Canada results for a location + date (1 night).

    `loc` is a metadata.locations entry ({t,r,m,b}). Falls back to the booking
    home when we have no ids for the park (older report). Mirrors
    buildBookingUrl in src/lib/data.js so site and email links match.
    """
    if not loc or not date_str:
        return BOOKING_URL
    params = {
        "transactionLocationId": loc.get("t"),
        "resourceLocationId": loc.get("r"),
        "mapId": loc.get("m"),
        "searchTabGroupId": 2,
        "bookingCategoryId": 1 if loc.get("b") is None else loc.get("b"),
        "startDate": date_str,
        "endDate": _shift_date(date_str, 1),
        "nights": 1,
        "isReserving": "true",
        "peopleCapacityCategoryCounts": "[[-32767,null,1,null]]",
        "flexibleSearch": "[false,false,null,1]",
    }
    return f"https://reservation.pc.gc.ca/create-booking/results?{urlencode(params)}"


def build_email(matches, criteria, locations=None):
    """Return (subject, text_body) for a match set, with per-opening book links."""
    locations = locations or {}
    n_days = len({m["date"] for m in matches})
    n_slots = sum(len(m["units"]) for m in matches)
    subject = f"🏕️ {n_slots} oTENTik opening(s) on {n_days} watched day(s)"
    lines = ["Good news — openings matching your watch:\n"]
    for m in matches:
        units = ", ".join(_pretty_unit(u) for u in m["units"])
        lines.append(f"• {m['date']} — {m['park']}: {units}")
        lines.append(f"  Book this date: {booking_url(locations.get(m['park']), m['date'])}")
    lines.append("\nTo stop these alerts, close your alert issue on GitHub.")
    return subject, "\n".join(lines)


def build_sms(matches, locations=None):
    """Short text for SMS gateways, including a direct book link for the first."""
    locations = locations or {}
    n_slots = sum(len(m["units"]) for m in matches)
    first = matches[0]
    extra = f" +{len(matches) - 1} more" if len(matches) > 1 else ""
    url = booking_url(locations.get(first["park"]), first["date"])
    return (f"oTENTik alert: {n_slots} open. {first['date']} {first['park']}"
            f"{extra}. Book: {url}")


def slugify_park(park):
    return re.sub(r"[^a-z0-9]+", "-", str(park or "").lower()).strip("-")


def ntfy_topic(park):
    if not park or park == "all":
        return f"{NTFY_PREFIX}-all"
    return f"{NTFY_PREFIX}-{slugify_park(park)}"


def park_open_dates(report_dates, today):
    """{park: [sorted future dates with >=1 opening]} from today onward."""
    today_str = today.isoformat() if isinstance(today, date) else str(today)
    out = {}
    for d in report_dates:
        if d < today_str:
            continue
        for s in report_dates[d]:
            if s.get("status"):
                out.setdefault(s.get("ParkName"), set()).add(d)
    return {p: sorted(ds) for p, ds in out.items()}


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def report_dates(report):
    if isinstance(report, dict) and isinstance(report.get("dates"), dict):
        return report["dates"]
    return report if isinstance(report, dict) else {}


def gh_headers(token):
    return {"Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


def list_alert_issues(repo, token):
    """Return ALL open issues (following pagination), or None if the API failed.

    We fetch every page and filter by the presence of an alert block rather
    than a server-side label, so a missing/removed `alert` label can never
    silently hide subscriptions. Returning None (vs []) lets the caller tell a
    transient failure apart from "genuinely no issues" and avoid wiping state.
    """
    issues = []
    url = f"{API}/repos/{repo}/issues"
    for page in range(1, MAX_PAGES + 1):
        try:
            r = requests.get(url, headers=gh_headers(token),
                             params={"state": "open", "per_page": 100, "page": page},
                             timeout=30)
            r.raise_for_status()
            batch = r.json()
        except (requests.RequestException, ValueError) as e:
            print(f"  Could not list issues (page {page}): {e}")
            return None
        if not isinstance(batch, list) or not batch:
            break
        for it in batch:
            if "pull_request" in it:  # the issues endpoint also returns PRs
                continue
            issues.append(it)
        if len(batch) < 100:
            break
    else:
        print(f"  Warning: stopped at {MAX_PAGES} pages; some issues unscanned.")
    return issues


def comment_issue(repo, token, number, body):
    try:
        requests.post(f"{API}/repos/{repo}/issues/{number}/comments",
                      headers=gh_headers(token), json={"body": body}, timeout=30)
    except requests.RequestException as e:
        print(f"  Could not comment on #{number}: {e}")


def close_issue(repo, token, number):
    try:
        requests.patch(f"{API}/repos/{repo}/issues/{number}",
                       headers=gh_headers(token), json={"state": "closed"}, timeout=30)
    except requests.RequestException as e:
        print(f"  Could not close #{number}: {e}")


def send_mail(to_list, subject, body, cfg):
    """Send one message. Returns True on success."""
    msg = EmailMessage()
    msg["From"] = cfg["address"]
    msg["To"] = ", ".join(to_list)
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(cfg["server"], cfg["port"], timeout=30) as smtp:
            smtp.starttls()
            smtp.login(cfg["address"], cfg["password"])
            smtp.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001 - report and continue
        print(f"  Email send failed: {e}")
        return False


def email_config():
    address = os.environ.get("EMAIL_ADDRESS", "").strip()
    password = os.environ.get("EMAIL_PASSWORD", "").strip()
    if not address or not password:
        return None
    try:
        port = int((os.environ.get("SMTP_PORT") or "587").strip())
    except ValueError:
        port = 587
    return {
        "address": address,
        "password": password,
        "server": (os.environ.get("SMTP_SERVER") or "smtp.gmail.com").strip(),
        "port": port,
    }


def post_ntfy(topic, title, body):
    """Publish a message to a public ntfy topic (no auth). Returns True on success."""
    try:
        requests.post(
            f"{NTFY_BASE}/{topic}",
            data=body.encode("utf-8"),
            headers={
                "Title": title.encode("ascii", "ignore").decode() or "oTENTik opening",
                "Tags": "tent",
                "Click": BOOKING_URL,
            },
            timeout=15,
        )
        return True
    except requests.RequestException as e:
        print(f"  ntfy post failed for {topic}: {e}")
        return False


def publish_ntfy(report_dates, state, today):
    """Push openings to free, no-registration per-park ntfy topics (on change)."""
    ntfy_state = state.get("_ntfy", {})
    opens = park_open_dates(report_dates, today)

    for park in sorted(opens):
        ds = opens[park]
        topic = ntfy_topic(park)
        sig = ";".join(ds)
        if ntfy_state.get(topic) == sig:
            continue  # nothing new since last run
        shown = ", ".join(ds[:12]) + (" …" if len(ds) > 12 else "")
        title = f"{park}: {len(ds)} day(s) open"
        if post_ntfy(topic, title, f"Open dates: {shown}"):
            ntfy_state[topic] = sig

    # Catch-all topic for people watching "any park".
    all_topic = ntfy_topic("all")
    all_sig = ";".join(f"{p}:{len(opens[p])}" for p in sorted(opens))
    if opens and ntfy_state.get(all_topic) != all_sig:
        body = "; ".join(f"{p} ({len(opens[p])})" for p in sorted(opens))[:400]
        if post_ntfy(all_topic, f"{len(opens)} park(s) have openings", body):
            ntfy_state[all_topic] = all_sig

    state["_ntfy"] = ntfy_state
    print(f"ntfy: {len(opens)} park(s) with openings checked.")


def process_email_watches(dates, state, today, token, repo, cfg, locations=None):
    """Email/text watchers who filed a GitHub-issue subscription (optional path)."""
    locations = locations or {}
    issues = list_alert_issues(repo, token)
    if issues is None:
        # Transient API failure — do NOT prune issue state (a wipe would cause
        # duplicate notifications next run).
        print("Issue listing failed; leaving issue state unchanged.")
        return
    print(f"Checking {len(issues)} open issue(s) for alert watches...")

    active = set()
    processed = 0
    for it in issues:
        criteria = parse_alert_block(it.get("body", ""))
        if not criteria:
            continue
        if processed >= MAX_WATCHES_PER_RUN:
            print(f"  Reached per-run cap of {MAX_WATCHES_PER_RUN} watches; stopping.")
            break
        processed += 1
        number = it["number"]
        key = str(number)
        active.add(key)

        if criteria["end"] < today.isoformat():
            comment_issue(repo, token, number,
                          "⏰ This watch's dates have passed — closing it. "
                          "Open a new alert any time.")
            close_issue(repo, token, number)
            state.pop(key, None)
            continue

        matches = matches_for(dates, criteria, today)
        if not matches:
            continue

        subject, body = build_email(matches, criteria, locations)
        ok = send_mail([criteria["email"]], subject, body, cfg)
        sms_to = [r for r in recipients(criteria) if r != criteria["email"]]
        if sms_to:
            send_mail(sms_to, "", build_sms(matches, locations), cfg)

        sig = signature(matches)
        prev = state.get(key, {})
        if ok and prev.get("sig") != sig:
            comment_issue(repo, token, number,
                          f"🔔 Alerted **{criteria['email']}** — {body}")
        if ok:
            state[key] = {"sig": sig,
                          "notified_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        print(f"  #{number}: {len(matches)} match group(s){' (emailed)' if ok else ''}")

    # Prune state for issue keys (numeric) that are no longer open.
    for k in [k for k in state if k.isdigit() and k not in active]:
        state.pop(k, None)


def _run():
    report = load_json(REPORT_FILE, {})
    dates = report_dates(report)
    if not dates:
        print("No availability report; skipping alerts.")
        return 0
    # Per-park ids for building booking deep links (absent in older reports).
    locations = {}
    if isinstance(report, dict) and isinstance(report.get("metadata"), dict):
        locations = report["metadata"].get("locations") or {}

    state = load_json(STATE_FILE, {})
    today = date.today()

    # Free, no-registration channel — needs no secrets at all.
    publish_ntfy(dates, state, today)

    # Optional email/text channel (needs a GitHub token + email secrets).
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    cfg = email_config()
    if token and repo and cfg:
        process_email_watches(dates, state, today, token, repo, cfg, locations)
    else:
        print("Email/issue alerts not configured; ntfy push only.")

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    print("Done.")
    return 0


def main():
    # Alerts must never fail the scan workflow — swallow anything unexpected.
    try:
        return _run()
    except Exception as e:  # noqa: BLE001
        print(f"Alert step error (ignored): {e}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
