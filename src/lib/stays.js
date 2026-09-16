// Multi-night stay math. A site is "available for N nights" starting on a
// date when it is open on that date and each of the following N-1 calendar
// days. Everything here is pure and cheaper-than-naive: one pass over the
// report builds per-date availability maps, then stay queries reuse them.
import { shiftDate } from './data';

export const MAX_NIGHTS = 3;

// Stable identity for a bookable unit. The reservation API has no single
// canonical id in the report, so combine the fields that identify a unit
// within a park.
export function siteKey(site) {
  return `${site.ParkName}|${site.ResourceName}|${site.Type || 'oTENTik'}`;
}

export function availabilityMap(rows) {
  const map = new Map();
  (rows || []).forEach(site => {
    if (site && site.status) map.set(siteKey(site), site);
  });
  return map;
}

// Sites available for the whole stay starting at `startDate`. Returns [] when
// any night in the stay is missing from the report (unknown ≠ available).
export function sitesForStay(availabilityData, startDate, nights = 1) {
  if (!availabilityData || !startDate) return [];
  if (nights <= 1) return (availabilityData[startDate] || []).filter(s => s.status);
  const maps = [];
  for (let i = 0; i < nights; i++) {
    const day = availabilityData[shiftDate(startDate, i)];
    if (!day) return [];
    maps.push(availabilityMap(day));
  }
  const [first, ...rest] = maps;
  const out = [];
  for (const [key, site] of first) {
    if (rest.every(map => map.has(key))) out.push(site);
  }
  return out;
}

// One index per (report, nights): per-park opening series (total and per type)
// for stays that start on each date, plus the total stay count per start date.
// Shape mirrors what the "soonest openings" feed and calendar need.
export function buildStayIndex(dates, byDate, nights = 1) {
  const index = {};
  const perDate = {};

  if (!Array.isArray(dates) || !dates.length) return { index, perDate };

  const maps = dates.map(d => availabilityMap(byDate[d]));
  const positions = new Map(dates.map((d, i) => [d, i]));

  for (let i = 0; i < dates.length; i++) {
    const start = dates[i];
    const stayMaps = [];
    let complete = true;
    for (let k = 0; k < nights; k++) {
      const pos = positions.get(shiftDate(start, k));
      if (pos === undefined) { complete = false; break; }
      stayMaps.push(maps[pos]);
    }
    if (!complete) continue;

    const day = {};
    for (const [key, site] of stayMaps[0]) {
      if (!stayMaps.slice(1).every(map => map.has(key))) continue;
      const park = site.ParkName;
      const type = site.Type || 'oTENTik';
      const pp = day[park] || (day[park] = { total: 0, types: {} });
      pp.total += 1;
      pp.types[type] = (pp.types[type] || 0) + 1;
    }

    let total = 0;
    for (const park of Object.keys(day)) {
      const pp = day[park];
      total += pp.total;
      const entry = index[park] || (index[park] = { anyDays: [], byType: {} });
      entry.anyDays.push({ date: start, count: pp.total });
      for (const type of Object.keys(pp.types)) {
        (entry.byType[type] || (entry.byType[type] = [])).push({ date: start, count: pp.types[type] });
      }
    }
    perDate[start] = total;
  }

  return { index, perDate };
}
