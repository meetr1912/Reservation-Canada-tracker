import pytest
import sys
import os
from datetime import datetime, timedelta

# Ensure we can import from the root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scraper import ParksCanadaTracker

@pytest.mark.skip(reason="Hits live site, avoid running in CI/frequently")
def test_smoke_fundy_fetch():
    tracker = ParksCanadaTracker()
    # Fundy - Headquarters
    campground = {
          "name": "Headquarters",
          "resourceLocationId": -2147483621,
          "mapId": -2147483621,
          "siteRanges": []
    }
    
    # Check 30 days from now
    start = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=32)).strftime("%Y-%m-%d")
    
    # We just want to see if it doesn't crash and returns a list (empty or not)
    # And preferably doesn't raise an HTTP error
    sites = tracker.check_availability(campground, start, end, 2)
    assert isinstance(sites, list)
