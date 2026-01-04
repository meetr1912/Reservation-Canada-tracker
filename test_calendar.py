from playwright.sync_api import sync_playwright
import json
import pandas as pd
from datetime import datetime, timedelta

def test():
    base_url = "https://reservation.pc.gc.ca"
    
    with open('otentiks.json', 'r') as f:
        otentiks_data = json.load(f)

    availability_report = {}
    
    # Define date range for scanning
    start_date = datetime(2026, 4, 1)
    end_date = start_date + timedelta(days=90) # Scan for 90 days
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
        page.wait_for_load_state('networkidle')

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
                                if clean_date not in availability_report:
                                    availability_report[clean_date] = []
                                availability_report[clean_date].append(resource_name)
                    elif isinstance(data, list):
                        for i, details in enumerate(data):
                            if isinstance(details, dict) and details.get('availability') == 1:
                                current_date = start_date + timedelta(days=i)
                                clean_date = current_date.strftime("%Y-%m-%d")
                                if clean_date not in availability_report:
                                    availability_report[clean_date] = []
                                availability_report[clean_date].append(resource_name)
                else:
                    print(f"  -> Failed to fetch data for {resource_name}: {response.status} {response.status_text}")

            except Exception as e:
                print(f"  -> An error occurred for resource {resource_name}: {e}")

        browser.close()

    # Generate report
    if availability_report:
        print("\nGenerating availability report...")
        # Create a DataFrame for a table-like structure
        all_dates = sorted(availability_report.keys())
        all_resources = sorted(list(set(res for resources in availability_report.values() for res in resources)))
        
        report_df = pd.DataFrame(index=all_dates, columns=all_resources)
        
        for date, resources in availability_report.items():
            for resource in resources:
                report_df.loc[date, resource] = "Available"
        
        report_df = report_df.fillna("Not Available")
        
        # Save to a markdown file
        with open("availability_report.md", "w") as f:
            f.write(report_df.to_markdown())
            
        print("Availability report generated in availability_report.md")
    else:
        print("\nNo availability found for the specified dates.")

if __name__ == "__main__":
    test()
