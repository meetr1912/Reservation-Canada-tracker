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
from datetime import date, datetime, timezone
from email.message import EmailMessage

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


def build_email(matches, criteria):
    """Return (subject, text_body) for a match set."""
    n_days = len({m["date"] for m in matches})
    n_slots = sum(len(m["units"]) for m in matches)
    subject = f"🏕️ {n_slots} oTENTik opening(s) on {n_days} watched day(s)"
    lines = ["Good news — openings matching your watch:\n"]
    for m in matches:
        units = ", ".join(_pretty_unit(u) for u in m["units"])
        lines.append(f"• {m['date']} — {m['park']}: {units}")
    lines.append(f"\nBook now: {BOOKING_URL}")
    lines.append("\nTo stop these alerts, close your alert issue on GitHub.")
    return subject, "\n".join(lines)


def build_sms(matches):
    """Short text for SMS gateways."""
    n_slots = sum(len(m["units"]) for m in matches)
    first = matches[0]
    extra = f" +{len(matches) - 1} more" if len(matches) > 1 else ""
    return (f"oTENTik alert: {n_slots} open. {first['date']} {first['park']}"
            f"{extra}. Book: {BOOKING_URL}")


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
    issues = []
    url = f"{API}/repos/{repo}/issues"
    params = {"state": "open", "per_page": 100}
    try:
        r = requests.get(url, headers=gh_headers(token), params=params, timeout=30)
        r.raise_for_status()
        for it in r.json():
            if "pull_request" in it:  # issues endpoint also returns PRs
                continue
            issues.append(it)
    except requests.RequestException as e:
        print(f"  Could not list issues: {e}")
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
    return {
        "address": address,
        "password": password,
        "server": os.environ.get("SMTP_SERVER", "smtp.gmail.com").strip(),
        "port": int(os.environ.get("SMTP_PORT", "587") or "587"),
    }


def main():
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not token or not repo:
        print("No GITHUB_TOKEN/GITHUB_REPOSITORY; skipping alerts.")
        return 0

    cfg = email_config()
    if not cfg:
        print("EMAIL_ADDRESS/EMAIL_PASSWORD not set; skipping alert emails.")
        return 0

    dates = report_dates(load_json(REPORT_FILE, {}))
    if not dates:
        print("No availability report; skipping alerts.")
        return 0

    state = load_json(STATE_FILE, {})
    today = date.today()
    issues = list_alert_issues(repo, token)
    print(f"Checking {len(issues)} open issue(s) for alert watches...")

    active = set()
    for it in issues:
        number = it["number"]
        criteria = parse_alert_block(it.get("body", ""))
        if not criteria:
            continue
        key = str(number)
        active.add(key)

        # Expire watches whose window has fully passed.
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

        subject, body = build_email(matches, criteria)
        ok = send_mail([criteria["email"]], subject, body, cfg)
        sms_to = [r for r in recipients(criteria) if r != criteria["email"]]
        if sms_to:
            send_mail(sms_to, "", build_sms(matches), cfg)

        sig = signature(matches)
        prev = state.get(key, {})
        if ok and prev.get("sig") != sig:
            comment_issue(repo, token, number,
                          f"🔔 Alerted **{criteria['email']}** — {body}")
        if ok:
            state[key] = {"sig": sig,
                          "notified_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        print(f"  #{number}: {len(matches)} match group(s){' (emailed)' if ok else ''}")

    # Drop state for issues no longer open/active.
    state = {k: v for k, v in state.items() if k in active}
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
