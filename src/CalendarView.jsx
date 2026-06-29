import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { CheckCircle2, MapPin, Bell } from 'lucide-react';
import { Button } from './components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './components/ui/dialog';
import { parseLocalDate, formatDate, BOOKING_URL, prettyUnit, prettyLoop } from './lib/data';

// Heatmap buckets keyed off the busiest single day in the dataset.
function intensityClass(count, max) {
  if (!count) return 'bg-white border-gray-200 text-gray-400';
  const r = count / (max || 1);
  if (r > 0.66) return 'bg-emerald-600 border-emerald-600 text-white';
  if (r > 0.33) return 'bg-emerald-400 border-emerald-400 text-white';
  return 'bg-emerald-100 border-emerald-200 text-emerald-900';
}

function CalendarView({ availabilityData, selectedPark, selectedType, onAlert }) {
  const matchesFilters = useMemo(() => (s) =>
    s.status
    && (!selectedPark || selectedPark === 'all' || s.ParkName === selectedPark)
    && (!selectedType || selectedType === 'all' || (s.Type || 'oTENTik') === selectedType),
    [selectedPark, selectedType]);

  const countFor = useMemo(() => (dateStr) => {
    const sites = availabilityData?.[dateStr];
    if (!sites) return 0;
    return sites.filter(matchesFilters).length;
  }, [availabilityData, matchesFilters]);

  const maxCount = useMemo(() => {
    let m = 0;
    Object.keys(availabilityData || {}).forEach(d => { m = Math.max(m, countFor(d)); });
    return m;
  }, [availabilityData, countFor]);

  if (!availabilityData) return null;

  const datesByMonth = {};
  Object.keys(availabilityData).forEach(date => {
    const d = parseLocalDate(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (datesByMonth[key] ||= []).push(date);
  });
  const months = Object.keys(datesByMonth).sort();

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="font-medium text-gray-600">Availability:</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white border border-gray-200" /> None</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200" /> Low</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-400" /> Medium</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-600" /> High</span>
      </div>
      {months.map(monthKey => (
        <MonthCalendar key={monthKey} monthKey={monthKey}
          availabilityData={availabilityData} matchesFilters={matchesFilters}
          countFor={countFor} maxCount={maxCount} onAlert={onAlert} />
      ))}
    </div>
  );
}

function MonthCalendar({ monthKey, availabilityData, matchesFilters, countFor, maxCount, onAlert }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [open, setOpen] = useState(false);

  const [year, month] = monthKey.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  const sitesFor = (dateStr) => (availabilityData[dateStr] || []).filter(matchesFilters);

  const handleClick = (dateStr) => {
    if (countFor(dateStr) > 0) { setSelectedDate(dateStr); setOpen(true); }
  };

  const todayStr = new Date().toDateString();
  const selectedSites = selectedDate ? sitesFor(selectedDate) : [];

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold">{monthName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">
                {d}
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
                  className={`relative aspect-square rounded-lg sm:rounded-xl border flex flex-col items-center justify-center transition-all
                    ${intensityClass(count, maxCount)}
                    ${has ? 'hover:scale-105 hover:shadow-md cursor-pointer' : 'cursor-default'}
                    ${isToday ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`}
                >
                  <span className="text-xs sm:text-base font-semibold leading-none">
                    {parseLocalDate(dateStr).getDate()}
                  </span>
                  {has && <span className="text-[9px] sm:text-xs font-semibold mt-0.5 opacity-90">{count}</span>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {selectedSites.length} site{selectedSites.length === 1 ? '' : 's'} available
            </DialogTitle>
            <DialogDescription>
              {selectedDate && formatDate(selectedDate, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </DialogDescription>
          </DialogHeader>
          {onAlert && (
            <div className="mt-3">
              <Button variant="outline" size="sm"
                onClick={() => { setOpen(false); onAlert(selectedDate); }}
                className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Bell className="h-3.5 w-3.5" /> Alert me for this date
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {selectedSites.map((site, i) => (
              <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <Badge className="bg-emerald-600 text-white border-transparent mb-2">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Available
                </Badge>
                <p className="font-semibold text-gray-900">{prettyUnit(site.ResourceName, site.Type)}</p>
                <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" /> {site.ParkName}
                </p>
                {prettyLoop(site.PageTitle) && <p className="text-xs text-gray-500">{prettyLoop(site.PageTitle)}</p>}
                <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800">
                  Reserve on Parks Canada →
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
