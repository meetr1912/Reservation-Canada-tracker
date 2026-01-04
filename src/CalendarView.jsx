import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';

function CalendarView({ availabilityData, selectedPark }) {
  if (!availabilityData) return null;

  // Group dates by month
  const datesByMonth = {};
  
  Object.keys(availabilityData).forEach(date => {
    const dateObj = new Date(date);
    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    
    if (!datesByMonth[monthKey]) {
      datesByMonth[monthKey] = [];
    }
    
    datesByMonth[monthKey].push(date);
  });

  const months = Object.keys(datesByMonth).sort();

  return (
    <div className="space-y-6">
      {months.map(monthKey => (
        <MonthCalendar
          key={monthKey}
          monthKey={monthKey}
          dates={datesByMonth[monthKey]}
          availabilityData={availabilityData}
          selectedPark={selectedPark}
        />
      ))}
    </div>
  );
}

function MonthCalendar({ monthKey, dates, availabilityData, selectedPark }) {
  const [year, month] = monthKey.split('-').map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfWeek = monthDate.getDay();
  
  // Get number of days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // Create calendar grid
  const calendarDays = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarDays.push(dateStr);
  }

  const getAvailabilityForDate = (dateStr) => {
    if (!dateStr || !availabilityData[dateStr]) return 0;
    
    let sites = availabilityData[dateStr];
    
    // Filter by park if selected
    if (selectedPark && selectedPark !== 'all') {
      sites = sites.filter(site => site.ParkName === selectedPark);
    }
    
    return sites.filter(site => site.status).length;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{monthName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {calendarDays.map((dateStr, index) => {
            if (!dateStr) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }
            
            const availability = getAvailabilityForDate(dateStr);
            const dayNum = new Date(dateStr).getDate();
            const hasAvailability = availability > 0;
            
            return (
              <div
                key={dateStr}
                className={`
                  relative aspect-square border rounded-lg p-2 flex flex-col items-center justify-center
                  transition-all hover:shadow-md cursor-pointer
                  ${hasAvailability 
                    ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300 hover:from-green-100 hover:to-green-200' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }
                `}
              >
                <div className="text-lg font-semibold">{dayNum}</div>
                {hasAvailability && (
                  <Badge 
                    variant="success" 
                    className="text-xs mt-1 px-1.5 py-0"
                  >
                    {availability}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default CalendarView;
