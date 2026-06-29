// Helpers for loading and shaping the availability report.
// Tolerant of both the new schema ({ metadata, history, dates }) and the
// legacy flat schema ({ "YYYY-MM-DD": [...] }).

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const isNew = raw.dates && typeof raw.dates === 'object';
  const allDates = isNew ? raw.dates : raw;
  const metadata = isNew ? raw.metadata || {} : {};
  const history = isNew && Array.isArray(raw.history) ? raw.history : [];

  if (!allDates || Object.keys(allDates).length === 0) return null;

  // Only ever show today onward — never surface past dates even if the
  // committed snapshot is a day or two old.
  const today = todayStr();
  let dates = {};
  Object.keys(allDates).forEach(d => { if (d >= today) dates[d] = allDates[d]; });
  if (Object.keys(dates).length === 0) dates = allDates; // fallback: don't blank the UI

  return { dates, metadata, history };
}

export function parseLocalDate(dateStr) {
  // Build a local-time Date from a YYYY-MM-DD string (avoids UTC off-by-one).
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(dateStr, opts) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', opts);
}

export function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function countAvailable(sites, park) {
  return sites.reduce((n, s) => {
    if (park && park !== 'all' && s.ParkName !== park) return n;
    return n + (s.status ? 1 : 0);
  }, 0);
}

// "O45"/"45" -> "<Type> 45" (e.g. "oTENTik 45", "Yurt 3"); else the raw name.
export function prettyUnit(resourceName, type) {
  const label = type || 'oTENTik';
  if (!resourceName) return label;
  const t = String(resourceName).trim();
  const m = /^O?\s*0*(\d+)$/i.exec(t);
  return m ? `${label} ${m[1]}` : t;
}

// "Fundy - Headquarters" -> { park: "Fundy", area: "Headquarters" }.
// Names without " - " (e.g. "Grand-Pré") return area: null.
export function splitPark(parkName) {
  if (!parkName) return { park: '', area: null };
  const idx = parkName.indexOf(' - ');
  if (idx === -1) return { park: parkName, area: null };
  return { park: parkName.slice(0, idx), area: parkName.slice(idx + 3) };
}

// "#34 - 58" -> "Sites 34–58"; otherwise returns a tidied label.
export function prettyLoop(pageTitle) {
  if (!pageTitle) return null;
  const m = /#?\s*(\d+)\s*-\s*(\d+)/.exec(pageTitle);
  if (m) return `Sites ${m[1]}–${m[2]}`;
  return pageTitle.replace(/^#\s*/, 'Site ');
}

// Booking home — fallback when we can't build a per-location deep link.
export const BOOKING_URL = 'https://reservation.pc.gc.ca/';

function shiftDate(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Deep-link straight to the Parks Canada availability results for this site's
// location + date (1 night). The reservation site doesn't expose stable
// per-unit URLs, so this lands on the location's map filtered to the date —
// as specific as the booking engine allows. Falls back to the booking home
// if the report has no location ids for this park (e.g. an older snapshot).
export function buildBookingUrl(site, dateStr, metadata) {
  const loc = metadata && metadata.locations && metadata.locations[site && site.ParkName];
  if (!loc || !dateStr) return BOOKING_URL;
  const params = new URLSearchParams({
    transactionLocationId: loc.t,
    resourceLocationId: loc.r,
    mapId: loc.m,
    searchTabGroupId: 2,
    bookingCategoryId: loc.b == null ? 1 : loc.b,
    startDate: dateStr,
    endDate: shiftDate(dateStr, 1),
    nights: 1,
    isReserving: true,
    peopleCapacityCategoryCounts: '[[-32767,null,1,null]]',
    flexibleSearch: '[false,false,null,1]',
  });
  return `https://reservation.pc.gc.ca/create-booking/results?${params.toString()}`;
}
