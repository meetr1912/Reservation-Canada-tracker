"""Diagnostic: investigate Grand-Pré's always-open data. Dumps the real API
response for a Grand-Pré resource across several bookingCategoryIds, plus a
Fundy control, so we can tell whether the data is real or a category quirk.
Manual dispatch only; removed after the scraper is corrected.
"""
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

BASE = "https://reservation.pc.gc.ca"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

TARGETS = [
    ("Grand-Pré unit 1", -2147480682),
    ("Fundy HQ O45 (control)", -2147480485),
]
CATEGORIES = [4, 1, 2, 3, 5, 6, 7, 8, 9]


def main():
    start = datetime.now()
    end = start + timedelta(days=21)
    s, e = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    print(f"window {s}..{e} (today {start:%a})")

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(user_agent=UA, locale="en-CA").new_page()
        pg.goto(BASE, timeout=60000)
        try:
            pg.wait_for_load_state("networkidle", timeout=20000)
        except Exception as ex:
            print("idle ok:", ex)
        api = pg.request

        for label, rid in TARGETS:
            print(f"\n\n===== {label} ({rid}) =====")
            for cat in CATEGORIES:
                url = (f"{BASE}/api/availability/resourcedailyavailability?"
                       f"resourceId={rid}&bookingCategoryId={cat}"
                       f"&startDate={s}&endDate={e}&isReserving=true")
                try:
                    r = api.get(url, timeout=30000)
                    if not r.ok:
                        print(f"  cat {cat}: HTTP {r.status}")
                        continue
                    data = r.json()
                    if isinstance(data, list):
                        avs = [d.get("availability") if isinstance(d, dict) else d for d in data]
                        from collections import Counter
                        print(f"  cat {cat}: list[{len(avs)}] availability counts={dict(Counter(avs))} first10={avs[:10]}")
                    elif isinstance(data, dict):
                        print(f"  cat {cat}: dict keys={list(data)[:5]} sample={json.dumps(data)[:200]}")
                    else:
                        print(f"  cat {cat}: {type(data).__name__} {str(data)[:120]}")
                except Exception as ex:
                    print(f"  cat {cat}: error {ex}")
        b.close()


if __name__ == "__main__":
    main()
