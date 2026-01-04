import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';

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
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
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

  const getSitesForDate = (dateStr) => {
    if (!dateStr || !availabilityData[dateStr]) return [];
    
    let sites = availabilityData[dateStr];
    
    // Filter by park if selected
    if (selectedPark && selectedPark !== 'all') {
      sites = sites.filter(site => site.ParkName === selectedPark);
    }
    
    return sites.filter(site => site.status);
  };

  const handleDateClick = (dateStr) => {
    const availability = getAvailabilityForDate(dateStr);
    if (availability > 0) {
      setSelectedDate(dateStr);
      setIsDialogOpen(true);
    }
  };

  const selectedDateSites = selectedDate ? getSitesForDate(selectedDate) : [];
  const selectedDateFormatted = selectedDate 
    ? new Date(selectedDate).toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      })
    : '';

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-semibold tracking-tight">{monthName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-3">
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
              const isToday = new Date(dateStr).toDateString() === new Date().toDateString();
              
              return (
                <div
                  key={dateStr}
                  onClick={() => handleDateClick(dateStr)}
                  className={`
                    relative aspect-square rounded-xl p-3 flex flex-col items-center justify-center
                    transition-all duration-200
                    ${hasAvailability 
                      ? 'bg-green-50 hover:bg-green-100 border-2 border-green-200 hover:border-green-300 hover:shadow-md cursor-pointer' 
                      : 'bg-white hover:bg-gray-50 border border-gray-200 cursor-default'
                    }
                    ${isToday ? 'ring-2 ring-gray-900 ring-offset-2' : ''}
                  `}
                >
                  <span className={`text-base font-semibold ${hasAvailability ? 'text-gray-900' : 'text-gray-400'}`}>
                    {dayNum}
                  </span>
                  {hasAvailability && (
                    <Badge 
                      variant="default"
                      className="mt-1.5 px-2 py-0.5 text-xs font-semibold bg-green-600 hover:bg-green-700"
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Available Sites
            </DialogTitle>
            <DialogDescription className="text-base">
              {selectedDateFormatted}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {selectedDateSites.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No available sites for this date
              </div>
            ) : (
              selectedDateSites.map((site, index) => (
                <Card key={index} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <div className="h-1 bg-green-500"></div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <Badge className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{site.ResourceName}</CardTitle>
                    <p className="text-sm text-gray-600">{site.ParkName}</p>
                    <p className="text-xs text-gray-500 mt-1">{site.PageTitle}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button 
                      asChild 
                      className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium"
                    >
                      <a 
                        href="https://reservation.pc.gc.ca/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Book Now
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CalendarView;
