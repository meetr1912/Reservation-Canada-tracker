"""Unit tests for the network-free helpers in notify.py."""

import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import notify  # noqa: E402


def block(payload):
    return f"intro text\n```alert\n{json.dumps(payload)}\n```\ntrailing"


VALID = {"email": "a@b.com", "phone": "(555) 123-4567", "carrier": "msg.telus.com",
         "parks": ["Fundy - Headquarters"], "start": "2026-07-04", "end": "2026-07-06"}


def test_parse_valid_block_normalizes():
    c = notify.parse_alert_block(block(VALID))
    assert c["email"] == "a@b.com"
    assert c["phone"] == "5551234567"          # stripped to digits
    assert c["carrier"] == "msg.telus.com"
    assert c["parks"] == ["Fundy - Headquarters"]
    assert c["start"] == "2026-07-04" and c["end"] == "2026-07-06"


def test_parse_rejects_bad_email_and_dates():
    assert notify.parse_alert_block(block({**VALID, "email": "nope"})) is None
    assert notify.parse_alert_block(block({**VALID, "start": "2026-13-99"})) is None
    # end before start
    assert notify.parse_alert_block(block({**VALID, "start": "2026-07-10"})) is None


def test_parse_missing_block_returns_none():
    assert notify.parse_alert_block("no block here") is None
    assert notify.parse_alert_block("") is None


def test_parse_drops_unknown_carrier():
    c = notify.parse_alert_block(block({**VALID, "carrier": "evil.example.com"}))
    assert c["carrier"] == ""


def test_recipients_email_only_when_no_valid_carrier():
    c = notify.parse_alert_block(block({**VALID, "carrier": "evil.example.com", "phone": "5551234567"}))
    assert notify.recipients(c) == ["a@b.com"]


def test_recipients_adds_carrier_gateway():
    c = notify.parse_alert_block(block(VALID))
    assert notify.recipients(c) == ["a@b.com", "5551234567@msg.telus.com"]


REPORT = {
    "2026-07-03": [{"ParkName": "Fundy - Headquarters", "ResourceName": "O45", "status": False}],
    "2026-07-04": [
        {"ParkName": "Fundy - Headquarters", "ResourceName": "O45", "status": True},
        {"ParkName": "Kejimkujik", "ResourceName": "K1", "status": True},
    ],
    "2026-07-05": [{"ParkName": "Fundy - Headquarters", "ResourceName": "O46", "status": True}],
    "2026-07-09": [{"ParkName": "Fundy - Headquarters", "ResourceName": "O45", "status": True}],
}


def test_matches_respects_range_park_and_today():
    c = {"email": "a@b.com", "phone": "", "carrier": "",
         "parks": ["Fundy - Headquarters"], "start": "2026-07-04", "end": "2026-07-06"}
    m = notify.matches_for(REPORT, c, date(2026, 7, 1))
    assert m == [
        {"date": "2026-07-04", "park": "Fundy - Headquarters", "units": ["O45"]},
        {"date": "2026-07-05", "park": "Fundy - Headquarters", "units": ["O46"]},
    ]
    # 07-09 is outside [start,end]; Kejimkujik filtered out by park.


def test_matches_any_park_when_empty():
    c = {"email": "a@b.com", "phone": "", "carrier": "", "parks": [],
         "start": "2026-07-04", "end": "2026-07-04"}
    m = notify.matches_for(REPORT, c, date(2026, 7, 1))
    parks = sorted(x["park"] for x in m)
    assert parks == ["Fundy - Headquarters", "Kejimkujik"]


def test_matches_clamped_to_today():
    c = {"email": "a@b.com", "phone": "", "carrier": "", "parks": [],
         "start": "2026-07-01", "end": "2026-07-31"}
    m = notify.matches_for(REPORT, c, date(2026, 7, 6))
    # Only 07-09 remains (>= today 07-06); 07-04/05 are in the past.
    assert [x["date"] for x in m] == ["2026-07-09"]


def test_signature_changes_with_count():
    a = [{"date": "2026-07-04", "park": "P", "units": ["O45"]}]
    b = [{"date": "2026-07-04", "park": "P", "units": ["O45", "O46"]}]
    assert notify.signature(a) != notify.signature(b)
    assert notify.signature(a) == notify.signature(list(a))


def test_report_dates_handles_both_schemas():
    assert notify.report_dates({"dates": {"d": []}}) == {"d": []}
    flat = {"2026-07-04": []}
    assert notify.report_dates(flat) == flat
    assert notify.report_dates(None) == {}


def test_email_config_bad_port_falls_back(monkeypatch):
    monkeypatch.setenv("EMAIL_ADDRESS", "a@b.com")
    monkeypatch.setenv("EMAIL_PASSWORD", "pw")
    monkeypatch.setenv("SMTP_PORT", "not-a-number")
    assert notify.email_config()["port"] == 587


