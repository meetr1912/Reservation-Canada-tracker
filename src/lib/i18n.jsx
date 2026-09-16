// Tiny dependency-free i18n layer (EN/FR). Keys are flat; `.one`/`.many`
// keys are picked by the `tn(key, n)` helper for pluralization.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { setFormatLocale } from './data';

export const LANGUAGES = ['en', 'fr'];

const en = {
  'app.title': 'Parks Canada',
  'app.titleHighlight': 'Camping Tracker',
  'app.tagline': 'Live availability for oTENTiks, yurts, cabins & more across {units} prebuilt sites in {locations} locations',
  'hero.daysWithOpenings.one': '{n} day with openings',
  'hero.daysWithOpenings.many': '{n} days with openings',
  'hero.updated': 'Updated {time}',

  'data.staleTitle': 'Data may be out of date',
  'data.staleBody': 'The last scan finished {hours}h ago — availability may have changed.',
  'data.offlineTitle': 'Offline — showing the last saved data',
  'data.offlineBody': 'Saved {time}',
  'data.cachedBody': 'Showing the last saved snapshot from {time}',
  'data.incomplete': 'Some records in this snapshot looked invalid and were skipped.',
  'data.retry': 'Retry',

  'stats.availableOn': 'Available on this date',
  'stats.availableFor.one': 'Available for {n} night',
  'stats.availableFor.many': 'Available for {n} nights',
  'stats.parksWithOpenings': 'Parks with openings',
  'stats.daysWithAvailability': 'Days with availability',
  'stats.totalOpenSlots': 'Total open slots',
  'stats.ofSites': 'of {n} sites',
  'stats.ofParks': 'of {n} parks',
  'stats.nextDays': 'next {n} days',

  'search.placeholder': 'Search site or park…',
  'search.aria': 'Search site or park',

  'filters.title': 'Filters',
  'filters.button': 'Filters',
  'filters.active.one': 'Filters, {n} active',
  'filters.active.many': 'Filters, {n} active',
  'filters.date': 'Date',
  'filters.nights': 'Nights',
  'filters.nightsOption.one': '{n} night',
  'filters.nightsOption.many': '{n} nights',
  'filters.parks': 'Parks',
  'filters.accommodation': 'Accommodation',
  'filters.allParks': 'All parks',
  'filters.allTypes': 'All types',
  'filters.selectAllParks': 'Select all parks',
  'filters.selectAllTypes': 'Select all types',
  'filters.searchParks': 'Search parks…',
  'filters.showAvailableOnly': 'Show available only',
  'filters.hideBookedHint': 'Hide fully booked sites',
  'filters.options.one': '{n} option',
  'filters.options.many': '{n} options',
  'filters.selected.one': '{n} selected',
  'filters.selected.many': '{n} selected',
  'filters.selectAll': 'Select all',
  'filters.selectShown': 'Select shown',
  'filters.clear': 'Clear',
  'filters.clearAll': 'Clear all',
  'filters.done': 'Done',
  'filters.close': 'Close filters',
  'filters.closePicker': 'Close {title}',
  'filters.removeFilter': 'Remove {name} filter',
  'filters.noMatches': 'No matches',
  'filters.showResults.one': 'Show {n} result',
  'filters.showResults.many': 'Show {n} results',
  'filters.applyHint': '{n} sites match on {date}',

  'view.list': 'List',
  'view.calendar': 'Calendar',

  'alert.button': 'Alert me',
  'alert.title': 'Get email alerts',
  'alert.description': 'Get an email when a watched park has an opening on your dates.',
  'alert.parksHint': 'Choose one or more, or leave empty for any park.',
  'alert.dates': 'Dates',
  'alert.startDate': 'Start date',
  'alert.endDate': 'End date',
  'alert.to': 'to',
  'alert.email': 'Email',
  'alert.invalidEmail': 'Enter a valid email address.',
  'alert.disclaimer': 'Submitting opens a pre-filled GitHub issue (a free GitHub account is needed to file it). The tracker reads open issues every few hours and emails you on a match.',
  'alert.submit': 'Create email alert',
  'alert.success': 'A pre-filled GitHub issue opened in a new tab — click Create there to start your watch. You will get an email whenever a match opens up; close the issue any time to stop.',
  'alert.didntOpen': "Didn't open? Click here",

  'soonest.title': 'Soonest openings',
  'soonest.sortAria': 'Sort soonest openings',
  'soonest.sortSoonest': 'Soonest',
  'soonest.sortOpen': 'Most open',
  'soonest.sortAz': 'A–Z',
  'soonest.allTypes': 'All types',
  'soonest.anyTime': 'Any time',
  'soonest.withinWeek': 'Within a week',
  'soonest.withinMonth': 'Within a month',
  'soonest.horizonAny': 'any time',
  'soonest.horizonWeek': 'within a week',
  'soonest.horizonMonth': 'within a month',
  'soonest.parksWithOpenings.one': '{n} park with openings',
  'soonest.parksWithOpenings.many': '{n} parks with openings',
  'soonest.none': 'No openings',
  'soonest.noneFor': 'No openings for {types}',
  'soonest.showAll': 'Show all {n} parks',
  'soonest.showFewer': 'Show fewer',
  'soonest.clearSearch': 'Clear search',
  'soonest.typesLabel.many': '{n} types',
  'soonest.tail.one': '{n} park with no {what} · {action}',
  'soonest.tail.many': '{n} parks with no {what} · {action}',
  'soonest.openings': 'openings',
  'soonest.openingsFor': '{types} openings',
  'soonest.show': 'show',
  'soonest.hide': 'hide',
  'soonest.earliest': 'Earliest {date}',
  'soonest.today': 'today',
  'soonest.tomorrow': 'tomorrow',
  'soonest.daysAway.one': '{n}d away',
  'soonest.daysAway.many': '{n}d away',
  'soonest.openCount': '{n} open',
  'soonest.verify': 'verify',
  'soonest.book': 'Book on Parks Canada',
  'soonest.bookAria': 'Book {name} on Parks Canada',
  'soonest.verifyTitle': 'Shown available every day — confirm on Parks Canada before relying on it',

  'park.sites.one': '{n} site',
  'park.sites.many': '{n} sites',
  'park.available': '{n} available',
  'park.verify': 'Verify',

  'list.empty': 'No sites match your filters',
  'list.showAllSites': 'Show all sites',
  'list.clearFilters': 'Clear filters',
  'list.nextOpening': 'Next opening {date}',
  'list.jumpTo': 'Jump to:',

  'site.available': 'Available',
  'site.booked': 'Booked',
  'site.reserve': 'Reserve',

  'calendar.availability': 'Availability:',
  'calendar.none': 'None',
  'calendar.low': 'Low',
  'calendar.medium': 'Medium',
  'calendar.high': 'High',
  'calendar.sitesAvailable.one': '{n} site available',
  'calendar.sitesAvailable.many': '{n} sites available',
  'calendar.alertForDate': 'Alert me for this date',
  'calendar.reserve': 'Reserve on Parks Canada →',
  'calendar.dayAria': '{date}: {count} available',
  'calendar.dayAriaNone': '{date}: no availability',
  'calendar.nightsHint': 'Counts are stays of {n} nights starting that day.',

  'footer.updates': 'Data updates every few hours via automated scanning of reservation.pc.gc.ca',
  'footer.lastUpdated': 'Last updated: {time}',
  'footer.inquiries': 'For inquiries:',

  'loading': 'Loading availability…',
  'error.title': 'Unable to load availability data',
  'error.body': 'The report could not be fetched. Check your connection and try again.',
  'error.retry': 'Try again',

  'boundary.title': 'Something went wrong',
  'boundary.body': 'This section failed to render.',
  'boundary.reload': 'Reload',

  'lang.label': 'Language',
  'lang.toggleAria': 'Language: {lang}',
};

