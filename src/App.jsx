import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon, List, CheckCircle2, XCircle, TrendingUp,
  Search, MapPin, ChevronDown, Tent, ArrowRight, RefreshCw, AlertTriangle, Bell, X,
  SlidersHorizontal, RotateCcw, WifiOff, Database,
} from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import CalendarView from './CalendarView';
import SoonestOpenings from './SoonestOpenings';
import AlertDialog from './AlertDialog';
import FiltersPanel from './components/FiltersPanel';
import FiltersSheet from './components/FiltersSheet';
import ErrorBoundary from './components/ErrorBoundary';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useI18n } from './lib/i18n';
import { readUrlState, writeUrlState } from './lib/urlState';
import { saveCachedReport, readCachedReport } from './lib/storage';
import { buildStayIndex, sitesForStay } from './lib/stays';
import {
  normalizeReport, formatDate, formatTimestamp, countAvailable, buildBookingUrl,
  prettyUnit, splitPark, prettyLoop, isStale, generatedAgeHours,
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
    amber: 'bg-amber-50 text-amber-800',
  };
  const display = typeof value === 'number' ? value.toLocaleString(undefined) : value;
  return (
    <Card data-testid={testid} className="border-0 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">
              {label}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{display}</p>
            {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
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

function ParkGroup({ park, sites, defaultOpen, verify, selectedDate, metadata, nights }) {
  const [open, setOpen] = useState(defaultOpen);
  const { t, tn } = useI18n();
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
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${available ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            {area && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{parkName}</p>}
            <p className="truncate font-semibold text-gray-900">{area || parkName}</p>
            <p className="text-xs text-gray-500">{tn('park.sites', sites.length)}</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {verify && (
            <Badge
              className="inline-flex border-amber-200 bg-amber-50 text-amber-800"
              title={t('soonest.verifyTitle')}
            >
              <AlertTriangle className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">{t('park.verify')}</span>
            </Badge>
          )}
          <Badge className={available
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-transparent bg-gray-100 text-gray-500'}>
            {t('park.available', { n: available })}
          </Badge>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-3 pt-3 sm:gap-3 sm:p-5 sm:pt-4 lg:grid-cols-3">
          {sites.map((site, i) => (
            <SiteCard key={i} site={site} dateStr={selectedDate} metadata={metadata} nights={nights} />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteCard({ site, dateStr, metadata, nights = 1 }) {
  const { t } = useI18n();
  const loop = prettyLoop(site.PageTitle);
  const body = (
    <>
      <Badge className={`text-[11px] ${site.status
        ? 'border-transparent bg-emerald-700 text-white'
        : 'border-transparent bg-gray-200 text-gray-600'}`}>
        {site.status
          ? <><CheckCircle2 className="mr-1 h-3 w-3" />{t('site.available')}</>
          : <><XCircle className="mr-1 h-3 w-3" />{t('site.booked')}</>}
      </Badge>
      <p className="mt-1.5 font-semibold leading-tight text-gray-900">{prettyUnit(site.ResourceName, site.Type)}</p>
      {loop ? <p className="mt-0.5 text-xs text-gray-500">{loop}</p>
        : site.Type && <p className="mt-0.5 text-xs text-gray-500">{site.Type}</p>}
      {site.status && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          {t('site.reserve')} <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </>
  );
  if (site.status) {
    return (
      <a
        href={buildBookingUrl(site, dateStr, metadata, nights)}
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
  const { t } = useI18n();
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        aria-label={t('search.aria')}
        data-testid="search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('search.placeholder')}
        className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
    </div>
  );
}

function ActiveFilterChips({ selectedParks, selectedTypes, onRemovePark, onRemoveType, onClear, scroll = false, className = '' }) {
  const { t } = useI18n();
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
          aria-label={t('filters.removeFilter', { name: park })}
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
          aria-label={t('filters.removeFilter', { name: type })}
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
        {t('filters.clearAll')}
      </button>
    </div>
  );
}

function DataNotice({ notice, onRetry }) {
  const { t } = useI18n();
  if (!notice) return null;
  const icon = notice.kind === 'offline' ? <WifiOff className="h-4 w-4" />
    : notice.kind === 'cached' ? <Database className="h-4 w-4" />
    : <AlertTriangle className="h-4 w-4" />;
  const title = notice.kind === 'offline' ? t('data.offlineTitle')
    : notice.kind === 'stale' ? t('data.staleTitle')
    : notice.kind === 'incomplete' ? t('data.incomplete')
    : t('data.cachedBody', { time: notice.time });
  const body = notice.kind === 'stale'
    ? t('data.staleBody', { hours: notice.hours }) : null;
  return (
    <div
      data-testid="data-notice"
      data-kind={notice.kind}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
      role="status"
    >
      <p className="flex min-w-0 items-start gap-2 text-sm text-amber-900">
        <span className="mt-0.5 flex-shrink-0 text-amber-800">{icon}</span>
        <span className="min-w-0">
          <span className="font-medium">{title}</span>
          {body && <span className="block text-xs text-amber-800">{body}</span>}
        </span>
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
      >
        <RotateCcw className="h-3.5 w-3.5" /> {t('data.retry')}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  const { t } = useI18n();
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
        <p className="sr-only">{t('loading')}</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white p-6">
      <Card className="max-w-md border-0 shadow-sm" data-testid="error-state">
        <CardContent className="p-8 text-center">
          <XCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <p className="font-semibold text-gray-900">{t('error.title')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('error.body')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RotateCcw className="h-4 w-4" /> {t('error.retry')}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

const FETCH_TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 900;

async function fetchReportJson(url, signal) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal, cache: 'no-store' });
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        if (res.status < 500) throw error; // don't retry client errors
        lastError = error;
      } else {
        return await res.json();
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastError = e;
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  }
  throw lastError;
}

function App() {
  // Read shareable state once at mount.
  const initialUrlState = useMemo(() => readUrlState(), []);
  const { lang, setLang, t, tn } = useI18n();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [dataSource, setDataSource] = useState({ kind: 'live', cachedAt: null });
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  const [selectedDate, setSelectedDate] = useState(null);
  // Empty arrays mean "no filter" (all parks / all types).
  const [selectedParks, setSelectedParks] = useState(initialUrlState.parks || []);
  const [selectedTypes, setSelectedTypes] = useState(initialUrlState.types || []);
  const [search, setSearch] = useState(initialUrlState.q || '');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [viewMode, setViewMode] = useState(initialUrlState.view || 'list');
  const [nights, setNights] = useState(initialUrlState.nights || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertDate, setAlertDate] = useState(null);

  const isDesktop = useMediaQuery('(min-width: 640px)');
  const openAlert = useCallback((date) => { setAlertDate(date || null); setAlertOpen(true); }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const raw = await fetchReportJson(`${process.env.PUBLIC_URL}/availability_report.json`, controller.signal);
        const normalized = normalizeReport(raw);
        if (!normalized) throw new Error('Invalid or empty data');
        if (cancelled) return;
        setReport(normalized);
        setDataSource({ kind: 'live', cachedAt: null });
        setLoading(false);
        saveCachedReport(raw);
      } catch (e) {
        if (cancelled) return;
        console.error('Error loading availability data:', e);
        // Fall back to the last good snapshot cached on-device.
        const cached = await readCachedReport();
        if (cancelled) return;
        const normalized = cached ? normalizeReport(cached.raw) : null;
        if (normalized) {
          setReport(normalized);
          setDataSource({ kind: 'cache', cachedAt: cached.savedAt });
          setLoading(false);
          return;
        }
        setError(true);
        setLoading(false);
      } finally {
        clearTimeout(timer);
      }
    }
    load();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [reloadKey]);

  const retry = useCallback(() => { setReport(null); setReloadKey(k => k + 1); }, []);

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

  // Apply the date from the URL when the report arrives; otherwise pick the
  // first date with availability. Also drop URL state for values that no
  // longer exist in this snapshot.
  useEffect(() => {
    if (!report) return;
    const available = Object.keys(report.dates).filter(d => report.dates[d].some(s => s.status));
    setSelectedDate(prev => {
      if (prev && report.dates[prev]) return prev;
      if (initialUrlState.date && report.dates[initialUrlState.date]) return initialUrlState.date;
      return [...available].sort()[0] || Object.keys(report.dates).sort()[0];
    });
    setSelectedParks(prev => prev.filter(p => parks.includes(p)));
    setSelectedTypes(prev => prev.filter(tp => types.includes(tp)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, parks, types]);

  // Keep the URL in sync so views are shareable and reload-safe.
  useEffect(() => {
    writeUrlState({
      date: selectedDate,
      parks: selectedParks,
      types: selectedTypes,
      view: viewMode,
      nights,
      q: search,
      lang,
    });
  }, [selectedDate, selectedParks, selectedTypes, viewMode, nights, search, lang]);

  const stayIndex = useMemo(
    () => (report ? buildStayIndex(dates, report.dates, nights) : { index: {}, perDate: {} }),
    [report, dates, nights]);

  const datesWithAvailability = useMemo(
    () => Object.keys(stayIndex.perDate).sort(),
    [stayIndex]);

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
  const removeType = useCallback((type) => setSelectedTypes(prev => prev.filter(tp => tp !== type)), []);
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
  // The initial date is chosen from the report in an effect; render the
  // skeleton for that one intermediate frame instead of formatting null.
  if (!selectedDate) return <LoadingSkeleton />;

  const { metadata, history, warnings = [] } = report;

  const selectedSites = nights === 1
    ? (report.dates[selectedDate] || [])
    : sitesForStay(report.dates, selectedDate, nights);

  const upcomingDates = datesWithAvailability.filter(d => d >= selectedDate);
  const nextAvailableDate = upcomingDates[0] || datesWithAvailability[0];

  // Banner: prefer explicit offline/cached states over generic staleness.
  const cachedTime = dataSource.cachedAt
    ? formatTimestamp(new Date(dataSource.cachedAt).toISOString())
    : null;
  let notice = null;
  if (!online) notice = { kind: 'offline' };
  else if (dataSource.kind === 'cache') notice = { kind: 'cached', time: cachedTime };
  else if (isStale(metadata.generated_at)) notice = { kind: 'stale', hours: generatedAgeHours(metadata.generated_at) };
  else if (warnings.length) notice = { kind: 'incomplete' };

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
  // Multi-night listings only ever include available units.
  const filtered = (showOnlyAvailable && nights === 1)
    ? baseFiltered.filter(s => s.status)
    : baseFiltered;

  // Group filtered sites by park.
  const byPark = {};
  filtered.forEach(s => { (byPark[s.ParkName] ||= []).push(s); });
  const groupedParks = Object.keys(byPark).sort((a, b) =>
    countAvailable(byPark[b]) - countAvailable(byPark[a]) || a.localeCompare(b));

  const totalAvailable = nights === 1 ? countAvailable(selectedSites) : selectedSites.length;
  const parksAvailable = new Set(selectedSites.filter(s => s.status).map(s => s.ParkName)).size;
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
    nights,
    onSelectNights: setNights,
    parks,
    selectedParks,
    onChangeParks: setSelectedParks,
    types,
    selectedTypes,
    onChangeTypes: setSelectedTypes,
    showOnlyAvailable,
    // The switch only affects the single-night list view.
    onChangeShowOnlyAvailable: viewMode === 'list' && nights === 1 ? setShowOnlyAvailable : undefined,
  };

  const toggleLang = () => setLang(lang === 'en' ? 'fr' : 'en');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.28),transparent_45%),radial-gradient(circle_at_85%_100%,rgba(45,212,191,0.18),transparent_45%)]" />
        <button
          type="button"
          data-testid="lang-toggle"
          onClick={toggleLang}
          aria-label={t('lang.toggleAria', { lang: lang === 'en' ? 'Français' : 'English' })}
          className="absolute right-4 top-4 z-10 inline-flex h-9 items-center rounded-full bg-white/10 px-3 text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/15 backdrop-blur-xl transition-colors hover:bg-white/20"
        >
          {lang === 'en' ? 'FR' : 'EN'}
        </button>
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-20">
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur-xl sm:mb-6 sm:h-16 sm:w-16">
              <Tent className="h-6 w-6 text-emerald-300 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {t('app.title')}{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                {t('app.titleHighlight')}
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base font-light text-gray-300 sm:mt-4 sm:text-lg">
              {t('app.tagline', { units: metadata.total_units || 552, locations: metadata.total_parks || 51 })}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:mt-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 sm:text-sm">
                <CheckCircle2 className="h-4 w-4" />
                {tn('hero.daysWithOpenings', datesWithAvailability.length)}
              </span>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-gray-300 sm:text-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> {t('hero.updated', { time: lastUpdated })}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <DataNotice notice={notice} onRetry={retry} />

        {/* Overview stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:gap-4 lg:grid-cols-4">
          <StatCard
            testid="stat-available"
            label={nights === 1 ? t('stats.availableOn') : tn('stats.availableFor', nights)}
            value={totalAvailable}
            tone="green"
            icon={CheckCircle2}
            sub={nights === 1 ? t('stats.ofSites', { n: selectedSites.length }) : t('stats.ofSites', { n: metadata.total_units || selectedSites.length })}
          />
          <StatCard testid="stat-parks" label={t('stats.parksWithOpenings')} value={parksAvailable} tone="blue" icon={MapPin}
            sub={t('stats.ofParks', { n: metadata.total_parks || parks.length })} />
          <StatCard testid="stat-days" label={t('stats.daysWithAvailability')} value={datesWithAvailability.length} tone="amber" icon={CalendarIcon}
            sub={t('stats.nextDays', { n: dates.length })} />
          <StatCard testid="stat-slots" label={t('stats.totalOpenSlots')} value={metadata.total_available_slots ?? '—'} tone="green" icon={TrendingUp}>
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
                  aria-haspopup="dialog"
                  aria-expanded={filtersOpen}
                  aria-label={activeFilterCount ? tn('filters.active', activeFilterCount) : t('filters.button')}
                  className="relative inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {t('filters.button')}
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <TabsList className="h-11 flex-1 bg-gray-100 p-0.5 text-gray-600">
                  <TabsTrigger value="list" className="h-10 flex-1 gap-1.5 px-3 data-[state=active]:bg-white">
                    <List className="h-4 w-4" /> {t('view.list')}
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="h-10 flex-1 gap-1.5 px-3 data-[state=active]:bg-white">
                    <CalendarIcon className="h-4 w-4" /> {t('view.calendar')}
                  </TabsTrigger>
                </TabsList>
                <button
                  type="button"
                  onClick={() => openAlert(selectedDate)}
                  aria-label={t('alert.button')}
                  title={t('alert.button')}
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition-colors hover:bg-emerald-700"
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
                    <TabsList className="h-11 flex-1 bg-gray-100 p-0.5 text-gray-600 sm:flex-initial">
                      <TabsTrigger value="list" className="h-10 flex-1 gap-2 px-4 data-[state=active]:bg-white sm:flex-initial">
                        <List className="h-4 w-4" /> {t('view.list')}
                      </TabsTrigger>
                      <TabsTrigger value="calendar" className="h-10 flex-1 gap-2 px-4 data-[state=active]:bg-white sm:flex-initial">
                        <CalendarIcon className="h-4 w-4" /> {t('view.calendar')}
                      </TabsTrigger>
                    </TabsList>
                    <button
                      type="button"
                      onClick={() => openAlert(selectedDate)}
                      aria-label={t('alert.button')}
                      title={t('alert.button')}
                      className="inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <Bell className="h-4 w-4" /> <span className="hidden sm:inline">{t('alert.button')}</span>
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
            <ErrorBoundary title={t('boundary.title')} body={t('boundary.body')} actionLabel={t('boundary.reload')}>
              {/* Type-aware, soonest-first ranked feed across the selected parks */}
              <SoonestOpenings
                report={report} dates={dates}
                selectedParks={selectedParks} selectedTypes={selectedTypes}
                search={search} alwaysOpenParks={alwaysOpenParks} metadata={metadata}
                nights={nights}
                onPickPark={focusPark} onPickType={focusType}
                onClearTypes={() => setSelectedTypes([])}
                setSelectedDate={setSelectedDate} setSearch={setSearch}
              />
            </ErrorBoundary>

            {/* Quick date jumper */}
            {datesWithAvailability.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
                <span className="flex-shrink-0 text-xs font-semibold text-gray-500">{t('list.jumpTo')}</span>
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
                {nights > 1 && ` · ${tn('filters.nightsOption', nights)}`}
              </h2>
              {totalAvailable === 0 && nextAvailableDate && nextAvailableDate !== selectedDate && (
                <button onClick={() => setSelectedDate(nextAvailableDate)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
                  {t('list.nextOpening', { date: formatDate(nextAvailableDate, { month: 'short', day: 'numeric' }) })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {groupedParks.length === 0 ? (
              <Card className="border-0 shadow-sm" data-testid="empty-state">
                <CardContent className="p-12 text-center">
                  <XCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p className="font-medium text-gray-600">{t('list.empty')}</p>
                  <div className="mt-2 flex items-center justify-center gap-4 text-sm">
                    {showOnlyAvailable && nights === 1 && (
                      <button onClick={() => setShowOnlyAvailable(false)}
                        className="text-emerald-700 hover:underline">{t('list.showAllSites')}</button>
                    )}
                    {canClear && (
                      <button onClick={clearFilters} className="text-emerald-700 hover:underline">
                        {t('list.clearFilters')}
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
                    selectedDate={selectedDate} metadata={metadata} nights={nights}
                    defaultOpen={countAvailable(byPark[park]) > 0 || groupedParks.length <= 3} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <ErrorBoundary title={t('boundary.title')} body={t('boundary.body')} actionLabel={t('boundary.reload')}>
              <CalendarView
                availabilityData={report.dates}
                selectedParks={selectedParks}
                selectedTypes={selectedTypes}
                onAlert={openAlert}
                metadata={metadata}
                nights={nights}
              />
            </ErrorBoundary>
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
          <p className="text-sm text-gray-600">{t('footer.updates')}</p>
          {lastUpdated && <p className="text-xs text-gray-500">{t('footer.lastUpdated', { time: lastUpdated })}</p>}
          <p className="text-xs text-gray-500">
            {t('footer.inquiries')} <a href="mailto:meetr1912@gmail.com" className="font-medium text-gray-900 hover:underline">meetr1912@gmail.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
