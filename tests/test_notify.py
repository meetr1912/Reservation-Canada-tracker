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


def test_build_email_and_sms_content():
    m = [{"date": "2026-07-04", "park": "Fundy - Headquarters", "units": ["O45", "O46"]}]
    subject, body = notify.build_email(m, VALID)
    assert "opening" in subject.lower()
    assert "oTENTik 45" in body and "Fundy - Headquarters" in body
    assert notify.BOOKING_URL in body
    sms = notify.build_sms(m)
    assert "oTENTik alert" in sms and notify.BOOKING_URL in sms