const fr = {
  'app.title': 'Parcs Canada',
  'app.titleHighlight': 'Suivi du camping',
  'app.tagline': 'Disponibilité en direct des oTENTiks, yourtes, chalets et plus dans {units} sites préconstruits répartis dans {locations} endroits',
  'hero.daysWithOpenings.one': '{n} jour avec disponibilité',
  'hero.daysWithOpenings.many': '{n} jours avec disponibilité',
  'hero.updated': 'Mis à jour {time}',

  'data.staleTitle': 'Les données peuvent être périmées',
  'data.staleBody': 'La dernière analyse date de {hours} h — la disponibilité peut avoir changé.',
  'data.offlineTitle': 'Hors ligne — dernières données enregistrées',
  'data.offlineBody': 'Enregistré {time}',
  'data.cachedBody': 'Affichage du dernier instantané enregistré ({time})',
  'data.incomplete': 'Certains enregistrements de cet instantané étaient invalides et ont été ignorés.',
  'data.retry': 'Réessayer',

  'stats.availableOn': 'Disponibles à cette date',
  'stats.availableFor.one': 'Disponible pour {n} nuit',
  'stats.availableFor.many': 'Disponibles pour {n} nuits',
  'stats.parksWithOpenings': 'Parcs avec disponibilité',
  'stats.daysWithAvailability': 'Jours avec disponibilité',
  'stats.totalOpenSlots': 'Places libres au total',
  'stats.ofSites': 'sur {n} sites',
  'stats.ofParks': 'sur {n} parcs',
  'stats.nextDays': '{n} prochains jours',

  'search.placeholder': 'Rechercher un site ou un parc…',
  'search.aria': 'Rechercher un site ou un parc',

  'filters.title': 'Filtres',
  'filters.button': 'Filtres',
  'filters.active.one': 'Filtres, {n} actif',
  'filters.active.many': 'Filtres, {n} actifs',
  'filters.date': 'Date',
  'filters.nights': 'Nuits',
  'filters.nightsOption.one': '{n} nuit',
  'filters.nightsOption.many': '{n} nuits',
  'filters.parks': 'Parcs',
  'filters.accommodation': 'Hébergement',
  'filters.allParks': 'Tous les parcs',
  'filters.allTypes': 'Tous les types',
  'filters.selectAllParks': 'Sélectionner tous les parcs',
  'filters.selectAllTypes': 'Sélectionner tous les types',
  'filters.searchParks': 'Rechercher des parcs…',
  'filters.showAvailableOnly': 'Afficher seulement les disponibilités',
  'filters.hideBookedHint': 'Masquer les sites complets',
  'filters.options.one': '{n} option',
  'filters.options.many': '{n} options',
  'filters.selected.one': '{n} sélectionné',
  'filters.selected.many': '{n} sélectionnés',
  'filters.selectAll': 'Tout sélectionner',
  'filters.selectShown': 'Sélectionner les résultats',
  'filters.clear': 'Effacer',
  'filters.clearAll': 'Tout effacer',
  'filters.done': 'Terminé',
  'filters.close': 'Fermer les filtres',
  'filters.closePicker': 'Fermer {title}',
  'filters.removeFilter': 'Retirer le filtre {name}',
  'filters.noMatches': 'Aucun résultat',
  'filters.showResults.one': 'Afficher {n} résultat',
  'filters.showResults.many': 'Afficher {n} résultats',
  'filters.applyHint': '{n} sites correspondent au {date}',

  'view.list': 'Liste',
  'view.calendar': 'Calendrier',

  'alert.button': "M'alerter",
  'alert.title': 'Recevoir des alertes courriel',
  'alert.description': "Recevez un courriel lorsqu'un parc surveillé a une disponibilité à vos dates.",
  'alert.parksHint': 'Choisissez un ou plusieurs parcs, ou laissez vide pour tous les parcs.',
  'alert.dates': 'Dates',
  'alert.startDate': 'Date de début',
  'alert.endDate': 'Date de fin',
  'alert.to': 'au',
  'alert.email': 'Courriel',
  'alert.invalidEmail': 'Entrez une adresse courriel valide.',
  'alert.disclaimer': "L'envoi ouvre un billet GitHub pré-rempli (un compte GitHub gratuit est requis). Le suivi lit les billets ouverts toutes les quelques heures et vous écrit dès qu'il y a une correspondance.",
  'alert.submit': "Créer l'alerte courriel",
  'alert.success': "Un billet GitHub pré-rempli s'est ouvert dans un nouvel onglet — cliquez sur Create pour démarrer votre suivi. Vous recevrez un courriel dès qu'une correspondance apparaît; fermez le billet pour arrêter.",
  'alert.didntOpen': "Rien ne s'est ouvert? Cliquez ici",

  'soonest.title': 'Prochaines disponibilités',
  'soonest.sortAria': 'Trier les disponibilités',
  'soonest.sortSoonest': 'Bientôt',
  'soonest.sortOpen': 'Plus de places',
  'soonest.sortAz': 'A–Z',
  'soonest.allTypes': 'Tous les types',
  'soonest.anyTime': 'Tout temps',
  'soonest.withinWeek': "D'ici une semaine",
  'soonest.withinMonth': "D'ici un mois",
  'soonest.horizonAny': 'tout temps',
  'soonest.horizonWeek': "d'ici une semaine",
  'soonest.horizonMonth': "d'ici un mois",
  'soonest.parksWithOpenings.one': '{n} parc avec disponibilité',
  'soonest.parksWithOpenings.many': '{n} parcs avec disponibilité',
  'soonest.none': 'Aucune disponibilité',
  'soonest.noneFor': 'Aucune disponibilité pour {types}',
  'soonest.showAll': 'Afficher les {n} parcs',
  'soonest.showFewer': 'Afficher moins',
  'soonest.clearSearch': 'Effacer la recherche',
  'soonest.typesLabel.many': '{n} types',
  'soonest.tail.one': '{n} parc sans {what} · {action}',
  'soonest.tail.many': '{n} parcs sans {what} · {action}',
  'soonest.openings': 'disponibilité',
  'soonest.openingsFor': 'disponibilité ({types})',
  'soonest.show': 'afficher',
  'soonest.hide': 'masquer',
  'soonest.earliest': 'Le plus tôt {date}',
  'soonest.today': "aujourd'hui",
  'soonest.tomorrow': 'demain',
  'soonest.daysAway.one': 'dans {n} j',
  'soonest.daysAway.many': 'dans {n} j',
  'soonest.openCount': '{n} libres',
  'soonest.verify': 'vérifier',
  'soonest.book': 'Réserver sur Parcs Canada',
  'soonest.bookAria': 'Réserver {name} sur Parcs Canada',
  'soonest.verifyTitle': 'Affiché disponible chaque jour — confirmez sur Parcs Canada avant de vous y fier',

  'park.sites.one': '{n} emplacement',
  'park.sites.many': '{n} emplacements',
  'park.available': '{n} disponibles',
  'park.verify': 'Vérifier',

  'list.empty': 'Aucun site ne correspond à vos filtres',
  'list.showAllSites': 'Afficher tous les sites',
  'list.clearFilters': 'Effacer les filtres',
  'list.nextOpening': 'Prochaine ouverture {date}',
  'list.jumpTo': 'Aller à :',

  'site.available': 'Disponible',
  'site.booked': 'Réservé',
  'site.reserve': 'Réserver',

  'calendar.availability': 'Disponibilité :',
  'calendar.none': 'Aucune',
  'calendar.low': 'Faible',
  'calendar.medium': 'Moyenne',
  'calendar.high': 'Élevée',
  'calendar.sitesAvailable.one': '{n} emplacement disponible',
  'calendar.sitesAvailable.many': '{n} emplacements disponibles',
  'calendar.alertForDate': "M'alerter pour cette date",
  'calendar.reserve': 'Réserver sur Parcs Canada →',
  'calendar.dayAria': '{date} : {count} disponibles',
  'calendar.dayAriaNone': '{date} : aucune disponibilité',
  'calendar.nightsHint': 'Les nombres correspondent à des séjours de {n} nuits débutant ce jour-là.',

  'footer.updates': 'Les données sont mises à jour toutes les quelques heures par un balayage automatisé de reservation.pc.gc.ca',
  'footer.lastUpdated': 'Dernière mise à jour : {time}',
  'footer.inquiries': 'Pour toute question :',

  'loading': 'Chargement des disponibilités…',
  'error.title': 'Impossible de charger les données',
  'error.body': "Le rapport n'a pas pu être récupéré. Vérifiez votre connexion et réessayez.",
  'error.retry': 'Réessayer',

  'boundary.title': 'Une erreur est survenue',
  'boundary.body': "Cette section n'a pas pu s'afficher.",
  'boundary.reload': 'Recharger',

  'lang.label': 'Langue',
  'lang.toggleAria': 'Langue : {lang}',
};

