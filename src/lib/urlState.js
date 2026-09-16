// Shareable app state in the query string, e.g.
//   ?date=2026-09-20&parks=Banff%20-%20Two%20Jack%20Main&types=oTENTik&view=calendar&nights=2&q=banff&lang=fr
// Written with replaceState (not pushState) so filtering doesn't flood the
// browser history, but reloads/shares/back always land on the same view.
import { MAX_NIGHTS } from './stays';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readUrlState() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const list = (key) => (params.get(key) || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const rawDate = params.get('date') || '';
  const rawView = params.get('view');
  const rawNights = Number(params.get('nights'));
  const rawLang = params.get('lang');

  return {
    date: DATE_RE.test(rawDate) ? rawDate : null,
    parks: list('parks'),
    types: list('types'),
    view: rawView === 'calendar' || rawView === 'list' ? rawView : null,
    nights: Number.isInteger(rawNights) && rawNights >= 1 && rawNights <= MAX_NIGHTS ? rawNights : null,
    q: params.get('q') || null,
    lang: rawLang === 'fr' || rawLang === 'en' ? rawLang : null,
  };
}

export function writeUrlState(state) {
  if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.parks && state.parks.length) params.set('parks', state.parks.join(','));
  if (state.types && state.types.length) params.set('types', state.types.join(','));
  if (state.view && state.view !== 'list') params.set('view', state.view);
  if (state.nights && state.nights > 1) params.set('nights', String(state.nights));
  if (state.q) params.set('q', state.q);
  if (state.lang && state.lang !== 'en') params.set('lang', state.lang);

  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}
