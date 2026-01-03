from playwright.sync_api import sync_playwright
import json
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        )
        page = context.new_page()
        
        # 1. Go to Home to get cookies?
        try:
            page.goto("https://reservation.pc.gc.ca/create-booking", timeout=60000)
            print("Loaded home.")
            
            # 2. Pick a known ID for "Banff - Two Jack Lakeside" or "Kejimkujik"
            # From previous logs: Kejimkujik - Jeremy's Bay (-2147483587)
            # Or Forillon - Des-Rosiers (-2147483625)
            
            park_id = -2147483587 # Kejimkujik
            
            # Try Booking Category 1 and 4
            # 1: Camping, 4: Accommodations (Hypothesis)
            
            # Construct Search URL
            # https://reservation.pc.gc.ca/create-booking/results?resourceLocationId=-2147483587&bookingCategoryId=4&startDate=2024-07-01&isReserving=true
            
            # We need a future date for availability
            import datetime
            future_date = (datetime.datetime.now() + datetime.timedelta(days=90)).strftime("%Y-%m-%d")
            
            search_url = f"https://reservation.pc.gc.ca/create-booking/results?resourceLocationId={park_id}&bookingCategoryId=4&startDate={future_date}&isReserving=true"
            
            print(f"Navigating to: {search_url}")
            
            # Setup Response Listener
            def handle_response(response):
                if "api/availability/map" in response.url and response.status == 200:
                    print("Intercepted MAP response!")
                    try:
                        data = response.json()
                        print(f"Keys: {list(data.keys())}")
                        if 'mapLinkAvailabilities' in data:
                             print(f"Items found: {len(data['mapLinkAvailabilities'])}")
                             print(f"Sample: {list(data['mapLinkAvailabilities'].items())[0]}")
                    except:
                        pass
                        
                if "api/availability/grid" in response.url:
                    print("Intercepted GRID response!")

            page.on("response", handle_response)
            
            page.goto(search_url, timeout=60000)
            
            # Wait for data
            page.wait_for_timeout(15000)
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
