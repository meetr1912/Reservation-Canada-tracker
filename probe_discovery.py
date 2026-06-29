"""Enumeration probe: prove we can map ALL Parks Canada accommodations.

Dumps the type dictionaries (booking categories, resource categories) and the
national location list, then proves per-location resource enumeration. Run in
CI; read the log. Diagnostic only.
"""
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

BASE = "https://reservation.pc.gc.ca"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def en(localized, *keys):
    """Pull the en-CA value for the first matching key from a localizedValues list/dict."""
    if isinstance(localized, dict):  # {"en-CA": "..."}
        return localized.get("en-CA") or next(iter(localized.values()), "")
    if isinstance(localized, list):
        for lv in localized:
            if lv.get("cultureName") == "en-CA":
                for k in keys:
                    if lv.get(k):
                        return lv[k]
                return lv.get("name") or lv.get("shortName") or lv.get("displayName") or ""
    return ""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(user_agent=UA, locale="en-CA").new_page()
        page.goto(BASE, timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as ex:
            print("idle note:", ex)
        api = page.request

        def get(path):
            r = api.get(f"{BASE}{path}", timeout=30000)
            return r.status, (r.json() if r.ok else None)

        # 1) Booking categories (17)
        st, bc = get("/api/bookingcategories")
        print(f"\n===== /api/bookingcategories ({st}) =====")
        for c in sorted(bc or [], key=lambda x: x.get("bookingCategoryId", 0)):
            name = en(c.get("localizedValues"), "name")
            unit = en(c.get("localizedValues"), "unitName")
            print(f"  bookingCategoryId={c.get('bookingCategoryId')}: {name}  (unit: {unit})  "
                  f"resourceCategoryIds={c.get('allowedResourceCategoryIds')}")

        # 2) Resource categories (30) — the unit TYPES (oTENTik, yurt, cabin, ...)
        st, rc = get("/api/resourcecategory")
        print(f"\n===== /api/resourcecategory ({st}) =====")
        rc_names = {}
        for c in sorted(rc or [], key=lambda x: x.get("resourceCategoryId", 0)):
            nm = en(c.get("localizedValues"), "name")
            rc_names[c.get("resourceCategoryId")] = nm
            print(f"  resourceCategoryId={c.get('resourceCategoryId')}: {nm}  (resourceType={c.get('resourceType')})")

        # 3) National location list (114)
        st, rl = get("/api/resourceLocation")
        print(f"\n===== /api/resourceLocation ({st}) — {len(rl or [])} locations =====")
        from collections import Counter
        regions = Counter((x.get("regionCode") or x.get("region") or "?") for x in (rl or []))
        print("  by regionCode:", dict(regions))
        print("  sample locations:")
        for x in (rl or [])[:12]:
            print(f"    id={x.get('resourceLocationId')} rootMapId={x.get('rootMapId')} "
                  f"region={x.get('regionCode')} cats={x.get('resourceCategoryIds')} "
                  f"name={en(x.get('localizedValues'), 'fullName', 'shortName')}")

        # 4) Which locations offer roofed/prebuilt types? Match resource-category names.
        ROOFED = ("otentik", "yurt", "cabin", "rcabin", "equipped", "ready", "micro",
                  "goutte", "tente-roulotte", "cube", "tipi", "teepee")
        roofed_cat_ids = {cid for cid, nm in rc_names.items()
                          if any(w in (nm or "").lower() for w in ROOFED)}
        print(f"\n===== roofed/prebuilt resourceCategoryIds (by name match) =====")
        for cid in roofed_cat_ids:
            print(f"  {cid}: {rc_names[cid]}")
        locs_with_roofed = [x for x in (rl or [])
                            if set(x.get("resourceCategoryIds") or []) & roofed_cat_ids]
        print(f"  locations offering a roofed type: {len(locs_with_roofed)}")
        for x in locs_with_roofed[:20]:
            offered = [rc_names.get(c, c) for c in (x.get("resourceCategoryIds") or []) if c in roofed_cat_ids]
            print(f"    {en(x.get('localizedValues'), 'fullName','shortName')} "
                  f"(rl={x.get('resourceLocationId')}): {offered}")

        # 5) Prove per-location resource enumeration on a couple of roofed locations.
        print(f"\n===== /api/resourcelocation/resources proof =====")
        for x in locs_with_roofed[:3]:
            rid = x.get("resourceLocationId")
            st, res = get(f"/api/resourcelocation/resources?resourceLocationId={rid}")
            if isinstance(res, dict):
                items = list(res.items())
                print(f"  {en(x.get('localizedValues'),'shortName')} (rl={rid}): {len(items)} resources, sample:")
                for k, v in items[:4]:
                    nm = v.get("name") if isinstance(v, dict) else None
                    cat = v.get("resourceCategoryId") if isinstance(v, dict) else None
                    keys = sorted(v.keys()) if isinstance(v, dict) else type(v).__name__
                    print(f"     resourceId={k} name={nm} resourceCategoryId={cat} ({rc_names.get(cat)}) keys={keys}")
            else:
                print(f"  rl={rid}: unexpected {type(res).__name__}: {str(res)[:120]}")

        b.close()


if __name__ == "__main__":
    main()
