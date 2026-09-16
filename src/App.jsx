import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon, List, CheckCircle2, XCircle, TrendingUp,
  Search, MapPin, ChevronDown, Tent, ArrowRight, RefreshCw, AlertTriangle, Bell, X,
  SlidersHorizontal, RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import CalendarView from './CalendarView';
import SoonestOpenings from './SoonestOpenings';
import AlertDialog from './AlertDialog';
import FiltersPanel from './components/FiltersPanel';
import FiltersSheet from './components/FiltersSheet';
import { useMediaQuery } from './hooks/useMediaQuery';
import {
  normalizeReport, formatDate, formatTimestamp, countAvailable, buildBookingUrl,
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

function StatCard({ testid, label, value, sub, icon: Icon, tone = 'gray', children }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-600',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  return (
    <Card data-testid={testid} className="border-0 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">
              {label}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{display}</p>
            {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
            {children}
          </div>
          {Icon && (
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ParkGroup({ park, sites, defaultOpen, verify, selectedDate, metadata }) {
  const [open, setOpen] = useState(defaultOpen);
  const available = sites.filter(s => s.status).length;
  const { park: parkName, area } = splitPark(park);
  return (
    <div
      data-testid="park-group"
      data-park={park}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${available ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            {area && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{parkName}</p>}
            <p className="truncate font-semibold text-gray-900">{area || parkName}</p>
            <p className="text-xs text-gray-500">{sites.length} site{sites.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {verify && (
            <Badge
              className="inline-flex border-amber-200 bg-amber-50 text-amber-700"
              title="Shown available every day — confirm on Parks Canada before relying on it"
            >
              <AlertTriangle className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Verify</span>
            </Badge>
          )}
          <Badge className={available
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-transparent bg-gray-100 text-gray-500'}>
            {available} available
          </Badge>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-3 pt-3 sm:gap-3 sm:p-5 sm:pt-4 lg:grid-cols-3">
          {sites.map((site, i) => <SiteCard key={i} site={site} dateStr={selectedDate} metadata={metadata} />)}
        </div>
      )}
    </div>
  );
}

function SiteCard({ site, dateStr, metadata }) {
  const loop = prettyLoop(site.PageTitle);
  const body = (
    <>
      <Badge className={`text-[11px] ${site.status
        ? 'border-transparent bg-emerald-600 text-white'
        : 'border-transparent bg-gray-200 text-gray-600'}`}>
        {site.status
          ? <><CheckCircle2 className="mr-1 h-3 w-3" />Available</>
          : <><XCircle className="mr-1 h-3 w-3" />Booked</>}
      </Badge>
      <p className="mt-1.5 font-semibold leading-tight text-gray-900">{prettyUnit(site.ResourceName, site.Type)}</p>
      {loop ? <p className="mt-0.5 text-xs text-gray-500">{loop}</p>
        : site.Type && <p className="mt-0.5 text-xs text-gray-500">{site.Type}</p>}
      {site.status && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          Reserve <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </>
  );
  if (site.status) {
    return (
      <a
        href={buildBookingUrl(site, dateStr, metadata)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="site-card"
        data-status="available"
        className="block rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 transition-all hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-[0.99]"
      >
        {body}
      </a>
    );
  }
  return (
    <div data-testid="site-card" data-status="booked" className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 opacity-80">
      {body}
    </div>
  );
}

function SearchInput({ value, onChange, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        aria-label="Search site or park"
        data-testid="search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search site or park…"
        className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
    </div>
  );
}

function ActiveFilterChips({ selectedParks, selectedTypes, onRemovePark, onRemoveType, onClear, scroll = false, className = '' }) {
  if (!selectedParks.length && !selectedTypes.length) return null;
  return (
    <div
      data-testid="active-filters"
      className={`flex items-center gap-1.5 ${scroll ? 'overflow-x-auto overscroll-x-contain pb-0.5' : 'flex-wrap'} ${className}`}
    >
      {selectedParks.map(park => (
        <button
          key={`park-${park}`}
          type="button"
          onClick={() => onRemovePark(park)}
          aria-label={`Remove ${park} filter`}
          className="inline-flex max-w-[240px] flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:border-emerald-300"
        >
          <span className="truncate">{park}</span>
          <X className="h-3 w-3 flex-shrink-0" />
        </button>
      ))}
      {selectedTypes.map(type => (
        <button
          key={`type-${type}`}
          type="button"
          onClick={() => onRemoveType(type)}
          aria-label={`Remove ${type} filter`}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-gray-300"
        >
          {type}
          <X className="h-3 w-3 flex-shrink-0" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="flex-shrink-0 text-xs font-medium text-gray-500 underline hover:text-gray-700"
      >
        Clear all
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50" data-testid="loading">
      <div className="h-56 bg-gradient-to-br from-emerald-900 via-gray-900 to-gray-950 sm:h-72" />
      <div className="mx-auto max-w-6xl animate-pulse px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-white shadow-sm sm:h-32" />)}
        </div>
        <div className="mb-6 h-32 rounded-2xl bg-white shadow-sm sm:h-24" />
        <div className="space-y-3">
          <div className="h-16 rounded-2xl bg-white shadow-sm" />
          <div className="h-20 rounded-2xl bg-white shadow-sm" />
          <div className="h-20 rounded-2xl bg-white shadow-sm" />
        </div>
        <p className="sr-only">Loading availability…</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6">
      <Card className="max-w-md border-0 shadow-sm" data-testid="error-state">
        <CardContent className="p-8 text-center">
          <XCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <p className="font-semibold text-gray-900">Unable to load availability data</p>
          <p className="mt-1 text-sm text-gray-500">
            The report could not be fetched. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  // Empty arrays mean "no filter" (all parks / all types).
  const [selectedParks, setSelectedParks] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertDate, setAlertDate] = useState(null);

  const isDesktop = useMediaQuery('(min-width: 640px)');
  const openAlert = useCallback((date) => { setAlertDate(date || null); setAlertOpen(true); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const url = `${process.env.PUBLIC_URL}/availability_report.json`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(raw => {
        if (cancelled) return;
        const normalized = normalizeReport(raw);
        if (!normalized) throw new Error('Invalid or empty data');
        setReport(normalized);
        const firstAvail = Object.keys(normalized.dates).sort()
          .find(d => normalized.dates[d].some(s => s.status));
        setSelectedDate(firstAvail || Object.keys(normalized.dates).sort()[0]);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        console.error('Error loading availability data:', e);
        setError(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = () => { setReport(null); setReloadKey(k => k + 1); };

  const dates = useMemo(() => report ? Object.keys(report.dates).sort() : [], [report]);
  const parks = useMemo(() => {
    if (!report) return [];
    const set = new Set();
    Object.values(report.dates).forEach(d => d.forEach(s => set.add(s.ParkName)));
    return Array.from(set).sort();
  }, [report]);
  const types = useMemo(() => {
    if (!report) return [];
    if (Array.isArray(report.metadata?.types) && report.metadata.types.length)
      return [...report.metadata.types];
    const set = new Set();
    Object.values(report.dates).forEach(d => d.forEach(s => s.Type && set.add(s.Type)));
    return Array.from(set).sort();
  }, [report]);

  const datesWithAvailability = useMemo(
    () => dates.filter(d => report.dates[d].some(s => s.status)),
    [dates, report]);

  // Parks shown available on every single day — flagged for the user to verify.
  // Prefer the scraper-computed list; fall back to computing from the data.
  const alwaysOpenParks = useMemo(() => {
    if (!report) return new Set();
    if (Array.isArray(report.metadata?.always_available_parks)) {
      return new Set(report.metadata.always_available_parks);
    }
    const totals = {};
    (report.dates[dates[0]] || []).forEach(s => {
      totals[s.ParkName] = (totals[s.ParkName] || 0) + 1;
    });
    const flagged = new Set(Object.keys(totals));
    for (const d of dates) {
      const open = {};
      report.dates[d].forEach(s => { if (s.status) open[s.ParkName] = (open[s.ParkName] || 0) + 1; });
      for (const p of [...flagged]) if ((open[p] || 0) !== totals[p]) flagged.delete(p);
      if (!flagged.size) break;
    }
    return flagged;
  }, [report, dates]);

  const removePark = useCallback((park) => setSelectedParks(prev => prev.filter(p => p !== park)), []);
  const removeType = useCallback((type) => setSelectedTypes(prev => prev.filter(t => t !== type)), []);
  const clearFilters = useCallback(() => {
    setSelectedParks([]);
    setSelectedTypes([]);
    setShowOnlyAvailable(true);
  }, []);

  // Picking a park/type from the ranked feed drills in like before — but when
  // several are already selected, keep the multi-selection instead of
  // collapsing it to one.
  const focusPark = (park) => setSelectedParks(prev =>
    prev.length > 1 && prev.includes(park) ? prev : [park]);
  const focusType = (type) => setSelectedTypes(prev =>
    prev.length > 1 && prev.includes(type) ? prev : [type]);

  if (loading) return <LoadingSkeleton />;
  if (error || !report) return <ErrorState onRetry={retry} />;

  const { metadata, history } = report;
  const selectedSites = (report.dates[selectedDate] || []);

  // Apply filters (park + type + search) for the list/calendar lens.
  const q = search.trim().toLowerCase();
  const matchesSearch = (s) => !q ||
    (s.ResourceName || '').toLowerCase().includes(q) ||
    (s.ParkName || '').toLowerCase().includes(q) ||
    (s.PageTitle || '').toLowerCase().includes(q);

  const baseFiltered = selectedSites
    .filter(matchesSearch)
    .filter(s => !selectedParks.length || selectedParks.includes(s.ParkName))
    .filter(s => !selectedTypes.length || selectedTypes.includes(s.Type || 'oTENTik'));
  const filtered = showOnlyAvailable ? baseFiltered.filter(s => s.status) : baseFiltered;

  // Group filtered sites by park.
  const byPark = {};
  filtered.forEach(s => { (byPark[s.ParkName] ||= []).push(s); });
  const groupedParks = Object.keys(byPark).sort((a, b) =>
    countAvailable(byPark[b]) - countAvailable(byPark[a]) || a.localeCompare(b));

  const totalAvailable = countAvailable(selectedSites);
  const parksAvailable = new Set(selectedSites.filter(s => s.status).map(s => s.ParkName)).size;
  const nextAvailableDate = datesWithAvailability.find(d => d >= selectedDate) || datesWithAvailability[0];
  const lastUpdated = formatTimestamp(metadata.generated_at);
  const activeFilterCount = selectedParks.length + selectedTypes.length + (!showOnlyAvailable ? 1 : 0);
  const canClear = activeFilterCount > 0;

  const applyFilters = () => {
    setFiltersOpen(false);
    requestAnimationFrame(() => {
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const filterPanelProps = {
    dates,
    availableDates: datesWithAvailability,
    selectedDate,
    onSelectDate: setSelectedDate,
    parks,
    selectedParks,
    onChangeParks: setSelectedParks,
    types,
    selectedTypes,
    onChangeTypes: setSelectedTypes,
    showOnlyAvailable,
    // The switch only affects the list view.
    onChangeShowOnlyAvailable: viewMode === 'list' ? setShowOnlyAvailable : undefined,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.28),transparent_45%),radial-gradient(circle_at_85%_100%,rgba(45,212,191,0.18),transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-20">
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur-xl sm:mb-6 sm:h-16 sm:w-16">
              <Tent className="h-6 w-6 text-emerald-300 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Parks Canada{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                Camping Tracker
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base font-light text-gray-300 sm:mt-4 sm:text-lg">
              Live availability for oTENTiks, yurts, cabins &amp; more across{' '}
              {metadata.total_units || 552} prebuilt sites in {metadata.total_parks || 51} locations
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:mt-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 sm:text-sm">
                <CheckCircle2 className="h-4 w-4" />
                {datesWithAvailability.length} days with openings
              </span>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-gray-300 sm:text-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Updated {lastUpdated}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Overview stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:gap-4 lg:grid-cols-4">
          <StatCard testid="stat-available" label="Available on this date" value={totalAvailable} tone="green" icon={CheckCircle2}
            sub={`of ${selectedSites.length} sites`} />
          <StatCard testid="stat-parks" label="Parks with openings" value={parksAvailable} tone="blue" icon={MapPin}
            sub={`of ${(metadata.total_parks || parks.length)} parks`} />
          <StatCard testid="stat-days" label="Days with availability" value={datesWithAvailability.length} tone="amber" icon={CalendarIcon}
            sub={`next ${dates.length} days`} />
          <StatCard testid="stat-slots" label="Total open slots" value={metadata.total_available_slots ?? '—'} tone="green" icon={TrendingUp}>
            {history.length > 1 && (
              <div className="mt-2 text-emerald-500"><Sparkline data={history} className="h-8 w-full" /></div>
            )}
          </StatCard>
        </div>

        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          {/* Mobile: compact sticky bar + bottom-sheet filters */}
          {!isDesktop && (
            <div
              data-testid="mobile-controls"
              className="sticky top-0 z-30 -mx-4 mb-5 border-b border-gray-200/70 bg-white/90 px-4 pb-2.5 pt-2.5 backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} className="flex-1" />
                <button
                  type="button"
                  data-testid="filters-button"
                  onClick={() => setFiltersOpen(true)}
                  aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : 'Filters'}
                  className="relative inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <TabsList className="h-11 flex-1 bg-gray-100 p-0.5">
                  <TabsTrigger value="list" className="h-10 flex-1 gap-1.5 px-3 data-[state=active]:bg-white">
                    <List className="h-4 w-4" /> List
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="h-10 flex-1 gap-1.5 px-3 data-[state=active]:bg-white">
                    <CalendarIcon className="h-4 w-4" /> Calendar
                  </TabsTrigger>
                </TabsList>
                <button
                  type="button"
                  onClick={() => openAlert(selectedDate)}
                  aria-label="Alert me"
                  title="Get an availability alert"
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </div>
              <ActiveFilterChips
                scroll
                className="mt-2"
                selectedParks={selectedParks}
                selectedTypes={selectedTypes}
                onRemovePark={removePark}
                onRemoveType={removeType}
                onClear={clearFilters}
              />
            </div>
          )}

          {/* Desktop: inline sticky filter card */}
          {isDesktop && (
            <Card data-testid="desktop-controls" className="sticky top-3 z-20 mb-6 border-0 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <SearchInput value={search} onChange={setSearch} className="flex-1" />
                  <div className="flex gap-2">
                    <TabsList className="h-11 flex-1 bg-gray-100 p-0.5 sm:flex-initial">
                      <TabsTrigger value="list" className="h-10 flex-1 gap-2 px-4 data-[state=active]:bg-white sm:flex-initial">
                        <List className="h-4 w-4" /> List
                      </TabsTrigger>
                      <TabsTrigger value="calendar" className="h-10 flex-1 gap-2 px-4 data-[state=active]:bg-white sm:flex-initial">
                        <CalendarIcon className="h-4 w-4" /> Calendar
                      </TabsTrigger>
                    </TabsList>
                    <button
                      type="button"
                      onClick={() => openAlert(selectedDate)}
                      aria-label="Alert me"
                      title="Get an availability alert"
                      className="inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <Bell className="h-4 w-4" /> <span className="hidden sm:inline">Alert me</span>
                    </button>
                  </div>
                </div>
                <ActiveFilterChips
                  selectedParks={selectedParks}
                  selectedTypes={selectedTypes}
                  onRemovePark={removePark}
                  onRemoveType={removeType}
                  onClear={clearFilters}
                />
                <FiltersPanel idPrefix="desktop" showDate={viewMode === 'list'} {...filterPanelProps} />
              </CardContent>
            </Card>
          )}

          <TabsContent value="list" className="mt-0 space-y-6">
            <div id="results" className="scroll-mt-40 sm:scroll-mt-44" />
            {/* Type-aware, soonest-first ranked feed across the selected parks */}
            <SoonestOpenings
              report={report} dates={dates}
              selectedParks={selectedParks} selectedTypes={selectedTypes}
              search={search} alwaysOpenParks={alwaysOpenParks} metadata={metadata}
              onPickPark={focusPark} onPickType={focusType}
              onClearTypes={() => setSelectedTypes([])}
              setSelectedDate={setSelectedDate} setSearch={setSearch}
            />

            {/* Quick date jumper */}
            {datesWithAvailability.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
                <span className="flex-shrink-0 text-xs font-semibold text-gray-500">Jump to:</span>
                {datesWithAvailability.slice(0, 14).map(date => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      date === selectedDate
                        ? 'bg-gray-900 text-white'
                        : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                  >
                    {formatDate(date, { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 data-testid="results-heading" className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              {totalAvailable === 0 && nextAvailableDate && nextAvailableDate !== selectedDate && (
                <button onClick={() => setSelectedDate(nextAvailableDate)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
                  Next opening {formatDate(nextAvailableDate, { month: 'short', day: 'numeric' })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {groupedParks.length === 0 ? (
              <Card className="border-0 shadow-sm" data-testid="empty-state">
                <CardContent className="p-12 text-center">
                  <XCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p className="font-medium text-gray-600">No sites match your filters</p>
                  <div className="mt-2 flex items-center justify-center gap-4 text-sm">
                    {showOnlyAvailable && (
                      <button onClick={() => setShowOnlyAvailable(false)}
                        className="text-emerald-700 hover:underline">Show all sites</button>
                    )}
                    {canClear && (
                      <button onClick={clearFilters} className="text-emerald-700 hover:underline">
                        Clear filters
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {groupedParks.map(park => (
                  <ParkGroup key={park} park={park} sites={byPark[park]}
                    verify={alwaysOpenParks.has(park)}
                    selectedDate={selectedDate} metadata={metadata}
                    defaultOpen={countAvailable(byPark[park]) > 0 || groupedParks.length <= 3} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <CalendarView
              availabilityData={report.dates}
              selectedParks={selectedParks}
              selectedTypes={selectedTypes}
              onAlert={openAlert}
              metadata={metadata}
            />
          </TabsContent>
        </Tabs>
      </div>

      {!isDesktop && (
        <FiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          resultCount={baseFiltered.length}
          onClear={clearFilters}
          canClear={canClear}
          onApply={applyFilters}
        >
          <FiltersPanel idPrefix="sheet" showDate={viewMode === 'list'} {...filterPanelProps} />
        </FiltersSheet>
      )}

      <AlertDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        dates={dates}
        parks={parks}
        initialDate={alertDate || selectedDate}
        initialParks={selectedParks}
      />

      <footer className="mt-12 border-t border-gray-200">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-center sm:px-6 sm:py-10">
          <p className="text-sm text-gray-600">Data updates every few hours via automated scanning of reservation.pc.gc.ca</p>
          {lastUpdated && <p className="text-xs text-gray-500">Last updated: {lastUpdated}</p>}
          <p className="text-xs text-gray-500">
            For inquiries: <a href="mailto:meetr1912@gmail.com" className="font-medium text-gray-900 hover:underline">meetr1912@gmail.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
