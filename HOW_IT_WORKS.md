# oTENTik Scanner - How It Works

## Overview

The oTENTik scanner is a Python-based web scraper that monitors availability across all Parks Canada oTENTik sites using Playwright to bypass bot detection systems.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Collection Layer                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  otentiks.json (122 units across 13 parks)             │ │
│  │  Contains: ParkName, PageTitle, ResourceName, ID       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Scanning Engine                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  test_calendar.py (Playwright-based scanner)           │ │
│  │  - Headless browser automation                         │ │
│  │  - WAF/Bot detection bypass                            │ │
│  │  - API request interception                            │ │
│  │  - 180-day availability check per site                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Data Processing                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  availability_report.json (Generated daily)            │ │
│  │  Structure: { "date": [ {site, status}, ... ] }       │ │
│  │  - Organized by date (next 6 months)                  │ │
│  │  - Boolean availability status per site               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Visualization Layer                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React App (Interactive Dashboard)                     │ │
│  │  - Real-time filtering and search                     │ │
│  │  - Statistics and analytics                           │ │
│  │  - Mobile-responsive design                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## How the Scanner Works

### 1. Data Discovery (Manual/One-time)

The oTENTiks inventory was built using a browser console script that extracts site information:

```javascript
// Run this in the browser console on Parks Canada booking pages
function extractResourcesBySvgPathAndFormatCSV() {
    const targetDValue = "M4.57848 11.8333L0.774374 8.72088L10 0.663836L19.2393 8.73282L15.6795 11.8333H4.57848Z";
    
    const pageTitleElement = document.getElementById('pageTitle');
    const currentPageTitle = pageTitleElement ? pageTitleElement.textContent.trim() : 'Title Not Found';

    const parkNameElement = document.getElementById('sidebar-park-name');
    const parkName = parkNameElement ? parkNameElement.textContent.trim() : 'Park Name Not Found';

    const extractedData = [];
    const matchingPaths = document.querySelectorAll(`path[d="${targetDValue}"]`);
    
    matchingPaths.forEach(pathElement => {
        const svgElement = pathElement.closest('svg');
        
        if (svgElement) {
            const resourceName = svgElement.getAttribute('data-resource');
            const svgId = svgElement.id;
            let negativeResourceId = null;

            if (svgId && svgId.includes('[') && svgId.includes(']')) {
                const match = svgId.match(/\[(-?\d+)\]/);
                if (match && match.length > 1) {
                    negativeResourceId = match[1];
                }
            }

            if (resourceName && negativeResourceId) {
                extractedData.push({
                    "ResourceName": resourceName,
                    "NegativeResourceValue": negativeResourceId,
                    "PageTitle": currentPageTitle,
                    "ParkName": parkName
                });
            }
        }
    });

    // Generate CSV for easy export
    if (extractedData.length > 0) {
        const headers = Object.keys(extractedData[0]);
        const rows = extractedData.map(obj => 
            headers.map(header => `"${String(obj[header]).replace(/"/g, '""')}"`).join(',')
        );
        const csvString = [headers.join(','), ...rows].join('\n');
        console.log(csvString);
    }

    return extractedData;
}

extractResourcesBySvgPathAndFormatCSV();
```

**Why this works:**
- Parks Canada uses SVG maps to display campsites
- oTENTiks have a unique tent-shaped SVG path
- Each SVG element contains the resource ID needed for API calls
- This script identifies all oTENTik icons on the current page

### 2. Daily Availability Scanning

**File:** `test_calendar.py`

#### Process Flow:

1. **Initialization (Lines 14-30)**
   ```python
   - Launch headless Chromium browser
   - Establish session with Parks Canada
   - Load otentiks.json inventory
   ```

2. **For Each oTENTik (Lines 32-71)**
   ```python
   - Make API call to /api/availability/resourcedailyavailability
   - Request params:
     * resourceId: The site's unique ID
     * bookingCategoryId: 4 (oTENTik category)
     * startDate & endDate: Date range to check
     * isReserving: true
   ```

3. **Parse Availability (Lines 42-68)**
   ```python
   - API returns dict OR list format (Parks Canada inconsistency)
   - Extract dates where availability == 1
   - Store as (resourceId, date) tuple
   ```

4. **Generate Report (Lines 73-105)**
   ```python
   - Create availability_report.json
   - For each of next 180 days:
     * List all 122 oTENTiks
     * Set status: true/false based on availability
     * Include ParkName, PageTitle, ResourceName
   ```

#### Key Features:

**Bot Detection Bypass:**
- Uses Playwright with real Chromium browser
- Establishes legitimate session before API calls
- Mimics human browsing patterns
- Handles Queue-It waiting rooms

**Error Handling:**
- Graceful failure for individual sites
- Continues scan if one site fails
- Logs all errors for debugging

**Performance:**
- Sequential scanning to avoid rate limits
- Headless mode for efficiency
- ~5-10 minutes for full scan

### 3. Automation (GitHub Actions)

**File:** `.github/workflows/scraper.yml`

```yaml
Triggers:
  - Daily at 6:00 AM UTC
  - Manual dispatch

