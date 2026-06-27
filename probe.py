"""Diagnostic: dump REAL Parks Canada availability API responses so we can see
what the fields actually mean. Run in CI (the API is reachable there), read the
job log, then fix scraper.py accordingly. Not part of the normal pipeline.
"""
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

BASE = "https://reservation.pc.gc.ca"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def pick(oten, substr):
    for o in oten:
        if substr.lower() in o["ParkName"].lower():
            return o
    return None


def dump(api, target, s, e):
    rid = target["NegativeResourceValue"]
    url = (f"{BASE}/api/availability/resourcedailyavailability?resourceId={rid}"
           f"&bookingCategoryId=4&startDate={s}&endDate={e}&isReserving=true")
    print(f"\n\n===== {target['ParkName']} / {target['ResourceName']} ({rid}) =====")
    print("URL:", url)
    r = api.get(url)
    print("HTTP", r.status)
    try:
        data = r.json()
    except Exception as ex:
        print("JSON parse failed:", ex)
        print(r.text()[:1500])
        return
    print("top-level type:", type(data).__name__)
    if isinstance(data, dict):
        keyset = set()
        avcount = {}
        compact = {}
        for k, v in data.items():
            day = k.split("T")[0]
            if isinstance(v, dict):
                keyset |= set(v.keys())
                av = v.get("availability")
                avcount[av] = avcount.get(av, 0) + 1
                compact[day] = {kk: v.get(kk) for kk in v}
            else:
                compact[day] = v
        print("per-date detail keys:", sorted(keyset))
        print("availability value counts:", avcount)
        # Print each date with weekday so we can eyeball weekend patterns.
        print("date -> detail (weekday):")
        for day in sorted(compact):
            try:
                wd = datetime.strptime(day, "%Y-%m-%d").strftime("%a")
            except Exception:
                wd = "?"
            print(f"  {day} {wd}: {json.dumps(compact[day])}")
    else:
        print(json.dumps(data, indent=2)[:6000])


def main():
    oten = json.load(open("otentiks.json"))
    targets = [t for t in (pick(oten, "Fundy"),
                           pick(oten, "Cape Breton"),
                           pick(oten, "Kouchibouguac")) if t]
    start = datetime.now()
    end = start + timedelta(days=21)
    s, e = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    print(f"Scan window {s} .. {e}; today is {start.strftime('%Y-%m-%d %a')}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA)
        page = ctx.new_page()

        captured = []

        def on_resp(resp):
            u = resp.url
            if ("availab" in u.lower() or "/api/" in u.lower()
                    or "/rdr/" in u.lower() or "grid" in u.lower()):
                captured.append((resp.status, resp.request.method, u))
        page.on("response", on_resp)

        print("Loading site to establish session...")
        page.goto(BASE, timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as ex:
            print("networkidle timeout (ok):", ex)

        api = page.request
        for t in targets:
            dump(api, t, s, e)

        print("\n\n===== availability-ish XHR seen during page load =====")
        for st, method, u in captured[:40]:
            print(st, method, u)

        browser.close()


if __name__ == "__main__":
    main()