const dictionaries = { en, fr };

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? '' : String(vars[key])));
}

function detectLang() {
  if (typeof window === 'undefined') return 'en';
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (LANGUAGES.includes(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem('pct:lang');
    if (LANGUAGES.includes(stored)) return stored;
  } catch { /* private mode */ }
  return String(window.navigator?.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

// Default context is fully functional English so components render correctly
// even when used outside the provider (e.g. focused component tests).
const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key, vars) => interpolate(en[key] ?? key, vars),
  tn: (key, n, vars) => interpolate(en[`${key}.${n === 1 ? 'one' : 'many'}`] ?? key, { n, ...vars }),
});

export function I18nProvider({ children, initialLang }) {
  const [lang, setLang] = useState(() => initialLang || detectLang());

  useEffect(() => {
    setFormatLocale(lang === 'fr' ? 'fr-CA' : 'en-US');
    document.documentElement.lang = lang;
    try { window.localStorage.setItem('pct:lang', lang); } catch { /* private mode */ }
  }, [lang]);

  const t = useCallback((key, vars) => {
    const dict = dictionaries[lang] || dictionaries.en;
    const template = dict[key] ?? dictionaries.en[key];
    return template === undefined ? key : interpolate(template, vars);
  }, [lang]);

  const tn = useCallback((key, n, vars) => {
    const dict = dictionaries[lang] || dictionaries.en;
    const pluralKey = `${key}.${n === 1 ? 'one' : 'many'}`;
    const template = dict[pluralKey] ?? dictionaries.en[pluralKey];
    return template === undefined ? pluralKey : interpolate(template, { n, ...vars });
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, tn }), [lang, t, tn]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export default I18nProvider;