def test_main_preserves_state_when_listing_fails(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "alerts_state.json").write_text('{"5": {"sig": "x", "notified_at": "t"}}')
    (tmp_path / "availability_report.json").write_text(json.dumps(
        {"dates": {"2026-07-04": [{"ParkName": "P", "ResourceName": "O1", "status": True}]}}))
    monkeypatch.setenv("GITHUB_TOKEN", "t")
    monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
    monkeypatch.setenv("EMAIL_ADDRESS", "a@b.com")
    monkeypatch.setenv("EMAIL_PASSWORD", "pw")
    monkeypatch.setattr(notify, "list_alert_issues", lambda *a, **k: None)  # simulate API failure
    monkeypatch.setattr(notify, "post_ntfy", lambda *a, **k: True)  # avoid real network

    assert notify.main() == 0
    # The issue's state must be untouched (a wipe would cause duplicate alerts next run).
    saved = json.loads((tmp_path / "alerts_state.json").read_text())
    assert saved["5"] == {"sig": "x", "notified_at": "t"}


def test_main_failsoft_on_unexpected_error(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "t")
    monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
    monkeypatch.setenv("EMAIL_ADDRESS", "a@b.com")
    monkeypatch.setenv("EMAIL_PASSWORD", "pw")
    def boom(*a, **k):
        raise RuntimeError("kaboom")
    monkeypatch.setattr(notify, "report_dates", boom)
    assert notify.main() == 0  # never raises / never fails the workflow


def test_ntfy_topic_and_slug():
    assert notify.slugify_park("Fundy - Headquarters") == "fundy-headquarters"
    assert notify.slugify_park("Mkwesaqtuk/Cap-Rouge") == "mkwesaqtuk-cap-rouge"
    assert notify.ntfy_topic("Fundy - Headquarters") == f"{notify.NTFY_PREFIX}-fundy-headquarters"
    assert notify.ntfy_topic("all") == f"{notify.NTFY_PREFIX}-all"
    assert notify.ntfy_topic("") == f"{notify.NTFY_PREFIX}-all"


def test_park_open_dates_future_only():
    out = notify.park_open_dates(REPORT, date(2026, 7, 4))
    assert out["Fundy - Headquarters"] == ["2026-07-04", "2026-07-05", "2026-07-09"]
    assert out["Kejimkujik"] == ["2026-07-04"]
    # 07-03 is booked/false and excluded; nothing before today leaks in.


def test_publish_ntfy_posts_on_change_then_skips(monkeypatch):
    posts = []
    monkeypatch.setattr(notify, "post_ntfy", lambda t, ti, b: posts.append(t) or True)
    state = {}
    notify.publish_ntfy(REPORT, state, date(2026, 7, 4))
    first = list(posts)
    assert any(p.endswith("-fundy-headquarters") for p in first)
    assert any(p.endswith("-all") for p in first)
    assert "_ntfy" in state
    # Second run with unchanged data posts nothing new.
    posts.clear()
    notify.publish_ntfy(REPORT, state, date(2026, 7, 4))
    assert posts == []


def test_run_does_ntfy_without_email_config(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "availability_report.json").write_text(json.dumps({"dates": REPORT}))
    monkeypatch.delenv("EMAIL_ADDRESS", raising=False)
    monkeypatch.delenv("EMAIL_PASSWORD", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    posts = []
    monkeypatch.setattr(notify, "post_ntfy", lambda t, ti, b: posts.append(t) or True)
    assert notify.main() == 0
    assert posts  # ntfy push happened with zero secrets
    saved = json.loads((tmp_path / "alerts_state.json").read_text())
    assert "_ntfy" in saved


def test_build_email_and_sms_content():
    m = [{"date": "2026-07-04", "park": "Fundy - Headquarters", "units": ["O45", "O46"]}]
    subject, body = notify.build_email(m, VALID)
    assert "opening" in subject.lower()
    assert "oTENTik 45" in body and "Fundy - Headquarters" in body
    assert notify.BOOKING_URL in body  # falls back to home when no location ids
    sms = notify.build_sms(m)
    assert "oTENTik alert" in sms and notify.BOOKING_URL in sms


LOCATIONS = {"Fundy - Headquarters": {"t": -500, "r": -555, "m": -777, "b": 1}}


def test_booking_url_builds_deep_link():
    url = notify.booking_url(LOCATIONS["Fundy - Headquarters"], "2026-07-04")
    assert url.startswith("https://reservation.pc.gc.ca/create-booking/results?")
    assert "transactionLocationId=-500" in url
    assert "resourceLocationId=-555" in url and "mapId=-777" in url
    assert "startDate=2026-07-04" in url and "endDate=2026-07-05" in url
    assert "bookingCategoryId=1" in url


def test_booking_url_falls_back_without_ids():
    assert notify.booking_url(None, "2026-07-04") == notify.BOOKING_URL


def test_email_and_sms_include_per_opening_links():
    m = [{"date": "2026-07-04", "park": "Fundy - Headquarters", "units": ["O45"]}]
    _, body = notify.build_email(m, VALID, LOCATIONS)
    assert "create-booking/results?" in body
    assert "startDate=2026-07-04" in body
    sms = notify.build_sms(m, LOCATIONS)
    assert "create-booking/results?" in sms
