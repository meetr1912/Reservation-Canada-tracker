"""Enumerate all Parks Canada roofed/prebuilt accommodations nationwide.

Builds resources.json — the national roster of bookable roofed units (oTENTik,
Yurt, Cabin, Rustic Cabin, Ôasis, MicrOcube, Equipped Camping, Teepee,
Prospector Tent) across every park — from the booking site's JSON discovery
API. See docs/ACCOMMODATION_DISCOVERY.md.

Each record matches the scraper's expected shape plus type metadata:
    {ParkName, PageTitle, ResourceName, NegativeResourceValue,
     Type, ResourceCategoryId, BookingCategoryId, ResourceLocationId,
     TransactionLocationId, MapId}

TransactionLocationId (park-level) + ResourceLocationId (sub-area) + MapId
(rootMapId) are the ids a create-booking/results deep link needs.

Pure helpers (build_* / *_map / pick_*) are network-free and unit-tested; the
network walk uses Playwright (the site blocks plain requests).
"""
import json
import os
import sys
from datetime import datetime

BASE = "https://reservation.pc.gc.ca"
ROSTER_FILE = "resources.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Frontcountry roofed/prebuilt types we support (matched by name on
# resourceType==0 categories, so it survives id changes). Backcountry
# cabin/yurt (resourceType==3) use a different model and are excluded for now.
ROOFED_KEYWORDS = (
    "otentik", "yurt", "cabin", "oasis", "ôasis", "microcube",
    "equipped", "teepee", "tipi", "prospector", "ready-to-camp", "goutte",
)


def en_name(localized, *keys):
    """Return the en-CA value for the first present key in a localizedValues list/dict."""
    if isinstance(localized, dict):
        return localized.get("en-CA") or next(iter(localized.values()), "")
    if isinstance(localized, list):
        chosen = None
        for lv in localized:
            if lv.get("cultureName") == "en-CA":
                chosen = lv
                break
        chosen = chosen or (localized[0] if localized else {})
        for k in keys:
            if chosen.get(k):
                return chosen[k]
        for k in ("name", "shortName", "fullName", "displayName"):
            if chosen.get(k):
                return chosen[k]
    return ""


def roofed_category_ids(resourcecategories):
    """{resourceCategoryId: TypeName} for supported roofed/prebuilt types."""
    out = {}
    for c in resourcecategories or []:
        if c.get("resourceType") != 0:
            continue
        name = en_name(c.get("localizedValues"), "name")
        if any(w in (name or "").lower() for w in ROOFED_KEYWORDS):
            out[c.get("resourceCategoryId")] = name
    return out


def booking_category_map(bookingcategories):
    """{resourceCategoryId: bookingCategoryId}. First booking category wins."""
    out = {}
    for bc in bookingcategories or []:
        bid = bc.get("bookingCategoryId")
        for rcid in bc.get("allowedResourceCategoryIds") or []:
            out.setdefault(rcid, bid)
    return out


def unit_name(resource):
    """Human label for a unit, e.g. 'O45' / 'Yurt 3'."""
    nm = en_name(resource.get("localizedValues"), "name")
    if nm:
        return nm
    rm = resource.get("resourceModel")
    return str(rm) if rm not in (None, "") else str(resource.get("order", ""))


def build_records(resources, location, rc_names, bc_map):
    """Roofed-unit records for one location's /resources payload."""
    park = en_name(location.get("localizedValues"), "shortName", "fullName")
    rl_id = location.get("resourceLocationId")
    txn_id = location.get("transactionLocationId")
    map_id = location.get("rootMapId")
    records = []
    for res in (resources or {}).values():
        if not isinstance(res, dict):
            continue
        rcid = res.get("resourceCategoryId")
        if rcid not in rc_names:
            continue
        records.append({
            "ParkName": park,
            "PageTitle": None,
            "ResourceName": unit_name(res),
            "NegativeResourceValue": res.get("resourceId"),
            "Type": rc_names[rcid],
            "ResourceCategoryId": rcid,
            "BookingCategoryId": bc_map.get(rcid),
            "ResourceLocationId": rl_id,
            "TransactionLocationId": txn_id,
            "MapId": map_id,
        })
    return records


# --------------------------------------------------------------------------- #

def _session_get(api, path):
    r = api.get(f"{BASE}{path}", timeout=30000)
    return r.json() if r.ok else None


def main():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(user_agent=UA, locale="en-CA").new_page()
        print("Initializing session...")
        page.goto(BASE, timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as e:  # noqa: BLE001
            print(f"  idle note: {e}")
        api = page.request

        rcs = _session_get(api, "/api/resourcecategory")
        bcs = _session_get(api, "/api/bookingcategories")
        locations = _session_get(api, "/api/resourceLocation")
        if not (rcs and bcs and locations):
            print("ABORT: could not load discovery dictionaries; leaving roster unchanged.")
            b.close()
            return 1

        rc_names = roofed_category_ids(rcs)
        bc_map = booking_category_map(bcs)
        print(f"Roofed types: {sorted(rc_names.values())}")

        roofed_ids = set(rc_names)
        targets = [loc for loc in locations
                   if set(loc.get("resourceCategoryIds") or []) & roofed_ids]
        print(f"{len(targets)} of {len(locations)} locations offer a roofed type.")

        records, errors = [], []
        for i, loc in enumerate(targets):
            rl = loc.get("resourceLocationId")
            name = en_name(loc.get("localizedValues"), "shortName")
            res = _session_get(api, f"/api/resourcelocation/resources?resourceLocationId={rl}")
            if not isinstance(res, dict):
                errors.append(name)
                print(f"  [{i+1}/{len(targets)}] {name}: no resources")
                continue
            recs = build_records(res, loc, rc_names, bc_map)
            records.extend(recs)
            print(f"  [{i+1}/{len(targets)}] {name}: {len(recs)} roofed units")
        b.close()

    if not records:
        print("ABORT: zero roofed units found; leaving roster unchanged.")
        return 1

    records.sort(key=lambda r: (r["ParkName"] or "", r["Type"] or "", str(r["ResourceName"])))
    with open(ROSTER_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    from collections import Counter
    by_type = Counter(r["Type"] for r in records)
    by_park = Counter(r["ParkName"] for r in records)
    print(f"\nWrote {ROSTER_FILE}: {len(records)} units across {len(by_park)} locations.")
    print("By type:", dict(by_type))
    print(f"Errors: {len(errors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
