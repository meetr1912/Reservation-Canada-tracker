import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { CheckCircle2, MapPin, Bell } from 'lucide-react';
import { Button } from './components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './components/ui/dialog';
import { parseLocalDate, formatDate, buildBookingUrl, prettyUnit, prettyLoop } from './lib/data';
import { sitesForStay } from './lib/stays';
import { useI18n } from './lib/i18n';

// Heatmap buckets keyed off the busiest single day in the dataset.
function intensityClass(count, max) {
  if (!count) return 'bg-white border-gray-200 text-gray-500';
  const r = count / (max || 1);
  if (r > 0.66) return 'bg-emerald-700 border-emerald-700 text-white';
  if (r > 0.33) return 'bg-emerald-300 border-emerald-400 text-emerald-950';
  return 'bg-emerald-50 border-emerald-200 text-emerald-900';
}

function CalendarView({ availabilityData, selectedParks = [], selectedTypes = [], onAlert, metadata, nights = 1 }) {
  const { t } = useI18n();
  const matchesFilters = useMemo(() => (s) =>
    (selectedParks.length === 0 || selectedParks.includes(s.ParkName))
    && (selectedTypes.length === 0 || selectedTypes.includes(s.Type || 'oTENTik')),
    [selectedParks, selectedTypes]);

  const dates = useMemo(() => Object.keys(availabilityData || {}).sort(), [availabilityData]);

  const countFor = useMemo(() => (dateStr) => {
    if (!availabilityData?.[dateStr]) return 0;
    return sitesForStay(availabilityData, dateStr, nights).filter(matchesFilters).length;
  }, [availabilityData, matchesFilters, nights]);

  const maxCount = useMemo(() => {
    let m = 0;
    dates.forEach(d => { m = Math.max(m, countFor(d)); });
    return m;
  }, [dates, countFor]);

  if (!availabilityData) return null;

  const datesByMonth = {};
  dates.forEach(date => {
    const d = parseLocalDate(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (datesByMonth[key] ||= []).push(date);
  });
  const months = Object.keys(datesByMonth).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Month jump */}
        <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
          <span className="flex-shrink-0 text-xs font-semibold text-gray-500">{t('list.jumpTo')}</span>
          {months.map(monthKey => (
            <button
              key={monthKey}
              type="button"
              onClick={() => document.getElementById(`month-${monthKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex-shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300"
            >
              {formatDate(`${monthKey}-01`, { month: 'short', year: 'numeric' })}
            </button>
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-600">{t('calendar.availability')}</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-gray-200 bg-white" /> {t('calendar.none')}</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-emerald-200 bg-emerald-50" /> {t('calendar.low')}</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-emerald-400 bg-emerald-300" /> {t('calendar.medium')}</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-emerald-700" /> {t('calendar.high')}</span>
        </div>
      </div>
      {nights > 1 && (
        <p className="text-xs text-gray-500">{t('calendar.nightsHint', { n: nights })}</p>
      )}
      {months.map(monthKey => (
        <MonthCalendar key={monthKey} monthKey={monthKey}
          availabilityData={availabilityData} matchesFilters={matchesFilters}
          countFor={countFor} maxCount={maxCount} onAlert={onAlert} metadata={metadata} nights={nights} />
      ))}
    </div>
  );
}

function MonthCalendar({ monthKey, availabilityData, matchesFilters, countFor, maxCount, onAlert, metadata, nights }) {
  const { t, tn } = useI18n();
  const [selectedDate, setSelectedDate] = useState(null);
  const [open, setOpen] = useState(false);

  const [year, month] = monthKey.split('-').map(Number);
  const monthName = formatDate(`${monthKey}-01`, { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  const sitesFor = (dateStr) => sitesForStay(availabilityData, dateStr, nights).filter(matchesFilters);

  const handleClick = (dateStr) => {
    if (countFor(dateStr) > 0) { setSelectedDate(dateStr); setOpen(true); }
  };

  const todayStr = new Date().toDateString();
  const selectedSites = selectedDate ? sitesFor(selectedDate) : [];

  return (
    <>
      <Card id={`month-${monthKey}`} className="scroll-mt-36 border-0 shadow-sm sm:scroll-mt-56">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold">{monthName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                {/* 2024-01-07 was a Sunday — stable anchor for localized headers */}
                {formatDate(`2024-01-${String(7 + i).padStart(2, '0')}`, { weekday: 'short' })}
              </div>
            ))}
            {cells.map((dateStr, i) => {
              if (!dateStr) return <div key={`e-${i}`} className="aspect-square" />;
              const count = countFor(dateStr);
              const has = count > 0;
              const isToday = parseLocalDate(dateStr).toDateString() === todayStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => handleClick(dateStr)}
                  disabled={!has}
                  data-testid="calendar-day"
                  data-date={dateStr}
                  aria-label={has
                    ? t('calendar.dayAria', { date: formatDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric' }), count })
                    : t('calendar.dayAriaNone', { date: formatDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric' }) })}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border transition-all sm:rounded-xl
                    ${intensityClass(count, maxCount)}
                    ${has ? 'cursor-pointer hover:scale-105 hover:shadow-md' : 'cursor-default'}
                    ${isToday ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`}
                >
                  <span className="text-xs font-semibold leading-none sm:text-base">
                    {parseLocalDate(dateStr).getDate()}
                  </span>
                  {has && <span className="mt-0.5 text-[9px] font-semibold opacity-90 sm:text-xs">{count}</span>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="day-dialog"
          className="max-h-[80vh] max-w-2xl overflow-y-auto max-sm:left-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {tn('calendar.sitesAvailable', selectedSites.length)}
            </DialogTitle>
            <DialogDescription>
              {selectedDate && formatDate(selectedDate, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
              {nights > 1 && ` · ${tn('filters.nightsOption', nights)}`}
            </DialogDescription>
          </DialogHeader>
          {onAlert && (
            <div className="mt-3">
              <Button variant="outline" size="sm"
                onClick={() => { setOpen(false); onAlert(selectedDate); }}
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Bell className="h-3.5 w-3.5" /> {t('calendar.alertForDate')}
              </Button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3 pb-[env(safe-area-inset-bottom)] sm:grid-cols-2">
            {selectedSites.map((site, i) => (
              <div key={i} data-testid="calendar-site" className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <Badge className="mb-2 border-transparent bg-emerald-700 text-white">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {t('site.available')}
                </Badge>
                <p className="font-semibold text-gray-900">{prettyUnit(site.ResourceName, site.Type)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
                  <MapPin className="h-3 w-3" /> {site.ParkName}
                </p>
                {prettyLoop(site.PageTitle) && <p className="text-xs text-gray-500">{prettyLoop(site.PageTitle)}</p>}
                <a href={buildBookingUrl(site, selectedDate, metadata, nights)} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800">
                  {t('calendar.reserve')}
                </a>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CalendarView;
