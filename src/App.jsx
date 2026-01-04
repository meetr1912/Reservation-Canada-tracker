import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, List, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { Badge } from './components/ui/badge';
import { Checkbox } from './components/ui/checkbox';
import CalendarView from './CalendarView';

function App() {
  const [availabilityData, setAvailabilityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPark, setSelectedPark] = useState('all');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
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
      <div className="min-h-screen flex items-center justify-center p-5">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-lg">Loading oTENTik availability...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!availabilityData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error loading data</CardTitle>
            <CardDescription>Please ensure availability_report.json is available.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const dates = Object.keys(availabilityData).sort();
  const selectedDateData = availabilityData[selectedDate] || [];
  
  // Get all unique parks from all dates for calendar view
  const allParks = new Set();
  Object.values(availabilityData).forEach(dateData => {
    dateData.forEach(site => allParks.add(site.ParkName));
  });
  const parks = ['all', ...Array.from(allParks)].sort();
  
  const getBookingUrl = (site, date) => {
    const baseUrl = 'https://reservation.pc.gc.ca/create-booking/results';
    const params = new URLSearchParams({
      bookingCategoryId: 4,
      startDate: date,
      nights: 1,
      isReserving: true,
      partySize: 2
    });
    return `${baseUrl}?${params.toString()}`;
  };
  
  let filteredData = selectedDateData;
  if (selectedPark !== 'all') {
    filteredData = filteredData.filter(site => site.ParkName === selectedPark);
  }
  if (showOnlyAvailable) {
    filteredData = filteredData.filter(site => site.status);
  }

  const totalAvailable = selectedDateData.filter(site => site.status).length;
  const totalSites = selectedDateData.length;

  const datesWithAvailability = dates.filter(date => 
    availabilityData[date].some(site => site.status)
  );

  return (
    <div className="min-h-screen p-5">
      <header className="text-center text-white mb-10 max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-10">
          <h1 className="text-5xl font-bold mb-3 text-shadow">🏕️ Parks Canada oTENTik Tracker</h1>
          <p className="text-xl opacity-90">Real-time availability for all oTENTik sites</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto">
        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium mb-2">View Mode</label>
                  <TabsList>
                    <TabsTrigger value="list" className="gap-2">
                      <List className="h-4 w-4" />
                      List View
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Calendar View
                    </TabsTrigger>
                  </TabsList>
                </div>

                {viewMode === 'list' && (
                  <div className="w-full md:flex-1">
                    <label className="block text-sm font-medium mb-2">Select Date</label>
                    <Select value={selectedDate} onValueChange={setSelectedDate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a date" />
                      </SelectTrigger>
                      <SelectContent>
                        {dates.map(date => {
                          const hasAvailability = availabilityData[date].some(site => site.status);
                          return (
                            <SelectItem key={date} value={date}>
                              {new Date(date).toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                              {hasAvailability ? ' ✓' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="w-full md:flex-1">
                  <label className="block text-sm font-medium mb-2">Filter by Park</label>
                  <Select value={selectedPark} onValueChange={setSelectedPark}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a park" />
                    </SelectTrigger>
                    <SelectContent>
                      {parks.map(park => (
                        <SelectItem key={park} value={park}>
                          {park === 'all' ? 'All Parks' : park}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {viewMode === 'list' && (
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox 
                      id="available-only"
                      checked={showOnlyAvailable}
                      onCheckedChange={setShowOnlyAvailable}
                    />
                    <label
                      htmlFor="available-only"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Show only available
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <TabsContent value="list" className="mt-0">
            {viewMode === 'list' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Available Today</CardDescription>
                      <CardTitle className="text-4xl text-primary">{totalAvailable}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Total Sites</CardDescription>
                      <CardTitle className="text-4xl text-primary">{totalSites}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Days with Availability</CardDescription>
                      <CardTitle className="text-4xl text-primary">{datesWithAvailability.length}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {datesWithAvailability.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Quick Jump to Available Dates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {datesWithAvailability.slice(0, 10).map(date => (
                          <Button
                            key={date}
                            onClick={() => setSelectedDate(date)}
                            variant={date === selectedDate ? "default" : "outline"}
                            size="sm"
                          >
                            {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredData.length === 0 ? (
                    <Card className="col-span-full">
                      <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">No sites match your filters</p>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredData.map((site, index) => (
                      <Card 
                        key={index} 
                        className={`transition-all hover:shadow-lg ${
                          site.status 
                            ? 'border-green-500 bg-gradient-to-br from-green-50 to-white' 
                            : 'border-red-300 bg-gradient-to-br from-red-50 to-white'
                        }`}
                      >
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <Badge variant={site.status ? "success" : "destructive"} className="gap-1">
                              {site.status ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Available
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3" />
                                  Unavailable
                                </>
                              )}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg mt-2">{site.ResourceName}</CardTitle>
                          <CardDescription>{site.ParkName}</CardDescription>
                          <CardDescription className="text-xs">{site.PageTitle}</CardDescription>
                        </CardHeader>
                        {site.status && (
                          <CardContent>
                            <Button 
                              asChild 
                              className="w-full"
                            >
                              <a 
                                href={getBookingUrl(site, selectedDate)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Book Now →
                              </a>
                            </Button>
                          </CardContent>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            {viewMode === 'calendar' && (
              <CalendarView 
                availabilityData={availabilityData}
                selectedPark={selectedPark}
              />
            )}
          </TabsContent>
        </Tabs>

        <footer className="mt-10 text-center text-white">
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardContent className="pt-6">
              <p className="text-sm opacity-90">Last updated: {new Date().toLocaleString()}</p>
              <p className="text-sm opacity-90">Data updates daily via automated scanning</p>
              <p className="text-sm opacity-90 mt-2">
                For suggestions, contact: <a href="mailto:meetr1912@gmail.com" className="underline hover:opacity-80">meetr1912@gmail.com</a>
              </p>
            </CardContent>
          </Card>
        </footer>
      </div>
    </div>
  );
}

export default App;
