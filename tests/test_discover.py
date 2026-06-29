"""Unit tests for the network-free helpers in discover.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import discover  # noqa: E402


RESOURCE_CATEGORIES = [
    {"resourceCategoryId": -101, "resourceType": 0,
     "localizedValues": [{"cultureName": "en-CA", "name": "Campsite"}]},
    {"resourceCategoryId": -102, "resourceType": 0,
     "localizedValues": [{"cultureName": "en-CA", "name": "oTENTik"}]},
    {"resourceCategoryId": -103, "resourceType": 0,
     "localizedValues": [{"cultureName": "en-CA", "name": "Yurt"}]},
    {"resourceCategoryId": -104, "resourceType": 0,
     "localizedValues": [{"cultureName": "en-CA", "name": "Rustic Cabin"}]},
    # Backcountry yurt is resourceType 3 -> excluded.
    {"resourceCategoryId": -105, "resourceType": 3,
     "localizedValues": [{"cultureName": "en-CA", "name": "Backcountry Yurt"}]},
]

BOOKING_CATEGORIES = [
    {"bookingCategoryId": 1, "allowedResourceCategoryIds": [-101]},
    {"bookingCategoryId": 4, "allowedResourceCategoryIds": [-102, -103, -104]},
]


def test_roofed_category_ids_selects_only_frontcountry_roofed():
    rc = discover.roofed_category_ids(RESOURCE_CATEGORIES)
    assert rc == {-102: "oTENTik", -103: "Yurt", -104: "Rustic Cabin"}
    assert -101 not in rc  # plain campsite excluded
    assert -105 not in rc  # backcountry (resourceType 3) excluded


def test_booking_category_map_inverts_allowed_ids():
    m = discover.booking_category_map(BOOKING_CATEGORIES)
    assert m[-102] == 4 and m[-103] == 4 and m[-104] == 4
    assert m[-101] == 1


def test_unit_name_prefers_localized_then_falls_back():
    assert discover.unit_name({"localizedValues": [{"cultureName": "en-CA", "name": "O45"}]}) == "O45"
    assert discover.unit_name({"resourceModel": "Yurt 3", "order": 7}) == "Yurt 3"
    assert discover.unit_name({"order": 7}) == "7"


def test_build_records_filters_and_shapes():
    rc = discover.roofed_category_ids(RESOURCE_CATEGORIES)
    bc = discover.booking_category_map(BOOKING_CATEGORIES)
    location = {
        "resourceLocationId": -555,
        "localizedValues": [{"cultureName": "en-CA", "shortName": "Fundy - HQ",
                             "fullName": "Fundy - Headquarters"}],
    }
    resources = {
        "a": {"resourceId": -900, "resourceCategoryId": -102,
              "localizedValues": [{"cultureName": "en-CA", "name": "O45"}]},
        "b": {"resourceId": -901, "resourceCategoryId": -101,  # campsite -> dropped
              "localizedValues": [{"cultureName": "en-CA", "name": "C12"}]},
        "c": {"resourceId": -902, "resourceCategoryId": -103, "order": 2,
              "localizedValues": []},
    }
    recs = discover.build_records(resources, location, rc, bc)
    assert len(recs) == 2  # campsite dropped
    otentik = next(r for r in recs if r["NegativeResourceValue"] == -900)
    assert otentik == {
        "ParkName": "Fundy - HQ", "PageTitle": None, "ResourceName": "O45",
        "NegativeResourceValue": -900, "Type": "oTENTik",
        "ResourceCategoryId": -102, "BookingCategoryId": 4,
        "ResourceLocationId": -555,
    }
    yurt = next(r for r in recs if r["NegativeResourceValue"] == -902)
    assert yurt["Type"] == "Yurt" and yurt["BookingCategoryId"] == 4
