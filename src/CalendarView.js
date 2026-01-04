import React from 'react';
import './CalendarView.css';

function CalendarView({ availabilityData, selectedPark }) {
  if (!availabilityData) return null;

  // Get all dates and filter by park
  const dates = Object.keys(availabilityData).sort();
  
  // Group dates by month
  const monthGroups = {};
  dates.forEach(dateStr => {
    const date = new Date(dateStr);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = {
        year: date.getFullYear(),
        month: date.getMonth(),
        dates: []
      };
    }
    
    // Count available sites for this date and park
    const sitesForDate = availabilityData[dateStr];
    const filtered = selectedPark === 'all' 
      ? sitesForDate 
      : sitesForDate.filter(site => site.ParkName === selectedPark);
    
    const availableCount = filtered.filter(site => site.status).length;
    
    monthGroups[monthKey].dates.push({
      date: date,
      dateStr: dateStr,
      availableCount: availableCount,
      totalCount: filtered.length
    });
  });

  return (
    <div className="calendar-view">
      {Object.keys(monthGroups).sort().map(monthKey => {
        const monthData = monthGroups[monthKey];
        return (
          <MonthCalendar 
            key={monthKey}
            year={monthData.year}
            month={monthData.month}
            dates={monthData.dates}
          />
        );
      })}
    </div>
  );
}

function MonthCalendar({ year, month, dates }) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Get first day of month and total days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
  
  // Create date lookup
  const dateLookup = {};
  dates.forEach(d => {
    const day = d.date.getDate();
    dateLookup[day] = d;
  });
  
  // Create calendar grid
  const weeks = [];
  let currentWeek = new Array(7).fill(null);
  let dayCounter = 1;
  
  // Fill first week
  for (let i = startDayOfWeek; i < 7 && dayCounter <= daysInMonth; i++) {
    currentWeek[i] = dayCounter++;
  }
  weeks.push(currentWeek);
  
  // Fill remaining weeks
  while (dayCounter <= daysInMonth) {
    currentWeek = new Array(7).fill(null);
    for (let i = 0; i < 7 && dayCounter <= daysInMonth; i++) {
      currentWeek[i] = dayCounter++;
    }
    weeks.push(currentWeek);
  }
  
  return (
    <div className="month-calendar">
      <h3 className="month-title">{monthNames[month]} {year}</h3>
      <div className="calendar-grid">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="calendar-header">{day}</div>
        ))}
        
        {/* Calendar days */}
        {weeks.map((week, weekIdx) => 
          week.map((day, dayIdx) => {
            if (day === null) {
              return <div key={`${weekIdx}-${dayIdx}`} className="calendar-day empty"></div>;
            }
            
            const dateData = dateLookup[day];
            const hasData = dateData !== undefined;
            const availableCount = hasData ? dateData.availableCount : 0;
            const hasAvailability = availableCount > 0;
            
            return (
              <div 
                key={`${weekIdx}-${dayIdx}`} 
                className={`calendar-day ${hasAvailability ? 'has-availability' : ''} ${!hasData ? 'no-data' : ''}`}
                title={hasData ? `${availableCount} oTENTik${availableCount !== 1 ? 's' : ''} available` : 'No data'}
              >
                <div className="day-number">{day}</div>
                {hasData && (
                  <div className="availability-count">
                    {availableCount > 0 ? availableCount : '—'}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CalendarView;
