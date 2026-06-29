import React, { useMemo, useState } from 'react';
import { Clock, AlertTriangle, ArrowUpRight, XCircle } from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './components/ui/select';
import {
  splitPark, formatDate, parseLocalDate, todayStr, buildBookingUrl,
} from './lib/data';

const TYPE_DEFAULT = 'oTENTik';
const TOP_CAP = 8;          // collapse the open list to the soonest few by default
const MAX_CHIPS = 3;        // type chips per row before "+N"

const HORIZONS = [
  { key: 'any', label: 'Any time' },
  { key: 'week', label: 'Within a week' },
  { key: 'month', label: 'Within a month' },
];

const SORTS = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'open', label: 'Most open' },
  { key: 'az', label: 'A–Z' },
];

function isoAddDays(n) {
  const d = parseLocalDate(todayStr());
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAwayLabel(dateStr) {
  const n = Math.round((parseLocalDate(dateStr) - parseLocalDate(todayStr())) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `${n}d away`;
}

// Build a per-park index once per data load: for each park, the ascending
// list of dates it has any opening (with that day's total count), and the
// same per type. O(dates × sites) — one linear pass.
function buildIndex(dates, byDate) {
  const idx = {};
  for (const d of dates) {
    const perPark = {};
    for (const s of byDate[d]) {
      if (!s.status) continue;
      const park = s.ParkName;
      const type = s.Type || TYPE_DEFAULT;
      const pp = perPark[park] || (perPark[park] = { total: 0, types: {} });
      pp.total += 1;
      pp.types[type] = (pp.types[type] || 0) + 1;
    }
    for (const park of Object.keys(perPark)) {
      const pp = perPark[park];
      const e = idx[park] || (idx[park] = { anyDays: [], byType: {} });
      e.anyDays.push({ date: d, count: pp.total });
      for (const type of Object.keys(pp.types)) {
        (e.byType[type] || (e.byType[type] = [])).push({ date: d, count: pp.types[type] });
      }
    }
  }
  return idx;
}

function typeChipsForDate(entry, dateStr) {
  // Types open on a given date for a park, richest first, with each type's
  // own soonest date for deep-linking.
  return Object.keys(entry.byType)
    .map(type => {
      const onDay = entry.byType[type].find(x => x.date === dateStr);
      return onDay ? { type, count: onDay.count, date: entry.byType[type][0].date } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

function SoonestOpenings({
  report, dates, selectedType, search, alwaysOpenParks, metadata,
  setSelectedPark, setSelectedDate, setSelectedType,
}) {
  const [sortKey, setSortKey] = useState('soonest');
  const [horizon, setHorizon] = useState('any');
  const [showAll, setShowAll] = useState(false);
  const [tailOpen, setTailOpen] = useState(false);

  const index = useMemo(() => buildIndex(dates, report.dates), [dates, report]);
  const horizonDate = horizon === 'week' ? isoAddDays(7)
    : horizon === 'month' ? isoAddDays(30) : null;
  const q = (search || '').trim().toLowerCase();

  const { open, tail } = useMemo(() => {
    const allParks = Array.from(new Set([
      ...Object.keys(metadata?.locations || {}),
      ...Object.keys(index),
    ]));
    const rows = [];
    for (const parkName of allParks) {
      if (q && !parkName.toLowerCase().includes(q)) continue;
      const e = index[parkName];
      const { park, area } = splitPark(parkName);
      const series = !e ? null
        : selectedType === 'all' ? e.anyDays : e.byType[selectedType];
      const soonest = series && series[0];
      const within = soonest && (!horizonDate || soonest.date <= horizonDate);
      const verify = alwaysOpenParks.has(parkName);

      if (within) {
        let chips = [];
        if (selectedType === 'all') {
          chips = typeChipsForDate(e, soonest.date);
          if (chips.length <= 1) chips = []; // single type → redundant with count
        }
        rows.push({
          parkName, park, area, hasOpening: true,
          date: soonest.date, count: soonest.count, chips, verify,
          name: (area || park).toLowerCase(),
        });
      } else {
        // No opening for the current lens — explain why, helpfully.
        let reason;
        if (soonest) {
          reason = { kind: 'later', date: soonest.date }; // exists but beyond horizon
        } else if (selectedType !== 'all' && e && e.anyDays.length) {
          const altDate = e.anyDays[0].date;
          const top = typeChipsForDate(e, altDate)[0];
          reason = { kind: 'othertype', date: altDate, topType: top && top.type };
        } else {
          reason = { kind: 'none' };
        }
        rows.push({
          parkName, park, area, hasOpening: false, reason, verify,
          name: (area || park).toLowerCase(),
        });
      }
    }

    const cmp = {
      soonest: (a, b) => a.date.localeCompare(b.date) || b.count - a.count || a.name.localeCompare(b.name),
      open: (a, b) => b.count - a.count || a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
      az: (a, b) => a.name.localeCompare(b.name),
    }[sortKey];

    const openRows = rows.filter(r => r.hasOpening).sort((a, b) =>
      (a.verify ? 1 : 0) - (b.verify ? 1 : 0) || cmp(a, b));
    const tailRows = rows.filter(r => !r.hasOpening).sort((a, b) => a.name.localeCompare(b.name));
    return { open: openRows, tail: tailRows };
  }, [index, selectedType, q, sortKey, horizonDate, alwaysOpenParks, metadata]);

  const onPick = (parkName, date) => { setSelectedPark(parkName); if (date) setSelectedDate(date); };
  const onPickType = (parkName, type, date) => {
    setSelectedPark(parkName); setSelectedType(type); if (date) setSelectedDate(date);
  };

  const typeLabel = selectedType === 'all' ? 'All types' : selectedType;
  const horizonLabel = HORIZONS.find(h => h.key === horizon).label.toLowerCase();
  const shown = showAll ? open : open.slice(0, TOP_CAP);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900">Soonest openings</h3>
          </div>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="bg-white h-9 w-[140px] text-sm" aria-label="Sort soonest openings">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          {typeLabel} · {horizonLabel} · {open.length} park{open.length === 1 ? '' : 's'} with openings
        </p>

        {/* Date horizon pills */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {HORIZONS.map(h => (
            <button
              key={h.key}
              onClick={() => setHorizon(h.key)}
              aria-pressed={horizon === h.key}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                horizon === h.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'}`}
            >
              {h.label}
            </button>
          ))}
        </div>

        {open.length === 0 ? (
          <div className="text-center py-8">
            <XCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-600 font-medium">
              No {selectedType === 'all' ? '' : `${selectedType} `}openings {horizonLabel}
            </p>
            <div className="flex items-center justify-center gap-3 mt-2 text-sm">
              {horizon !== 'any' && (
                <button onClick={() => setHorizon('any')} className="text-emerald-700 hover:underline">Any time</button>
              )}
              {selectedType !== 'all' && (
                <button onClick={() => setSelectedType('all')} className="text-emerald-700 hover:underline">All types</button>
              )}
            </div>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {shown.map(r => (
                <SoonestRow key={r.parkName} row={r} metadata={metadata}
                  onPick={onPick} onPickType={onPickType} />
              ))}
            </ul>
            {open.length > TOP_CAP && (
              <button
                onClick={() => setShowAll(v => !v)}
                className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                {showAll ? 'Show fewer' : `Show all ${open.length} parks`}
              </button>
            )}
          </>
        )}

        {/* Honest disclosure of parks with nothing for the current lens */}
        {tail.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={() => setTailOpen(v => !v)}
              aria-expanded={tailOpen}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {tail.length} park{tail.length === 1 ? '' : 's'} with no{' '}
              {selectedType === 'all' ? 'openings' : `${selectedType}`}
              {horizon !== 'any' ? ` ${horizonLabel}` : ''} · {tailOpen ? 'hide' : 'show'}
            </button>
            {tailOpen && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {tail.map(r => <TailRow key={r.parkName} row={r} onPick={onPick} onPickType={onPickType} />)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SoonestRow({ row, metadata, onPick, onPickType }) {
  const { parkName, park, area, date, count, chips, verify } = row;
  const extraChips = chips.length - MAX_CHIPS;
  return (
    <li className={`rounded-xl border overflow-hidden ${verify ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
      <div className="flex items-stretch">
        <button
          onClick={() => onPick(parkName, date)}
          className="flex-1 min-w-0 text-left p-3 hover:bg-emerald-50/40 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-gray-900 truncate">{area || park}</p>
            <span className="text-sm font-semibold text-emerald-700 flex-shrink-0">
              {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 truncate">
              {area ? park : ' '}
            </p>
            {verify ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 flex-shrink-0"
                title="Shown available every day — confirm on Parks Canada before relying on it">
                <AlertTriangle className="h-3 w-3" /> {count} · verify
              </span>
            ) : (
              <span className="text-xs font-medium text-emerald-700 tabular-nums flex-shrink-0">
                {daysAwayLabel(date)} · {count} open
              </span>
            )}
          </div>
        </button>
        <a
          href={buildBookingUrl({ ParkName: parkName }, date, metadata)}
          target="_blank" rel="noopener noreferrer"
          aria-label={`Book ${area || park} on Parks Canada`}
          title="Book on Parks Canada"
          className="flex items-center px-3 border-l border-gray-100 text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      {chips.length > 1 && (
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {chips.slice(0, MAX_CHIPS).map(c => (
            <button
              key={c.type}
              onClick={() => onPickType(parkName, c.type, c.date)}
              className="flex-shrink-0 inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 text-[11px] font-medium hover:bg-emerald-100"
            >
              {c.type} {c.count}
            </button>
          ))}
          {extraChips > 0 && (
            <span className="flex-shrink-0 inline-flex items-center text-[11px] text-gray-400 px-1">+{extraChips}</span>
          )}
        </div>
      )}
    </li>
  );
}

function TailRow({ row, onPick, onPickType }) {
  const { parkName, park, area, reason } = row;
  return (
    <li className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-500 truncate">{area || park}</p>
        {reason.kind === 'later' && (
          <button onClick={() => onPick(parkName, reason.date)}
            className="text-xs font-medium text-emerald-700 hover:underline flex-shrink-0">
            Earliest {formatDate(reason.date, { month: 'short', day: 'numeric' })}
          </button>
        )}
        {reason.kind === 'othertype' && reason.topType && (
          <button onClick={() => onPickType(parkName, reason.topType, reason.date)}
            className="text-xs font-medium text-emerald-700 hover:underline flex-shrink-0">
            {reason.topType} {formatDate(reason.date, { month: 'short', day: 'numeric' })}
          </button>
        )}
        {reason.kind === 'none' && <span className="text-xs text-gray-400 flex-shrink-0">—</span>}
      </div>
    </li>
  );
}

export default SoonestOpenings;
