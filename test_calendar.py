from playwright.sync_api import sync_playwright
import json
from datetime import datetime, timedelta

def test():
    base_url = "https://reservation.pc.gc.ca"
    
    with open('otentiks.json', 'r') as f:
        otentiks_data = json.load(f)

    # Track which sites are available on which dates
    available_dates = set()
    
    # Define date range for scanning - next 6 months from today
    start_date = datetime.now()
    end_date = start_date + timedelta(days=180) # Scan for 6 months
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        )
        page = context.new_page()
        
        # Navigate to the site first to handle cookies and any bot detection.
        print("Initializing session...")
        page.goto(base_url, timeout=60000)
        try:
            page.wait_for_load_state('networkidle', timeout=30000)
        except Exception as e:
            print(f"Network idle timeout (this is ok): {e}")
            # Continue anyway - the page is likely loaded enough

        api_context = page.request

        for otentik in otentiks_data:
            resource_id = otentik['NegativeResourceValue']
            resource_name = otentik['ResourceName']
            
            # The bookingCategoryId for oTENTiks is 4
            booking_category_id = 4

            url = (
                f"{base_url}/api/availability/resourcedailyavailability?"
                f"resourceId={resource_id}&"
                f"bookingCategoryId={booking_category_id}&"
                f"startDate={start_str}&"
                f"endDate={end_str}&"
                f"isReserving=true"
            )
            
            print(f"Checking availability for {resource_name} ({resource_id})...")
            
            try:
                response = api_context.get(url)
                if response.ok:
                    data = response.json()
                    if isinstance(data, dict):
                        for date, details in data.items():
                            if isinstance(details, dict) and details.get('availability') == 1:
                                # Format date to YYYY-MM-DD
                                clean_date = date.split('T')[0]
                                available_dates.add((resource_id, clean_date))
                    elif isinstance(data, list):
                        for i, details in enumerate(data):
                            if isinstance(details, dict) and details.get('availability') == 1:
                                current_date = start_date + timedelta(days=i)
                                clean_date = current_date.strftime("%Y-%m-%d")
                                available_dates.add((resource_id, clean_date))
                else:
                    print(f"  -> Failed to fetch data for {resource_name}: {response.status} {response.status_text}")

            except Exception as e:
                print(f"  -> An error occurred for resource {resource_name}: {e}")

        browser.close()

    # Generate JSON report
    print("\nGenerating availability report...")
    availability_report = {}
    
    # Generate report for the next 6 months (180 days)
    for i in range(180):
        current_date = start_date + timedelta(days=i)
        date_str = current_date.strftime('%Y-%m-%d')
        
        daily_availability = []
        for otentik in otentiks_data:
            resource_id = otentik['NegativeResourceValue']
            
            # Check if this resource is available on this date
            status = (resource_id, date_str) in available_dates
            
            daily_availability.append({
                "ParkName": otentik.get("ParkName"),
                "PageTitle": otentik.get("PageTitle"),
                "ResourceName": otentik.get("ResourceName"),
                "status": status
            })
        
        availability_report[date_str] = daily_availability
    
    # Save to JSON file
    with open("availability_report.json", "w") as f:
        json.dump(availability_report, f, indent=2)
        
    print("Availability report generated in availability_report.json")
    
    # Count available slots for summary
    available_count = len(available_dates)
    print(f"Found {available_count} available slots across all oTENTiks for the next 6 months.")

if __name__ == "__main__":
    test()
