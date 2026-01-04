import React, { useState, useEffect } from 'react';
import './App.css';
import './CalendarView.css';
import CalendarView from './CalendarView';

function App() {
  const [availabilityData, setAvailabilityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPark, setSelectedPark] = useState('all');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'

  useEffect(() => {
    // Load the availability report
    // Use process.env.PUBLIC_URL for GitHub Pages compatibility
    const reportUrl = `${process.env.PUBLIC_URL}/availability_report.json`;
    console.log('Fetching from:', reportUrl);
    
    fetch(reportUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Loaded availability data:', Object.keys(data).length, 'dates');
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
          throw new Error('Invalid or empty data received');
        }
        setAvailabilityData(data);
        setLoading(false);
        // Set the first date with availability as default
        const firstAvailableDate = Object.keys(data).find(date => 
          data[date].some(site => site.status)
        );
        setSelectedDate(firstAvailableDate || Object.keys(data)[0]);
      })
      .catch(error => {
        console.error('Error loading availability data:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="App">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading oTENTik availability...</p>
        </div>
      </div>
    );
  }

  if (!availabilityData) {
    return (
      <div className="App">
        <div className="error">
          <h2>Error loading data</h2>
          <p>Please ensure availability_report.json is available.</p>
        </div>
      </div>
    );
  }

  const dates = Object.keys(availabilityData).sort();
  const selectedDateData = availabilityData[selectedDate] || [];
  
  // Get unique parks
  const parks = ['all', ...new Set(selectedDateData.map(site => site.ParkName))].sort();
  
  // Generate booking URL for a site
  const getBookingUrl = (site, date) => {
    const baseUrl = 'https://reservation.pc.gc.ca/create-booking/results';
    const params = new URLSearchParams({
      bookingCategoryId: 4, // oTENTik category
      startDate: date,
      nights: 1,
      isReserving: true,
      partySize: 2
    });
    return `${baseUrl}?${params.toString()}`;
  };
  
  // Filter data based on selections
  let filteredData = selectedDateData;
  if (selectedPark !== 'all') {
    filteredData = filteredData.filter(site => site.ParkName === selectedPark);
  }
  if (showOnlyAvailable) {
    filteredData = filteredData.filter(site => site.status);
  }

  // Calculate statistics
  const totalAvailable = selectedDateData.filter(site => site.status).length;
  const totalSites = selectedDateData.length;

  // Get dates with availability for quick navigation
  const datesWithAvailability = dates.filter(date => 
    availabilityData[date].some(site => site.status)
  );

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏕️ Parks Canada oTENTik Tracker</h1>
        <p className="subtitle">Real-time availability for all oTENTik sites</p>
      </header>

      <div className="container">
        <div className="controls">
          <div className="control-group">
            <label>View Mode:</label>
            <div className="view-toggle">
              <button 
                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                📋 List View
              </button>
              <button 
                className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
              >
                📅 Calendar View
              </button>
            </div>
          </div>

          {viewMode === 'list' && (
            <div className="control-group">
              <label>Select Date:</label>
              <select 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-select"
              >
                {dates.map(date => {
                  const hasAvailability = availabilityData[date].some(site => site.status);
                  return (
                    <option key={date} value={date}>
                      {new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                      {hasAvailability ? ' ✓' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="control-group">
            <label>Filter by Park:</label>
            <select 
              value={selectedPark} 
              onChange={(e) => setSelectedPark(e.target.value)}
              className="park-select"
            >
              {parks.map(park => (
                <option key={park} value={park}>
                  {park === 'all' ? 'All Parks' : park}
                </option>
              ))}
            </select>
          </div>

          {viewMode === 'list' && (
            <div className="control-group checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={showOnlyAvailable}
                  onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                />
                Show only available
              </label>
            </div>
          )}
        </div>

        {viewMode === 'list' && (
          <div className="stats">
            <div className="stat-card">
              <div className="stat-value">{totalAvailable}</div>
              <div className="stat-label">Available Today</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalSites}</div>
              <div className="stat-label">Total Sites</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{datesWithAvailability.length}</div>
              <div className="stat-label">Days with Availability</div>
            </div>
          </div>
        )}

        {viewMode === 'calendar' ? (
          <CalendarView 
            availabilityData={availabilityData}
            selectedPark={selectedPark}
          />
        ) : (
          <>
            {datesWithAvailability.length > 0 && (
              <div className="quick-nav">
                <h3>Quick Jump to Available Dates:</h3>
                <div className="quick-dates">
                  {datesWithAvailability.slice(0, 10).map(date => (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className={`quick-date-btn ${date === selectedDate ? 'active' : ''}`}
                    >
                      {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="sites-grid">
              {filteredData.length === 0 ? (
                <div className="no-results">
                  <p>No sites match your filters</p>
                </div>
              ) : (
                filteredData.map((site, index) => (
                  <div 
                    key={index} 
                    className={`site-card ${site.status ? 'available' : 'unavailable'}`}
                  >
                    <div className="site-status">
                      {site.status ? '✓ Available' : '✗ Unavailable'}
                    </div>
                    <h3 className="site-name">{site.ResourceName}</h3>
                    <div className="site-details">
                      <p className="park-name">{site.ParkName}</p>
                      <p className="page-title">{site.PageTitle}</p>
                    </div>
                    {site.status && (
                      <a 
                        href={getBookingUrl(site, selectedDate)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="book-button"
                      >
                        Book Now →
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <footer className="footer">
        <p>Last updated: {new Date().toLocaleString()}</p>
        <p>Data updates daily via automated scanning</p>
        <p className="contact">For suggestions, contact: <a href="mailto:meetr1912@gmail.com">meetr1912@gmail.com</a></p>
      </footer>
    </div>
  );
}

export default App;
