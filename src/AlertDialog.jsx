import React, { useState, useEffect } from 'react';
import { Bell, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import { isValidEmail, buildAlertIssue } from './lib/alerts';
import { useI18n } from './lib/i18n';

function AlertDialog({ open, onOpenChange, dates, parks, initialDate, initialParks }) {
  const { t } = useI18n();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const parkNames = parks.filter(p => p !== 'all');

  const [start, setStart] = useState(initialDate || minDate);
  const [end, setEnd] = useState(initialDate || minDate);
  const [selectedParks, setSelectedParks] = useState([]);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    if (open) {
      const d = initialDate || minDate;
      setStart(d);
      setEnd(d);
      setSelectedParks(initialParks || []);
      setSubmitted(null);
    }
  }, [open, initialDate, initialParks, minDate]);

  const togglePark = (p) => setSelectedParks(prev =>
    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const inWindow = start >= minDate && end <= maxDate;
  const validRange = start && end && start <= end && inWindow;
  const canSubmit = isValidEmail(email) && validRange;

  const submit = () => {
    if (!canSubmit) return;
    const { url } = buildAlertIssue({ email, parks: selectedParks, start, end });
    window.open(url, '_blank', 'noopener,noreferrer');
    setSubmitted(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="alert-dialog"
        className="max-h-[88vh] max-w-lg overflow-y-auto max-sm:left-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Bell className="h-5 w-5 text-emerald-600" /> {t('alert.title')}
          </DialogTitle>
          <DialogDescription>{t('alert.description')}</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-3 py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="text-sm text-gray-600">{t('alert.success')}</p>
            <a href={submitted} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              {t('alert.didntOpen')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Parks */}
            <div>
              <label className="text-sm font-medium text-gray-700">{t('filters.parks')}</label>
              <p className="mb-2 text-xs text-gray-500">{t('alert.parksHint')}</p>
              <div className="flex flex-wrap gap-2">
                {parkNames.map(p => {
                  const on = selectedParks.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePark(p)} aria-pressed={on}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        on ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dates */}
            <div>
              <label className="text-sm font-medium text-gray-700">{t('alert.dates')}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input type="date" aria-label={t('alert.startDate')} value={start} min={minDate} max={maxDate}
                  onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <span className="text-sm text-gray-500">{t('alert.to')}</span>
                <input type="date" aria-label={t('alert.endDate')} value={end} min={start} max={maxDate}
                  onChange={e => setEnd(e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="alert-email" className="text-sm font-medium text-gray-700">{t('alert.email')}</label>
              <input id="alert-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              {!isValidEmail(email) && email.length > 0 && (
                <p className="mt-1 text-xs text-red-500">{t('alert.invalidEmail')}</p>
              )}
            </div>

            <p className="text-xs text-gray-500">{t('alert.disclaimer')}</p>

            <Button
              data-testid="alert-submit"
              onClick={submit}
              disabled={!canSubmit}
              className="h-11 w-full bg-gray-900 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {t('alert.submit')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AlertDialog;
