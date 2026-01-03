import requests
import json
import time
import argparse
import sys
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from mailer import send_email
from playwright.sync_api import sync_playwright

class ParksCanadaTracker:
    BASE_URL = "https://reservation.pc.gc.ca"
    OTENTIK_CATEGORY_ID = -2147483643
    INVENTORY_FILE = "otentik_inventory.json"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        })

    def discover(self):
        """Phase 1: Deep Discovery of all oTENTik Site IDs."""
        print("Starting Deep Discovery Phase...")
        
        sites_inventory = []
        
        with sync_playwright() as p:
            # Phase 1: Interactive browser (headless=False) to ensure we pass WAF/Bot detection
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            )
            page = context.new_page()
            
            try:
                # Go to the booking page directly to ensure app context
                page.goto(f"{self.BASE_URL}/create-booking", timeout=60000)
                try:
                    page.wait_for_load_state("networkidle", timeout=10000)
                except:
                    pass
                # Check for Queue-It
                print(f"Current URL: {page.url}")
                if "queue-it" in page.url:
                    print("Queue-It detected! Waiting...")
                    try:
                        # Wait for queue to finish (redirect back)
                        # This might take a long time, but for testing let's wait a bit or try to proceed if it's just a check
                        page.wait_for_url("**/create-booking**", timeout=300000) # 5 minutes wait
                        print("Passed Queue-It.")
                    except:
                        print("Timed out waiting for Queue-It.")
                
                # Double check URL
                print(f"URL before fetch: {page.url}")

                # 1. Fetch Parks
                print("Fetching all parks...")
                
                # DEBUG: Fetch Booking Categories to ensure we use the right one
                cats = self._fetch_json(page, '/api/reference/bookingCategory')
                if cats and isinstance(cats, list):
                    with open("categories.txt", "w") as f:
                        for c in cats:
                            f.write(f"{c.get('bookingCategoryId')}: {self._get_name(c)}\n")
                    print("Saved categories.txt")
                    # return # EXIT for debug
                
                parks = []
                for attempt in range(3):
                    parks = self._fetch_json(page, '/api/resourceLocation')
                    if parks:
                        break
                    print(f"Fetch attempt {attempt+1} failed. Retrying...")
                    time.sleep(2)
                
                if not parks or not isinstance(parks, list):
                    print(f"Failed to fetch parks (invalid format). Content: {parks}")
                    return

                # Filter parks that MIGHT have oTENTiks (optimization)
                potential_parks = [
                    p for p in parks 
                    if isinstance(p, dict) and p.get('resourceCategoryIds') and self.OTENTIK_CATEGORY_ID in p['resourceCategoryIds']
                ]
                
                # DEBUG: Limit for testing if needed, otherwise run all
                potential_parks = [p for p in potential_parks if "Fundy" in self._get_name(p)]
                
                print(f"Found {len(potential_parks)} parks with potential oTENTiks.")

                # 2. Deep Dive into each Park
                for park in potential_parks:
                    park_name = self._get_name(park)
                    park_id = park['resourceLocationId']
                    print(f"Analyzing {park_name} ({park_id})...")
                    
                    # Fetch resources for this park
                    resources = self._fetch_json(page, f'/api/resourcelocation/resources?resourceLocationId={park_id}')
                    print(f"    Fetched resources: {type(resources)} count={len(resources) if isinstance(resources, list) else 'N/A'}")
                    
                    if not resources or not isinstance(resources, list):
                        print("    Warning: Resources not a list or empty. Falling back to park as campground.")
                        resources = []
                        
                    # Find Campground Maps
                    # Usually "Place" or specific map types. We need to find the 'root' map IDs or iterate campgrounds.
                    # We look for resources that are "Maps" or "Campgrounds" and seem to contain oTENTiks.
                    # A better approach for "Deep" discovery is to look for the actual UNITS if they are listed in resources,
                    # OR if we need to call /api/availability/map to see the units.
                    
                    # Strategy: 
                    # Many times, the 'resources' list DOES NOT contain individual sites. 
                    # We must use the map/grid API to find them.
                    
                    # Let's find the sub-locations (Campgrounds)
                    # Use isinstance check to match objects
                    campgrounds = [r for r in resources if isinstance(r, dict) and r.get('resourceLocationId')]
                    
                    # DEBUG: Check if sites are in the resource list itself
                    for r in resources:
                         if isinstance(r, dict) and r.get('resourceCategoryId') == self.OTENTIK_CATEGORY_ID:
                             # Found a direct unit!
                             site_name = self._get_name(r)
                             # Avoid formatting duplicates if possible
                             print(f"    Found direct site: {site_name}")
                             sites_inventory.append({
                                "park": park_name,
                                "campground": park_name, # If at park level
                                "resourceId": r.get('resourceId'),
                                "siteName": site_name
                             })

                    # If no sub-locations, treat park as the campground
                    if not campgrounds:
                        campgrounds = [park]

                    print(f"    Park: {park_name} has {len(campgrounds)} sub-locations.")
                    for camp in campgrounds:
                        camp_name = self._get_name(camp)
                        
                        # We need valid mapId and resourceLocationId
                        r_loc_id = camp.get('resourceLocationId')
                        map_id = camp.get('mapId', camp.get('rootMapId', r_loc_id))
                        
                        print(f"    Checking {camp_name} (ID: {r_loc_id}, Map: {map_id})")
                        
                        if not r_loc_id:
                            print(f"    Skipping {camp_name}: No resourceLocationId")
                            continue
                        # If map_id is missing, we might still be able to use just resourceLocationId?
                        # But the Map API usually needs a MapId.
                        # For Kejimkujik main park, maybe it has one?
                        
                        if not map_id:
                             print(f"    Warning: No Map ID for {camp_name}, trying with just Location ID.")
                             # continue 

                        # Use User-validated parameters from logs
                        # Booking Category 1 (Camping) seems standard even for oTENTiks (which are a unit type)
                        # We might need to filter results later, but for discovery we want everything.
                        
                        try:
                            # Strategy: Navigate to UI and intercept map response
                            future_date = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
                            
                            # Construct Search URL (Accommodations)
                            # Construct Search URL (Accommodations)
                            # based on manual discovery: bookingCategoryId=1 (Camping?!), searchTabGroupId=2
                            search_url = (
                                f"{self.BASE_URL}/create-booking/results?"
                                f"resourceLocationId={r_loc_id}&"
                                f"mapId={map_id}&"
                                f"searchTabGroupId=2&" 
                                f"bookingCategoryId=4&"
                                f"startDate={future_date}&"
                                f"nights=1&"
                                f"isReserving=true&"
                                f"partySize=5" 
                            )
                            
                            print(f"    Navigating to: {search_url}")
                            
                            # Container for intercepted data
                            captured_data = {}
                            
                            try:
                                # predicate to match the map API call
                                def map_predicate(response):
                                    return "api/availability/map" in response.url and response.status == 200

                                # Start waiting for the response BEFORE navigating
                                with page.expect_response(map_predicate, timeout=30000) as response_info:
                                    print(f"    Navigating to: {search_url}")
                                    page.goto(search_url, timeout=60000)
                                
                                # Wait for the response to be fulfilled
                                response = response_info.value
                                print(f"    DEBUG: Intercepted Map URL: {response.url}")
                                
                                # Parse immediately
                                map_data_json = response.json()
                                captured_data['map'] = map_data_json
                                captured_data['map'] = map_data_json
                                # print(f"    DEBUG: SUCCESSFUL Intercepted URL: {response.url}")    

                                # Debug save
                                with open('debug_map_data.json', 'w') as f:
                                    json.dump(map_data_json, f, indent=2)
                                    
                            except Exception as e:
                                print(f"    Error capturing initial map: {e}")

                            # Recursion Logic
                            # Function to recursively fetch map data
                            def process_map_recursion(current_map_id):
                                # Avoid infinite loops
                                if current_map_id in processed_maps:
                                    return
                                processed_maps.add(current_map_id)

                                print(f"    DEBUG: Processing Map ID: {current_map_id}")
                                
                                # Check if we already have data for this map from interception
                                map_data = None
                                if str(current_map_id) == str(map_id) and 'map' in captured_data:
                                     map_data = captured_data['map']
                                else:
                                     # UI-based Recursion: Navigate to the sub-map page
                                     # We construct the PAGE URL, not the API URL
                                     # https://reservation.pc.gc.ca/create-booking/results?resourceLocationId=-2147483621&mapId=-2147483520&searchTabGroupId=2&bookingCategoryId=1...
                                     
                                     page_url = (
                                        f"{self.BASE_URL}/create-booking/results?"
                                        f"resourceLocationId={r_loc_id}&"
                                        f"mapId={current_map_id}&"
                                        f"searchTabGroupId=2&"
                                        f"bookingCategoryId=4&"
                                        f"startDate={future_date}&"
                                        f"nights=1&"
                                        f"isReserving=true&"
                                        f"partySize=5"
                                     )
                                     
                                     print(f"    Navigating to Sub-Map: {page_url}")
                                     try:
                                         # Intercept again
                                         def sub_map_predicate(response):
                                            return "api/availability/map" in response.url and response.status == 200 and str(current_map_id) in response.url

                                         with page.expect_response(sub_map_predicate, timeout=30000) as response_info:
                                             page.goto(page_url, timeout=60000)
                                         
                                         response = response_info.value
                                         map_data = response.json()
                                         print(f"    DEBUG: Intercepted Sub-Map {current_map_id}")

                                     except Exception as e:
                                         print(f"    DEBUG: Failed to visit sub-map {current_map_id}: {e}")
                                         # Fallback: maybe just wait a bit and check captured network traffic if expectation failed?
                                         return

                                if not map_data:
                                    return

                                # 1. Check for Resources (Sites)
                                if 'resourceAvailabilities' in map_data and map_data['resourceAvailabilities']:
                                    res_avails = map_data['resourceAvailabilities']
                                    print(f"    Found {len(res_avails)} resources on Map {current_map_id}!")
                                    
                                    for r_id in res_avails.keys():
                                        sites_inventory.append({
                                            "park": park["localizedValues"][0]["fullName"],
                                            "campground": camp_name,
                                            "resourceId": str(r_id),
                                            "siteName": str(r_id), 
                                            "bookingCategoryId": 4 
                                        })

                                # 2. Check for Sub-Maps (Clusters)
                                if 'mapLinkAvailabilities' in map_data and map_data['mapLinkAvailabilities']:
                                    links = map_data['mapLinkAvailabilities']
                                    print(f"    Found {len(links)} sub-maps on Map {current_map_id}. Recursing...")
                                    for sub_map_id in links.keys():
                                        process_map_recursion(sub_map_id)

                            # Start Processing
                            processed_maps = set() 
                            try:
                                if 'map' in captured_data:
                                    # Start recursion
                                    process_map_recursion(str(map_id)) # ensure string key match
                                else:
                                    print("    Warning: No initial map data captured.")
                            except Exception as e:
                                print(f"    Error during map processing: {e}")

                        except Exception as e:
                            print(f"    Error checking campground {camp_name}: {e}")
            
            except Exception as e:
                print(f"Detailed error during discovery: {e}")
            finally:
                browser.close()
        
        # Save Inventory
        

        with open(self.INVENTORY_FILE, "w") as f:
            json.dump(sites_inventory, f, indent=2)
        print(f"\nDiscovery Complete. Saved {len(sites_inventory)} sites to {self.INVENTORY_FILE}")

    def scan(self):
        """Phase 2: Fast Calendar Scan using Playwright to bypass WAF."""
        print("Starting Calendar Scan (Playwright-backed)...")
        
        try:
            with open(self.INVENTORY_FILE, "r") as f:
                inventory = json.load(f)
        except FileNotFoundError:
            print(f"Inventory file {self.INVENTORY_FILE} not found. Run --discover first.")
            return

        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        chunks = []
        # Support up to 180 days out (6 months)
        for i in range(6):
            start = today + timedelta(days=i*30)
            end = start + timedelta(days=30)
            chunks.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))

        all_raw_results = []
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()
            
            print("Establishing session/solving WAF...")
            page.goto(f"{self.BASE_URL}/create-booking", timeout=60000)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(5000)
            
            print("Running stable sequential scan...")
            
            for idx, site in enumerate(inventory):
                if idx % 20 == 0:
                    print(f"  Scanning site {idx}/{len(inventory)}: {site['park']}...")
                
                cat_id = site.get('bookingCategoryId', 4)
                for start_str, end_str in chunks:
                    url = (
                        f"{self.BASE_URL}/api/availability/resourcedailyavailability?"
                        f"resourceId={site['resourceId']}&bookingCategoryId={cat_id}&"
                        f"startDate={start_str}&endDate={end_str}&"
                        f"isReserving=true"
                    )
                    try:
                        response = page.request.get(url)
                        if response.ok:
                            data = response.json()
                            if isinstance(data, list):
                                for entry in data:
                                    if isinstance(entry, dict) and entry.get('availability') == 1:
                                        d_str = entry.get('date') or entry.get('startDate')
                                        if d_str:
                                            try:
                                                avail_date = datetime.strptime(d_str.split('T')[0], "%Y-%m-%d")
                                                all_raw_results.append({
                                                    "date": avail_date,
                                                    "park": site['park'],
                                                    "area": site['campground'],
                                                    "site_id": site['siteName']
                                                })
                                            except: pass
                    except: pass
                
            browser.close()

        self._save_report(all_raw_results)

    def _save_report(self, raw_results):
        if not raw_results:
            print("\nNo oTENTik availability found for the next 90 days.")
            return

        # Sort: Park, Area, Site, Date
        raw_results.sort(key=lambda x: (x['park'], x['area'], x['site_id'], x['date']))

        # Group into Ranges
        ranges = []
        if raw_results:
            current_range = None
            for res in raw_results:
                if current_range is None:
                    current_range = {
                        "park": res['park'],
                        "area": res['area'],
                        "site_id": res['site_id'],
                        "start": res['date'],
                        "end": res['date'],
                        "nights": 1
                    }
                else:
                    is_same_site = (res['park'] == current_range['park'] and 
                                   res['area'] == current_range['area'] and 
                                   res['site_id'] == current_range['site_id'])
                    is_consecutive = (res['date'] == current_range['end'] + timedelta(days=1))
                    
                    if is_same_site and is_consecutive:
                        current_range['end'] = res['date']
                        current_range['nights'] += 1
                    else:
                        ranges.append(current_range)
                        current_range = {
                            "park": res['park'],
                            "area": res['area'],
                            "site_id": res['site_id'],
                            "start": res['date'],
                            "end": res['date'],
                            "nights": 1
                        }
            if current_range:
                ranges.append(current_range)

        # Final Formatting: Group by Date-Range + Location for the table
        grouped_report = {}
        for r in ranges:
            key = (r['start'], r['end'], r['park'], r['area'])
            if key not in grouped_report:
                grouped_report[key] = []
            if r['site_id'] not in grouped_report[key]:
                grouped_report[key].append(r['site_id'])

        report_rows = []
        for (start, end, park, area), sites in grouped_report.items():
            date_str = start.strftime("%b %d")
            if start != end:
                date_str = f"{start.strftime('%b %d')} - {end.strftime('%b %d')}"
            
            nights = (end - start).days + 1
            range_str = f"{nights} nights" if nights > 1 else "1 night"
            
            report_rows.append({
                "Date": date_str,
                "Park": park,
                "Area": area,
                "Range": range_str,
                "Sites": ", ".join(sites),
                "sort_date": start
            })
        
        report_rows.sort(key=lambda x: (x['sort_date'], x['Park'], x['Area']))

        markdown = f"# oTENTik Availability Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        markdown += "| Date | Park | Area (Campground) | Range | Site IDs |\n"
        markdown += "| :--- | :--- | :--- | :--- | :--- |\n"
        
        for row in report_rows:
            markdown += f"| {row['Date']} | {row['Park']} | {row['Area']} | {row['Range']} | {row['Sites']} |\n"

        with open("availability_report.md", "w") as f:
            f.write(markdown)
        
        print(f"\nScan Complete! Report saved to availability_report.md")
        print(f"Found {len(report_rows)} availability blocks.")

        # Email if enabled
        try:
           send_email(
                f"Parks Canada oTENTik Report - {datetime.now().strftime('%Y-%m-%d')}",
                markdown
            )
           print("Email sent successfully.")
        except Exception as e:
           print(f"Could not send email: {e}")

    def _fetch_json(self, page, url_suffix):
        # Helper to fetch JSON via Playwright APIRequestContext
        # Fallback to evaluate(fetch) if request fails
        full_url = url_suffix if url_suffix.startswith("http") else self.BASE_URL + url_suffix
        
        # Method 1: APIRequestContext (Fast, robust headers)
        try:
            response = page.request.get(full_url)
            if response.ok:
                return response.json()
            # If 403, proceed to fallback
        except:
            pass
            
        # Method 2: In-Page Fetch (Slow, uses browser context fully)
        try:
            return page.evaluate(f"""async () => {{
                try {{
                    const response = await fetch('{full_url}');
                    if (!response.ok) return null;
                    return await response.json();
                }} catch (e) {{
                    return null;
                }}
            }}""")
        except:
            return None

    def _get_name(self, obj):
        if not obj.get('localizedValues'): return "Unknown"
        return obj['localizedValues'][0].get('fullName', obj['localizedValues'][0].get('shortName', "Unknown"))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parks Canada oTENTik Tracker")
    parser.add_argument("--discover", action="store_true", help="Run discovery phase to build inventory")
    parser.add_argument("--scan", action="store_true", help="Run availability scan using inventory")
    
    args = parser.parse_args()
    
    tracker = ParksCanadaTracker()
    
    if args.discover:
        tracker.discover()
    elif args.scan:
        tracker.scan()
    else:
        # Default behavior: Warn user
        print("Please specify --discover or --scan.")
        # For backward compatibility or ease, maybe run scan?
        # But we need inventory.
        if input("Run discovery now? (y/n): ").lower() == 'y':
            tracker.discover()
        tracker.scan()

