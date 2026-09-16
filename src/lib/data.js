// Helpers for loading and shaping the availability report.
// Tolerant of both the new schema ({ metadata, history, dates }) and the
// legacy flat schema ({ "YYYY-MM-DD": [...] }).

// Locale used for date formatting; kept in sync with the active language by
// the i18n provider (see lib/i18n.jsx).
let DEFAULT_LOCALE = 'en-US';

export function setFormatLocale(locale) {
  DEFAULT_LOCALE = locale || 'en-US';
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidSite(site) {
  return !!site
    && typeof site === 'object'
    && typeof site.ParkName === 'string'
    && typeof site.status === 'boolean';
}

// Validate the report while normalizing it. Returns null only when the data is
// too broken to trust; otherwise attaches `warnings` describing what was
// dropped so the UI can surface an "incomplete data" notice.
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const isNew = raw.dates && typeof raw.dates === 'object';
  const allDates = isNew ? raw.dates : raw;
  const metadata = isNew ? raw.metadata || {} : {};
  const history = isNew && Array.isArray(raw.history) ? raw.history : [];

  if (!allDates || Object.keys(allDates).length === 0) return null;

  const warnings = [];
  let total = 0;
  let invalid = 0;
  const dates = {};

  Object.keys(allDates).forEach(d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { warnings.push('bad-date-key'); return; }
    const rows = Array.isArray(allDates[d]) ? allDates[d] : [];
    if (!Array.isArray(allDates[d])) warnings.push('bad-date-value');
    const clean = [];
    rows.forEach(site => {
      total += 1;
      if (isValidSite(site)) clean.push(site);
      else invalid += 1;
    });
    dates[d] = clean;
  });

  if (!Object.keys(dates).length) return null;
  if (invalid > 0) warnings.push(`${invalid} invalid site records skipped`);
  // If a large share of the rows are malformed, treat the snapshot as broken.
  if (total > 0 && invalid / total > 0.2) return null;
  if (!metadata.generated_at) warnings.push('missing generated_at');

  // Only ever show today onward — never surface past dates even if the
  // committed snapshot is a day or two old.
  const today = todayStr();
  let upcoming = {};
  Object.keys(dates).forEach(d => { if (d >= today) upcoming[d] = dates[d]; });
  if (Object.keys(upcoming).length === 0) upcoming = dates; // fallback: don't blank the UI

  return { dates: upcoming, metadata, history, warnings };
}

// A snapshot is "stale" when the scanner hasn't refreshed it recently. The
// scan runs every 4 hours, so anything beyond 12h means something failed.
export const STALE_AFTER_HOURS = 12;

export function isStale(generatedAt, now = Date.now()) {
  if (!generatedAt) return true;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return true;
  const age = now - t;
  if (age < 0) return false; // clock skew/future timestamp: trust it
  return age > STALE_AFTER_HOURS * 3600 * 1000;
}

export function generatedAgeHours(generatedAt, now = Date.now()) {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 3600 / 1000));
}

export function parseLocalDate(dateStr) {
  // Build a local-time Date from a YYYY-MM-DD string (avoids UTC off-by-one).
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(dateStr, opts) {
  const options = { ...opts, locale: opts?.locale || DEFAULT_LOCALE };
  return parseLocalDate(dateStr).toLocaleDateString(options.locale, options);
}

export function formatTimestamp(iso, opts = {}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(opts.locale || DEFAULT_LOCALE, {
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

// "O45"/"45" -> "<Type> 45" (e.g., "oTENTik 45", "Yurt 3"); else the raw name.
export function prettyUnit(resourceName, type) {
  const label = type || 'oTENTik';
  if (!resourceName) return label;
  const t = String(resourceName).trim();
  const m = /^O?\s*0*(\d+)$/i.exec(t);
  return m ? `${label} ${m[1]}` : t;
}

// "Fundy - Headquarters" -> { park: "Fundy", area: "Headquarters" }.
// Names without " - " (e.g., "Grand-Pré") return area: null.
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

export function shiftDate(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Deep-link straight to the Parks Canada availability results for this site's
// location + date. The reservation site doesn't expose stable per-unit URLs,
// so this lands on the location's map filtered to the date — as specific as
// the booking engine allows. Falls back to the booking home if the report has
// no location ids for this park (e.g., an older snapshot).
export function buildBookingUrl(site, dateStr, metadata, nights = 1) {
  const loc = metadata && metadata.locations && metadata.locations[site && site.ParkName];
  if (!loc || !dateStr) return BOOKING_URL;
  const params = new URLSearchParams({
    transactionLocationId: loc.t,
    resourceLocationId: loc.r,
    mapId: loc.m,
    searchTabGroupId: 2,
    bookingCategoryId: loc.b == null ? 1 : loc.b,
    startDate: dateStr,
    endDate: shiftDate(dateStr, nights),
    nights: String(nights),
    isReserving: true,
    peopleCapacityCategoryCounts: '[[-32767,null,1,null]]',
    flexibleSearch: '[false,false,null,1]',
  });
  return `https://reservation.pc.gc.ca/create-booking/results?${params.toString()}`;
}
