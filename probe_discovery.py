"""Discovery probe: learn how to enumerate the FULL Parks Canada accommodation
tree (parks -> sub-areas -> accommodation types -> resource ids).

Runs in CI (the reservation API is reachable there). It drives the booking
site, captures every /api/ and /rdr/ XHR the SPA makes, and prints each unique
endpoint with a snippet of its JSON so we can identify the maps tree, the
booking-category metadata, and the resource/search endpoints. Diagnostic only.
"""
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

BASE = "https://reservation.pc.gc.ca"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def summarize(body, limit=700):
    try:
        data = json.loads(body)
    except Exception:
        return f"<non-json {len(body)}b> {body[:150]!r}"
    if isinstance(data, list):
        head = data[0] if data else None
        keys = sorted(head.keys()) if isinstance(head, dict) else type(head).__name__
        return f"list[{len(data)}] item_keys={keys} sample={json.dumps(head)[:limit]}"
    if isinstance(data, dict):
        return f"dict keys={sorted(data)[:40]} sample={json.dumps(data)[:limit]}"
    return f"{type(data).__name__}: {str(data)[:limit]}"


def main():
    start = datetime.now() + timedelta(days=20)
    end = start + timedelta(days=2)
    s, e = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")

    seen = {}  # method+url(no query base) -> (status, url, snippet)

    def on_resp(resp):
        u = resp.url
        low = u.lower()
        if "/api/" not in low and "/rdr/" not in low:
            return
        key = resp.request.method + " " + u.split("?")[0]
        if key in seen:
            return
        try:
            body = resp.text()
        except Exception:
            body = ""
        seen[key] = (resp.status, u, summarize(body))

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(user_agent=UA, locale="en-CA")
        page = ctx.new_page()
        page.on("response", on_resp)

        def visit(url, label):
            print(f"\n>>> visiting: {label}")
            try:
                page.goto(url, timeout=60000)
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception as ex:
                print(f"   (load note: {ex})")
            page.wait_for_timeout(2500)

        # 1) Landing page — usually loads maps tree / config / booking categories.
        visit(BASE, "landing")
        # 2) "All locations" search — triggers resource/search XHRs.
        visit(f"{BASE}/create-booking/results?resourceLocationId=0&mapId=-2147483575"
              f"&searchTabGroupId=0&bookingCategoryId=0&startDate={s}&endDate={e}"
              f"&nights=2&isReserving=true", "all-locations search")
        # 3) An oTENTik category search (bookingCategoryId=4) to see resource shape.
        visit(f"{BASE}/create-booking/results?resourceLocationId=0&mapId=-2147483575"
              f"&searchTabGroupId=3&bookingCategoryId=4&startDate={s}&endDate={e}"
              f"&nights=2&isReserving=true", "oTENTik search")

        b.close()

    print("\n\n==================== CAPTURED /api/ + /rdr/ ENDPOINTS ====================")
    for key in sorted(seen):
        status, url, snip = seen[key]
        print(f"\n### {key}\n    status={status}\n    url={url}\n    {snip}")
    print(f"\nTotal unique endpoints: {len(seen)}")


if __name__ == "__main__":
    main()
