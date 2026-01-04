import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, List, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-gray-600">Loading availability data</p>
        </div>
      </div>
    );
  }

  if (!availabilityData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Unable to load data</CardTitle>
            <CardDescription>Please ensure the availability report is accessible.</CardDescription>
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4wNSIvPjwvZz48L3N2Zz4=')] opacity-20"></div>
        
        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-32">
          <div className="text-center animate-slide-up">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-8 bg-white/10 backdrop-blur-xl rounded-3xl">
              <span className="text-5xl">🏕️</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tighter">
              Parks Canada
              <br />
              <span className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                oTENTik Tracker
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto font-light">
              Real-time availability across all oTENTik sites
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          {/* Controls Card */}
          <Card className="mb-8 border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col space-y-6">
                {/* View Mode Tabs */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">View Mode</h3>
                    <p className="text-xs text-gray-500">Choose how to explore availability</p>
                  </div>
                  <TabsList className="bg-gray-100">
                    <TabsTrigger value="list" className="gap-2 data-[state=active]:bg-white">
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">List</span>
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-white">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Calendar</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {viewMode === 'list' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Date</label>
                      <Select value={selectedDate} onValueChange={setSelectedDate}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Select a date" />
                        </SelectTrigger>
                        <SelectContent>
                          {dates.map(date => {
                            const hasAvailability = availabilityData[date].some(site => site.status);
                            return (
                              <SelectItem key={date} value={date}>
                                <span className="flex items-center gap-2">
                                  {new Date(date).toLocaleDateString('en-US', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric' 
                                  })}
                                  {hasAvailability && <span className="text-green-600">•</span>}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Park</label>
                    <Select value={selectedPark} onValueChange={setSelectedPark}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="All parks" />
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
                    <div className="flex items-end">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <Checkbox 
                          id="available-only"
                          checked={showOnlyAvailable}
                          onCheckedChange={setShowOnlyAvailable}
                          className="data-[state=checked]:bg-gray-900 data-[state=checked]:border-gray-900"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Available only
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <TabsContent value="list" className="mt-0 space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Available Today</p>
                      <p className="text-4xl font-bold tracking-tight">{totalAvailable}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Total Sites</p>
                      <p className="text-4xl font-bold tracking-tight">{totalSites}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <List className="h-6 w-6 text-gray-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Days Available</p>
                      <p className="text-4xl font-bold tracking-tight">{datesWithAvailability.length}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Dates */}
            {datesWithAvailability.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Quick Access</CardTitle>
                  <CardDescription>Jump to dates with availability</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {datesWithAvailability.slice(0, 10).map(date => (
                      <Button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        variant={date === selectedDate ? "default" : "outline"}
                        size="sm"
                        className="font-medium"
                      >
                        {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sites Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.length === 0 ? (
                <Card className="col-span-full border-0 shadow-sm">
                  <CardContent className="p-12 text-center">
                    <XCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 font-medium">No sites match your filters</p>
                  </CardContent>
                </Card>
              ) : (
                filteredData.map((site, index) => (
                  <Card 
                    key={index} 
                    className={`group border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ${
                      site.status 
                        ? 'hover:border-green-200' 
                        : 'opacity-75'
                    }`}
                  >
                    <div className={`h-1 ${site.status ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between mb-3">
                        <Badge 
                          variant={site.status ? "default" : "secondary"}
                          className={`${site.status ? 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200' : 'bg-gray-100 text-gray-600'}`}
                        >
                          {site.status ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" />Available</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" />Unavailable</>
                          )}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg leading-tight group-hover:text-gray-900 transition-colors">
                        {site.ResourceName}
                      </CardTitle>
                      <CardDescription className="text-sm">{site.ParkName}</CardDescription>
                      <p className="text-xs text-gray-500 mt-1">{site.PageTitle}</p>
                    </CardHeader>
                    {site.status && (
                      <CardContent className="pt-0">
                        <Button 
                          asChild 
                          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium"
                        >
                          <a 
                            href={getBookingUrl(site, selectedDate)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Book Now
                          </a>
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <CalendarView 
              availabilityData={availabilityData}
              selectedPark={selectedPark}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center space-y-3">
            <p className="text-sm text-gray-600">
              Data updates daily via automated scanning
            </p>
            <p className="text-xs text-gray-500">
              Last updated: {new Date().toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
            <p className="text-xs text-gray-500">
              For inquiries: <a href="mailto:meetr1912@gmail.com" className="text-gray-900 hover:underline font-medium">meetr1912@gmail.com</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