Steps:
  1. Checkout code
  2. Setup Python 3.11
  3. Install dependencies
  4. Install Playwright browsers
  5. Run test_calendar.py
  6. Copy report to public/
  7. Commit & push changes
  8. Trigger React app rebuild
```

## Data Structure

### Input: otentiks.json
```json
[
  {
    "ParkName": "Fundy - Headquarters",
    "PageTitle": "#34 - 58",
    "ResourceName": "O45",
    "NegativeResourceValue": -2147480485
  }
]
```

### Output: availability_report.json
```json
{
  "2026-01-03": [
    {
      "ParkName": "Fundy - Headquarters",
      "PageTitle": "#34 - 58",
      "ResourceName": "O45",
      "status": true
    }
  ]
}
```

## Technical Challenges & Solutions

### Challenge 1: Bot Detection
**Problem:** Parks Canada uses Cloudflare WAF and Queue-It
**Solution:** Playwright with real browser + session establishment

### Challenge 2: Inconsistent API Responses
**Problem:** API returns different formats (dict vs list)
**Solution:** Type checking and dual parsing logic

### Challenge 3: Rate Limiting
**Problem:** Too many rapid requests get blocked
**Solution:** Sequential scanning with controlled timing

### Challenge 4: Data Volume
**Problem:** 122 sites × 180 days = 21,960 data points
**Solution:** Efficient JSON structure, boolean status fields

## Extending the Scanner

### Adding New Accommodation Types

1. **Identify the SVG icon** for the accommodation type
2. **Extract the SVG path** value (similar to oTENTik path)
3. **Update the discovery script** with the new path
4. **Create new inventory file** (e.g., `campsites.json`)
5. **Adjust bookingCategoryId** in scanner:
   - 1: Camping
   - 4: oTENTik
   - (others TBD)

### Adding New Parks

1. **Navigate to park's booking page**
2. **Run discovery script** in browser console
3. **Export CSV** and convert to JSON
4. **Merge** into `otentiks.json`
5. Scanner automatically picks up new sites

## Performance Metrics

- **Scan Duration:** ~8-10 minutes for all 122 sites
- **Data Size:** ~3.5 MB JSON (180 days × 122 sites)
- **Update Frequency:** Daily at 6 AM UTC
- **Success Rate:** >95% (depends on Parks Canada API stability)

## Troubleshooting

### Scanner Fails
```bash
# Test locally first
python test_calendar.py

# Check Playwright installation
playwright install chromium
```

### Missing Sites
- Verify otentiks.json is up to date
- Check if Parks Canada changed resource IDs
- Re-run discovery script on affected pages

### API Errors
- Parks Canada API may be temporarily down
- Queue-It may require longer wait time
- Adjust timeout values in test_calendar.py

## Security & Ethics

- **Respects robots.txt**: Only accesses public booking data
- **Rate limiting**: Sequential requests avoid server stress  
- **No account required**: Uses public availability API
- **Read-only**: Never modifies booking data
- **Caching**: Reduces repeated requests

## Future Enhancements

- [ ] Support for traditional campsites
- [ ] Support for RV sites  
- [ ] Email notifications for specific sites
- [ ] Historical availability trends
- [ ] Price tracking
- [ ] Multi-language support (French)
- [ ] Mobile app version
