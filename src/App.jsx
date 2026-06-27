import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon, List, CheckCircle2, XCircle, TrendingUp,
  Search, MapPin, ChevronDown, Tent, ArrowRight, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './components/ui/select';
import { Badge } from './components/ui/badge';
import CalendarView from './CalendarView';
import {
  normalizeReport, formatDate, formatTimestamp, countAvailable, BOOKING_URL,
  prettyUnit, splitPark, prettyLoop,
} from './lib/data';

function Sparkline({ data, className = '' }) {
  if (!data || data.length < 2) return null;
  const w = 120, h = 36, pad = 3;
  const values = data.map(d => d.available_slots ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline points={points.join(' ')} fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

function StatCard({ label, value, sub, icon: Icon, tone = 'gray', children }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-600',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
            {children}
          </div>
          {Icon && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ParkGroup({ park, sites, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const available = sites.filter(s => s.status).length;
  const { park: parkName, area } = splitPark(park);
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${available ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            {area && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{parkName}</p>}
            <p className="font-semibold text-gray-900 truncate">{area || parkName}</p>
            <p className="text-xs text-gray-500">{sites.length} oTENTiks</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge className={available
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-gray-100 text-gray-500 border-transparent'}>
            {available} available
          </Badge>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5 pt-0 border-t border-gray-100">
          {sites.map((site, i) => <SiteCard key={i} site={site} />)}
        </div>
      )}
    </div>
  );
}

function SiteCard({ site }) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${site.status
      ? 'border-emerald-200 bg-emerald-50/40 hover:shadow-md'
      : 'border-gray-200 bg-gray-50/50 opacity-80'}`}>
      <div className="flex items-center justify-between mb-2">
        <Badge className={site.status
          ? 'bg-emerald-600 text-white border-transparent'
          : 'bg-gray-200 text-gray-600 border-transparent'}>
          {site.status
            ? <><CheckCircle2 className="h-3 w-3 mr-1" />Available</>
            : <><XCircle className="h-3 w-3 mr-1" />Booked</>}
        </Badge>
      </div>
      <p className="font-semibold text-gray-900 leading-tight">{prettyUnit(site.ResourceName)}</p>
      {prettyLoop(site.PageTitle) && (
        <p className="text-xs text-gray-500 mt-0.5">{prettyLoop(site.PageTitle)}</p>
      )}
      {site.status && (
        <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Reserve on Parks Canada <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function App() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPark, setSelectedPark] = useState('all');
  const [search, setSearch] = useState('');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    const url = `${process.env.PUBLIC_URL}/availability_report.json`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(raw => {
        const normalized = normalizeReport(raw);
        if (!normalized) throw new Error('Invalid or empty data');
        setReport(normalized);
        const firstAvail = Object.keys(normalized.dates).sort()
          .find(d => normalized.dates[d].some(s => s.status));
        setSelectedDate(firstAvail || Object.keys(normalized.dates).sort()[0]);
        setLoading(false);
      })
      .catch(e => { console.error('Error loading availability data:', e); setError(true); setLoading(false); });
  }, []);

  const dates = useMemo(() => report ? Object.keys(report.dates).sort() : [], [report]);
  const parks = useMemo(() => {
    if (!report) return ['all'];
    const set = new Set();
    Object.values(report.dates).forEach(d => d.forEach(s => set.add(s.ParkName)));
    return ['all', ...Array.from(set).sort()];
  }, [report]);

  const datesWithAvailability = useMemo(
    () => dates.filter(d => report.dates[d].some(s => s.status)),
    [dates, report]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-gray-600 font-medium">Loading availability…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6">
        <Card className="max-w-md border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <XCircle className="h-10 w-10 mx-auto mb-4 text-red-400" />
            <p className="font-semibold text-gray-900">Unable to load data</p>
            <p className="text-sm text-gray-500 mt-1">Please ensure the availability report is accessible.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { metadata, history } = report;
  const selectedSites = (report.dates[selectedDate] || []);

  // Apply filters (park + search) for list view.
  const q = search.trim().toLowerCase();
  const matchesSearch = (s) => !q ||
    (s.ResourceName || '').toLowerCase().includes(q) ||
    (s.ParkName || '').toLowerCase().includes(q) ||
    (s.PageTitle || '').toLowerCase().includes(q);

  let filtered = selectedSites.filter(matchesSearch);
  if (selectedPark !== 'all') filtered = filtered.filter(s => s.ParkName === selectedPark);
  if (showOnlyAvailable) filtered = filtered.filter(s => s.status);

  // Group filtered sites by park.
  const byPark = {};
  filtered.forEach(s => { (byPark[s.ParkName] ||= []).push(s); });
  const groupedParks = Object.keys(byPark).sort((a, b) =>
    countAvailable(byPark[b]) - countAvailable(byPark[a]) || a.localeCompare(b));

  const totalAvailable = countAvailable(selectedSites);
  const parksAvailable = new Set(selectedSites.filter(s => s.status).map(s => s.ParkName)).size;
  const nextAvailableDate = datesWithAvailability.find(d => d >= selectedDate) || datesWithAvailability[0];
  const lastUpdated = formatTimestamp(metadata.generated_at);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-gray-900 to-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-white/10 backdrop-blur-xl rounded-2xl">
              <Tent className="h-8 w-8 text-emerald-300" />
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4 tracking-tight">
              Parks Canada{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                oTENTik Tracker
              </span>
            </h1>
            <p className="text-lg text-gray-300 max-w-xl mx-auto font-light">
              Live availability across {metadata.total_units || 122} oTENTik sites in {metadata.total_parks || 12} parks
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {datesWithAvailability.length} days with openings
              </span>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-gray-300 text-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Updated {lastUpdated}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Overview stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatCard label="Available on this date" value={totalAvailable} tone="green" icon={CheckCircle2}
            sub={`of ${selectedSites.length} sites`} />
          <StatCard label="Parks with openings" value={parksAvailable} tone="blue" icon={MapPin}
            sub={`of ${(metadata.total_parks || parks.length - 1)} parks`} />
          <StatCard label="Days with availability" value={datesWithAvailability.length} tone="amber" icon={CalendarIcon}
            sub={`next ${dates.length} days`} />
          <StatCard label="Total open slots" value={metadata.total_available_slots ?? '—'} tone="green" icon={TrendingUp}>
            {history.length > 1 && (
              <div className="text-emerald-500 mt-2"><Sparkline data={history} className="w-full h-8" /></div>
            )}
          </StatCard>
        </div>

        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          {/* Controls */}
          <Card className="mb-6 border-0 shadow-sm sticky top-2 z-20">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search site or park…"
                      className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400"
                    />
                  </div>
                  <TabsList className="bg-gray-100 h-11">
                    <TabsTrigger value="list" className="gap-2 data-[state=active]:bg-white px-4">
                      <List className="h-4 w-4" /> List
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-white px-4">
                      <CalendarIcon className="h-4 w-4" /> Calendar
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {viewMode === 'list' && (
                    <Select value={selectedDate} onValueChange={setSelectedDate}>
                      <SelectTrigger className="bg-white h-11">
                        <SelectValue placeholder="Select a date" />
                      </SelectTrigger>
                      <SelectContent>
                        {dates.map(date => {
                          const has = report.dates[date].some(s => s.status);
                          return (
                            <SelectItem key={date} value={date}>
                              <span className="flex items-center gap-2">
                                {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                {has && <span className="text-emerald-500">●</span>}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={selectedPark} onValueChange={setSelectedPark}>
                    <SelectTrigger className="bg-white h-11">
                      <SelectValue placeholder="All parks" />
                    </SelectTrigger>
                    <SelectContent>
                      {parks.map(park => (
                        <SelectItem key={park} value={park}>
                          {park === 'all' ? 'All parks' : park}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {viewMode === 'list' && (
                  <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 cursor-pointer">
                    <span className="text-sm font-medium text-gray-700">Show available only</span>
                    <button
                      type="button"
                      onClick={() => setShowOnlyAvailable(v => !v)}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${showOnlyAvailable ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`block h-5 w-5 bg-white rounded-full shadow transition-transform ${showOnlyAvailable ? 'translate-x-5' : ''}`} />
                    </button>
                  </label>
                )}
              </div>
            </CardContent>
          </Card>

          <TabsContent value="list" className="mt-0 space-y-6">
            {/* Quick date jumper */}
            {datesWithAvailability.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <span className="text-xs font-semibold text-gray-500 flex-shrink-0">Jump to:</span>
                {datesWithAvailability.slice(0, 14).map(date => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      date === selectedDate
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'}`}
                  >
                    {formatDate(date, { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              {totalAvailable === 0 && nextAvailableDate && nextAvailableDate !== selectedDate && (
                <button onClick={() => setSelectedDate(nextAvailableDate)}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1">
                  Next opening {formatDate(nextAvailableDate, { month: 'short', day: 'numeric' })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {groupedParks.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-12 text-center">
                  <XCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-600 font-medium">No sites match your filters</p>
                  {showOnlyAvailable && (
                    <button onClick={() => setShowOnlyAvailable(false)}
                      className="mt-2 text-sm text-emerald-700 hover:underline">Show all sites</button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {groupedParks.map(park => (
                  <ParkGroup key={park} park={park} sites={byPark[park]}
                    defaultOpen={countAvailable(byPark[park]) > 0 || groupedParks.length <= 3} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <CalendarView availabilityData={report.dates} selectedPark={selectedPark} />
          </TabsContent>
        </Tabs>
      </div>

      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center space-y-2">
          <p className="text-sm text-gray-600">Data updates daily via automated scanning of reservation.pc.gc.ca</p>
          {lastUpdated && <p className="text-xs text-gray-500">Last updated: {lastUpdated}</p>}
          <p className="text-xs text-gray-500">
            For inquiries: <a href="mailto:meetr1912@gmail.com" className="text-gray-900 hover:underline font-medium">meetr1912@gmail.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
