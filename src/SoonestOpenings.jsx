import React, { useMemo, useState } from 'react';
import { Clock, AlertTriangle, ArrowUpRight, XCircle } from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './components/ui/select';
import {
  splitPark, formatDate, parseLocalDate, todayStr, buildBookingUrl,
} from './lib/data';
import { buildStayIndex } from './lib/stays';
import { useI18n } from './lib/i18n';

const TOP_CAP = 8;          // collapse the open list to the soonest few by default
const MAX_CHIPS = 3;        // type chips per row before "+N"

function isoAddDays(n) {
  const d = parseLocalDate(todayStr());
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Types open on a given date for a park, richest first, with each type's
// own soonest date for deep-linking. When types are already filtered, only
// surface those.
function typeChipsForDate(entry, dateStr, allowedTypes) {
  return Object.keys(entry.byType)
    .filter(type => !allowedTypes || allowedTypes.length === 0 || allowedTypes.includes(type))
    .map(type => {
      const onDay = entry.byType[type].find(x => x.date === dateStr);
      return onDay ? { type, count: onDay.count, date: entry.byType[type][0].date } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

function typesSummary(types, t, tn) {
  if (!types || types.length === 0) return t('soonest.allTypes');
  if (types.length <= 2) return types.join(', ');
  return tn('soonest.typesLabel', types.length);
}

function SoonestOpenings({
  report, dates, selectedParks = [], selectedTypes = [], search, alwaysOpenParks, metadata,
  nights = 1, onPickPark, onPickType, onClearTypes, setSelectedDate, setSearch,
}) {
  const { t, tn } = useI18n();
  const [sortKey, setSortKey] = useState('soonest');
  const [horizon, setHorizon] = useState('any');
  const [showAll, setShowAll] = useState(false);
  const [tailOpen, setTailOpen] = useState(false);

  const SORTS = [
    { key: 'soonest', label: t('soonest.sortSoonest') },
    { key: 'open', label: t('soonest.sortOpen') },
    { key: 'az', label: t('soonest.sortAz') },
  ];
  const HORIZONS = [
    { key: 'any', label: t('soonest.anyTime') },
    { key: 'week', label: t('soonest.withinWeek') },
    { key: 'month', label: t('soonest.withinMonth') },
  ];

  const { index } = useMemo(
    () => buildStayIndex(dates, report.dates, nights),
    [dates, report, nights]);

  const horizonDate = horizon === 'week' ? isoAddDays(7)
    : horizon === 'month' ? isoAddDays(30) : null;
  const q = (search || '').trim().toLowerCase();

  const { open, tail } = useMemo(() => {
    const allParks = Array.from(new Set([
      ...Object.keys(metadata?.locations || {}),
      ...Object.keys(index),
    ])).filter(park => selectedParks.length === 0 || selectedParks.includes(park));
    const rows = [];
    for (const parkName of allParks) {
      if (q && !parkName.toLowerCase().includes(q)) continue;
      const e = index[parkName];
      const { park, area } = splitPark(parkName);
      const series = !e ? null
        : selectedTypes.length === 0 ? e.anyDays
        : selectedTypes.length === 1 ? (e.byType[selectedTypes[0]] || null)
        : mergeSeries(e, selectedTypes);
      const soonest = series && series[0];
      const within = soonest && (!horizonDate || soonest.date <= horizonDate);
      const verify = alwaysOpenParks.has(parkName);

      if (within) {
        let chips = [];
        if (selectedTypes.length !== 1) {
          chips = typeChipsForDate(e, soonest.date, selectedTypes);
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
        } else if (selectedTypes.length > 0 && e && e.anyDays.length) {
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
  }, [index, selectedParks, selectedTypes, q, sortKey, horizonDate, alwaysOpenParks, metadata]);

  const pick = (parkName, date) => { onPickPark(parkName); if (date) setSelectedDate(date); };
  const pickType = (parkName, type, date) => {
    onPickPark(parkName); onPickType(type); if (date) setSelectedDate(date);
  };

  const typeLabel = typesSummary(selectedTypes, t, tn);
  const horizonLabel = { any: t('soonest.horizonAny'), week: t('soonest.horizonWeek'), month: t('soonest.horizonMonth') }[horizon];
  const shown = showAll ? open : open.slice(0, TOP_CAP);
  const noOpeningsText = selectedTypes.length
    ? t('soonest.noneFor', { types: typeLabel })
    : t('soonest.none');

  return (
    <Card id="soonest-openings" className="scroll-mt-36 border-0 shadow-sm sm:scroll-mt-44">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 flex-shrink-0 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">{t('soonest.title')}</h3>
          </div>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="h-9 w-[140px] bg-white text-sm" aria-label={t('soonest.sortAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          {typeLabel} · {horizonLabel} · {tn('soonest.parksWithOpenings', open.length)}
        </p>

        {/* Date horizon pills */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {HORIZONS.map(h => (
            <button
              key={h.key}
              onClick={() => setHorizon(h.key)}
              aria-pressed={horizon === h.key}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                horizon === h.key
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
            >
              {h.label}
            </button>
          ))}
        </div>

        {open.length === 0 ? (
          <div className="py-8 text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">
              {noOpeningsText} {horizonLabel}
              {q ? ` · “${search.trim()}”` : ''}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3 text-sm">
              {horizon !== 'any' && (
                <button onClick={() => setHorizon('any')} className="text-emerald-700 hover:underline">{t('soonest.anyTime')}</button>
              )}
              {selectedTypes.length > 0 && (
                <button onClick={onClearTypes} className="text-emerald-700 hover:underline">{t('soonest.allTypes')}</button>
              )}
              {q && setSearch && (
                <button onClick={() => setSearch('')} className="text-emerald-700 hover:underline">{t('soonest.clearSearch')}</button>
              )}
            </div>
          </div>
        ) : (
          <>
            <ul id="soonest-open-list" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown.map(r => (
                <SoonestRow key={r.parkName} row={r} metadata={metadata} nights={nights}
                  onPick={pick} onPickType={pickType} />
              ))}
            </ul>
            {open.length > TOP_CAP && (
              <button
                onClick={() => setShowAll(v => !v)}
                aria-expanded={showAll}
                aria-controls="soonest-open-list"
                className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                {showAll ? t('soonest.showFewer') : t('soonest.showAll', { n: open.length })}
              </button>
            )}
          </>
        )}

        {/* Honest disclosure of parks with nothing for the current lens */}
        {tail.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <button
              onClick={() => setTailOpen(v => !v)}
              aria-expanded={tailOpen}
              aria-controls="soonest-tail-list"
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {tn('soonest.tail', tail.length, {
                what: selectedTypes.length === 0 ? t('soonest.openings') : t('soonest.openingsFor', { types: typeLabel }),
                action: tailOpen ? t('soonest.hide') : t('soonest.show'),
              })}
            </button>
            {tailOpen && (
              <ul id="soonest-tail-list" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {tail.map(r => <TailRow key={r.parkName} row={r} onPick={pick} onPickType={pickType} />)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Union of per-type opening series: earliest date across the selected types,
// with counts summed on days where several of them open.
function mergeSeries(entry, types) {
  const byDate = {};
  types.forEach(type => {
    (entry.byType[type] || []).forEach(({ date, count }) => {
      byDate[date] = (byDate[date] || 0) + count;
    });
  });
  return Object.keys(byDate).sort().map(date => ({ date, count: byDate[date] }));
}

function daysAwayLabel(dateStr, t, tn) {
  const n = Math.round((parseLocalDate(dateStr) - parseLocalDate(todayStr())) / 86400000);
  if (n <= 0) return t('soonest.today');
  if (n === 1) return t('soonest.tomorrow');
  return tn('soonest.daysAway', n);
}

function SoonestRow({ row, metadata, nights, onPick, onPickType }) {
  const { t, tn } = useI18n();
  const { parkName, park, area, date, count, chips, verify } = row;
  const extraChips = chips.length - MAX_CHIPS;
  return (
    <li data-testid="soonest-row" data-park={parkName} className={`overflow-hidden rounded-xl border ${verify ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
      <div className="flex items-stretch">
        <button
          onClick={() => onPick(parkName, date)}
          className="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-emerald-50/40"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-gray-900" title={area || park}>{area || park}</p>
            <span className="flex-shrink-0 text-sm font-semibold text-emerald-700">
              {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500" title={area ? park : undefined}>
              {area ? park : ' '}
            </p>
            {verify ? (
              <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-amber-800"
                title={t('soonest.verifyTitle')}>
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {count} · {t('soonest.verify')}
                <span className="sr-only"> — {t('soonest.verifyTitle')}</span>
              </span>
            ) : (
              <span className="flex-shrink-0 text-xs font-medium tabular-nums text-emerald-700">
                {daysAwayLabel(date, t, tn)} · {t('soonest.openCount', { n: count })}
              </span>
            )}
          </div>
        </button>
        <a
          href={buildBookingUrl({ ParkName: parkName }, date, metadata, nights)}
          target="_blank" rel="noopener noreferrer"
          aria-label={t('soonest.bookAria', { name: area || park })}
          title={t('soonest.book')}
          className="flex min-w-[44px] items-center justify-center border-l border-gray-100 bg-emerald-50/40 px-3 text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      {chips.length > 1 && (
        <div className="flex gap-1 overflow-x-auto overscroll-x-contain px-3 pb-2">
          {chips.slice(0, MAX_CHIPS).map(c => (
            <button
              key={c.type}
              type="button"
              data-testid="type-chip"
              onClick={() => onPickType(parkName, c.type, c.date)}
              className="inline-flex flex-shrink-0 items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
            >
              {c.type} {c.count}
            </button>
          ))}
          {extraChips > 0 && (
            <span className="inline-flex flex-shrink-0 items-center px-1 text-[11px] text-gray-500">+{extraChips}</span>
          )}
        </div>
      )}
    </li>
  );
}

function TailRow({ row, onPick, onPickType }) {
  const { t } = useI18n();
  const { parkName, park, area, reason } = row;
  return (
    <li data-testid="soonest-tail-row" className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-gray-500">{area || park}</p>
        {reason.kind === 'later' && (
          <button onClick={() => onPick(parkName, reason.date)}
            className="flex-shrink-0 text-xs font-medium text-emerald-700 hover:underline">
            {t('soonest.earliest', { date: formatDate(reason.date, { month: 'short', day: 'numeric' }) })}
          </button>
        )}
        {reason.kind === 'othertype' && reason.topType && (
          <button onClick={() => onPickType(parkName, reason.topType, reason.date)}
            className="flex-shrink-0 text-xs font-medium text-emerald-700 hover:underline">
            {reason.topType} {formatDate(reason.date, { month: 'short', day: 'numeric' })}
          </button>
        )}
        {reason.kind === 'none' && <span className="flex-shrink-0 text-xs text-gray-500">—</span>}
      </div>
    </li>
  );
}

export default SoonestOpenings;
