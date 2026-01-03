from playwright.sync_api import sync_playwright
import json

def test():
    base_url = "https://reservation.pc.gc.ca"
    # Fundy Headquarters site suggested by user
    resource_id = "-2147480411"
    loc_id = "-2147483643"
    map_id = "-2147483607"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        url = (
            f"{base_url}/create-booking/results?"
            f"resourceLocationId={loc_id}&"
            f"mapId={map_id}&"
            f"searchTabGroupId=2&"
            f"bookingCategoryId=4&"
            f"startDate=2026-04-01&"
            f"nights=1&"
            f"isReserving=true&"
            f"resourceId={resource_id}"
        )
        
        print(f"Navigating to: {url}")
        
        def catch_calendar(response):
            if "resourcedailyavailability" in response.url:
                print(f" INTERCEPTED CALENDAR: {response.url}")
                try:
                    data = response.json()
                    print(f" DATA KEYS (first 10): {list(data.keys())[:10]}")
                    avail = [k for k,v in data.items() if isinstance(v, dict) and v.get('availability') == 1]
                    print(f" FOUND {len(avail)} AVAILABLE DAYS.")
                    if avail:
                        print(f" SAMPLE DAY: {avail[0]} -> {data[avail[0]]}")
                except Exception as e:
                    print(f" FAILED TO PARSE JSON: {e}")
            return False

        page.on("response", catch_calendar)
        page.goto(url, timeout=60000)
        
        print("Waiting 15 seconds for interception...")
        page.wait_for_timeout(15000)
        
        browser.close()

if __name__ == "__main__":
    test()
