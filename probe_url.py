"""One-off probe: learn what a 'create-booking/results' deep link needs.

Goal: build a per-location, per-date URL that lands on the actual availability
results for that location, like the hand-copied example:

  /create-booking/results?transactionLocationId=…&resourceLocationId=…&mapId=…
    &searchTabGroupId=2&bookingCategoryId=1&startDate=…&endDate=…&nights=1&…

We don't reliably know which stored id maps to transactionLocationId / mapId,
so this dumps the live location + maps payloads for a couple of sample
locations and then loads candidate URLs in a real browser to see which
param set actually renders results. Read the output from the CI job log.

Run via the probe.yml workflow (workflow_dispatch). Not imported anywhere.
"""
import json
import sys
from datetime import date, timedelta

BASE = "https://reservation.pc.gc.ca"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def _get(api, path):
    r = api.get(f"{BASE}{path}", timeout=30000)
    return r.json() if r.ok else None


def show(label, obj, depth=0):
    print(f"\n===== {label} =====")
    print(json.dumps(obj, ensure_ascii=False, indent=2)[:4000])


def main():
    from playwright.sync_api import sync_playwright

    start = date.today() + timedelta(days=7)
    end = start + timedelta(days=1)
    sd, ed = start.isoformat(), end.isoformat()

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(user_agent=UA, locale="en-CA")
        page = ctx.new_page()
        print("Init session...")
        page.goto(BASE, timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as e:  # noqa: BLE001
            print("idle note:", e)
        api = page.request

        locations = _get(api, "/api/resourceLocation")
        bcs = _get(api, "/api/bookingcategories")
        if not locations:
            print("ABORT: no locations")
            return 1

        # Print the full field set of one location so we can see every id field
        # (rootMapId, placeId, parentId, transaction-ish ids, etc.).
        sample = locations[0]
        print("\nLOCATION OBJECT KEYS:", sorted(sample.keys()))
        show("FULL LOCATION[0]", sample)

        # Pick two locations that offer roofed units (have resourceCategoryIds).
        roofed = [l for l in locations if l.get("resourceCategoryIds")][:2]
        for loc in roofed:
            rl = loc.get("resourceLocationId")
            name = (loc.get("localizedValues") or [{}])
            print(f"\n######## LOCATION rl={rl} root={loc.get('rootMapId')} "
                  f"name={loc.get('localizedValues')}")
            print("  resourceCategoryIds:", loc.get("resourceCategoryIds"))
            print("  every key:val ->")
            for k, v in loc.items():
                if k == "localizedValues":
                    continue
                print(f"    {k} = {v}")

            maps = _get(api, f"/api/maps?resourceLocationId={rl}")
            if maps:
                print("  MAPS top-level type:", type(maps).__name__)
                if isinstance(maps, dict):
                    print("  MAPS keys:", sorted(maps.keys()))
                    show(f"MAPS for rl={rl}", maps)

        # Now test candidate deep links against the first roofed location.
        loc = roofed[0]
        rl = loc.get("resourceLocationId")
        root_map = loc.get("rootMapId")
        # find a bookingCategoryId valid for this location's categories
        rcids = set(loc.get("resourceCategoryIds") or [])
        bcid = 1
        for bc in (bcs or []):
            if set(bc.get("allowedResourceCategoryIds") or []) & rcids:
                bcid = bc.get("bookingCategoryId")
                break

        candidates = {
            "minimal_rl_map": (
                f"{BASE}/create-booking/results?resourceLocationId={rl}"
                f"&mapId={root_map}&searchTabGroupId=0&bookingCategoryId={bcid}"
                f"&startDate={sd}&endDate={ed}&nights=1&isReserving=true"
            ),
            "with_txn=rl": (
                f"{BASE}/create-booking/results?transactionLocationId={rl}"
                f"&resourceLocationId={rl}&mapId={root_map}&searchTabGroupId=0"
                f"&bookingCategoryId={bcid}&startDate={sd}&endDate={ed}"
                f"&nights=1&isReserving=true"
                f"&peopleCapacityCategoryCounts=%5B%5B-32767,null,1,null%5D%5D"
                f"&flexibleSearch=%5Bfalse,false,null,1%5D"
            ),
        }
        for label, url in candidates.items():
            print(f"\n----- NAV {label} -----\n{url}")
            try:
                page.goto(url, timeout=45000)
                page.wait_for_load_state("networkidle", timeout=20000)
            except Exception as e:  # noqa: BLE001
                print("  nav note:", e)
            print("  final url:", page.url)
            body = (page.inner_text("body") or "")[:600].replace("\n", " | ")
            print("  body snippet:", body)

        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
