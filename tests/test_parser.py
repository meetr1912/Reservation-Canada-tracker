import pytest
from pathlib import Path
import sys
import os

# Ensure we can import from the root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scraper import ParksCanadaTracker

@pytest.fixture
def parser():
    return ParksCanadaTracker()

def load_fixture(filename):
    fixture_path = Path(__file__).parent / "fixtures" / filename
    return fixture_path.read_text(encoding="utf-8")

def test_parser_structure_available_sites(parser):
    """Test that the parser correctly extracts sites from a known-good HTML fixture."""
    html = load_fixture("mock_available.html")
    sites = parser._parse_sites(html)
    
    # Only "Available" sites are returned, "Reserved" are filtered out.
    assert len(sites) == 1
    
    # Check first site
    site1 = sites[0]
    assert site1["site_id"] == "Site 101"
    assert site1["status"] == "Available"
    assert site1["available"] is True
    
    # Check second site (Reserved) - typically _parse_sites only returns available ones?
    # Let's check the implementation: 
    # if 'available' in status.lower(): sites.append(...)
    # So "Reserved" should NOT be in the list if the logic is correct.
    # Wait, my previous read of mock_available.html showed:
    # <div class="availability-status">Available</div>
    # <div class="availability-status">Reserved</div>
    # So len should be 1?
    
    # Let's verify the logic in scraper.py:
    # if 'available' in status.lower():
    #     sites.append({...})
    
    # So it filters for available only.
    assert len(sites) == 1
    assert sites[0]["site_id"] == "Site 101"

def test_parser_graceful_on_real_page_shell(parser):
    """Test that the parser returns empty list (no crash) on the SPA shell."""
    html = load_fixture("real_broad_cove.html")
    sites = parser._parse_sites(html)
    assert sites == []

def test_parser_detects_no_results(parser):
    """Test that the parser handles explicit 'no results' HTML."""
    html = load_fixture("mock_no_availability.html")
    sites = parser._parse_sites(html)
    assert sites == []

def test_parser_rendered_map_view(parser):
    """Test that we can parse available sites from the rendered map view (SPA)."""
    html = load_fixture("real_broad_cove_rendered.html")
    sites = parser._parse_sites(html)
    
    # We expect to find the sites that had data-availability="icon-available"
    # From inspection: "# 84 - 141" and "# 142 - 201"
    available_ids = [s['site_id'] for s in sites]
    assert "# 84 - 141" in available_ids
    assert "# 142 - 201" in available_ids
    assert len(sites) >= 2

def test_build_search_url(parser):
    """Test URL construction invariants."""
    url = parser.build_search_url(
        resource_location_id=123,
        map_id=456,
        start_date="2026-06-15",
        end_date="2026-06-17",
        nights=2
    )
    # Essential params
    assert "resourceLocationId=123" in url
    assert "mapId=456" in url
    assert "startDate=2026-06-15" in url
    assert "nights=2" in url
    # Detailed encoded params
    assert "peopleCapacityCategoryCounts=%5B%5B-32767,null,2,null%5D%5D" in url

def test_detect_season_closed_banner(parser):
    """Test that we detect the 'season closed' message."""
    html = load_fixture("mock_season_closed.html")
    assert parser.is_season_closed(html) is True
    
    # Ensure _parse_sites returns empty list (and maybe logs/prints, but we check return)
    sites = parser._parse_sites(html)
    assert sites == []
