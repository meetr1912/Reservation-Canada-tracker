"""Unit tests for the pure (network-free) scraper helpers."""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import scraper  # noqa: E402


OTENTIKS = [
    {"ParkName": "Fundy - Headquarters", "PageTitle": "#34 - 58",
     "ResourceName": "O45", "NegativeResourceValue": -1},
    {"ParkName": "Fundy - Headquarters", "PageTitle": "#34 - 58",
     "ResourceName": "O46", "NegativeResourceValue": -2},
    {"ParkName": "Kejimkujik", "PageTitle": "#1 - 10",
     "ResourceName": "K01", "NegativeResourceValue": -3},
]

START = datetime(2026, 6, 27)


def test_load_otentiks_real_file_has_expected_shape():
    units = scraper.load_otentiks()
    assert isinstance(units, list) and len(units) == 122
    for unit in units:
        assert {"ParkName", "PageTitle", "ResourceName", "NegativeResourceValue"} <= unit.keys()


def test_build_report_top_level_schema():
    report = build()
    assert set(report.keys()) == {"metadata", "history", "dates"}


def test_build_report_dates_and_units():
    report = build(days=5)
    assert len(report["dates"]) == 5
    for sites in report["dates"].values():
        assert len(sites) == len(OTENTIKS)
        for site in sites:
            assert set(site.keys()) == {"ParkName", "PageTitle", "ResourceName", "Type", "status"}


def test_type_propagates_and_defaults():
    units = [
        {"ParkName": "P", "PageTitle": None, "ResourceName": "Y1",
         "NegativeResourceValue": -1, "Type": "Yurt"},
        {"ParkName": "P", "PageTitle": None, "ResourceName": "O1",
         "NegativeResourceValue": -2},  # no Type -> defaults to oTENTik
    ]
    report = scraper.build_report(units, set(), START, days=1,
                                  generated_at="2026-06-27T00:00:00Z")
    sites = report["dates"]["2026-06-27"]
    types = {s["ResourceName"]: s["Type"] for s in sites}
    assert types == {"Y1": "Yurt", "O1": "oTENTik"}
    assert report["metadata"]["types"] == ["Yurt", "oTENTik"]


def test_status_reflects_available_set():
    available = {(-1, "2026-06-27"), (-3, "2026-06-28")}
    report = build(available_set=available, days=3)
    statuses = {
        (s["ResourceName"], d): s["status"]
        for d, sites in report["dates"].items() for s in sites
    }
    assert statuses[("O45", "2026-06-27")] is True
    assert statuses[("K01", "2026-06-28")] is True
    assert statuses[("O46", "2026-06-27")] is False


def test_metadata_counts():
    available = {(-1, "2026-06-27"), (-2, "2026-06-27"), (-3, "2026-06-28")}
    meta = build(available_set=available, days=3)["metadata"]
    assert meta["total_units"] == 3
    assert meta["total_parks"] == 2
    assert meta["total_available_slots"] == 3
    assert meta["available_days"] == 2
    assert meta["available_units"] == 3
    assert meta["start_date"] == "2026-06-27"
    assert meta["end_date"] == "2026-06-29"


def test_history_appends_and_dedupes_by_date():
    prior = [{"date": "2026-06-26", "available_slots": 5,
              "available_units": 2, "available_days": 1}]
    report = build(prior_history=prior, generated_at="2026-06-27T00:00:00Z")
    dates = [h["date"] for h in report["history"]]
    assert dates == ["2026-06-26", "2026-06-27"]

    # Re-running on the same day replaces, not duplicates, the entry.
    report2 = build(prior_history=report["history"],
                    generated_at="2026-06-27T12:00:00Z")
    assert [h["date"] for h in report2["history"]] == ["2026-06-26", "2026-06-27"]


def test_history_is_trimmed_to_limit():
    prior = [{"date": f"2026-01-{i:02d}", "available_slots": i,
              "available_units": 0, "available_days": 0}
             for i in range(1, 31)]
    big_limit = scraper.HISTORY_LIMIT
    scraper.HISTORY_LIMIT = 10
    try:
        report = build(prior_history=prior, generated_at="2026-06-27T00:00:00Z")
        assert len(report["history"]) == 10
        assert report["history"][-1]["date"] == "2026-06-27"
    finally:
        scraper.HISTORY_LIMIT = big_limit


def test_always_available_parks_flags_only_fully_open_parks():
    roster = [
        {"ParkName": "Alpha", "PageTitle": "a", "ResourceName": "A1", "NegativeResourceValue": -10},
        {"ParkName": "Beta", "PageTitle": "b", "ResourceName": "B1", "NegativeResourceValue": -20},
    ]
    # Alpha open all days; Beta open only day 1.
    available = {(-10, "2026-06-27"), (-10, "2026-06-28"),
                 (-20, "2026-06-27")}
    report = scraper.build_report(roster, available, START, days=2,
                                  generated_at="2026-06-27T00:00:00Z")
    assert report["metadata"]["always_available_parks"] == ["Alpha"]


def test_collect_available_dict_and_list_forms():
    # availability == 0 means OPEN/bookable; 1 means booked.
    out = set()
    scraper._collect_available(
        {"2026-06-27T00:00:00": {"availability": 0},
         "2026-06-28T00:00:00": {"availability": 1}},
        -1, START, out)
    assert out == {(-1, "2026-06-27")}

    out2 = set()
    scraper._collect_available(
        [{"availability": 1}, {"availability": 0}], -2, START, out2)
    assert out2 == {(-2, "2026-06-28")}


def test_collect_available_ignores_non_open_codes():
    out = set()
    scraper._collect_available(
        [{"availability": 1}, {"availability": None}, {"availability": 5}],
        -9, START, out)
    assert out == set()


def build(available_set=None, days=3, prior_history=None, generated_at="2026-06-27T00:00:00Z"):
    return scraper.build_report(
        OTENTIKS,
        available_set or set(),
        START,
        days=days,
        prior_history=prior_history,
        generated_at=generated_at,
    )
