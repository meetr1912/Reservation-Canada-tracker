import React, { useState, useEffect } from 'react';
import { Bell, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import { isValidEmail, buildAlertIssue } from './lib/alerts';

function AlertDialog({ open, onOpenChange, dates, parks, initialDate, initialPark }) {
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
      setSelectedParks(initialPark && initialPark !== 'all' ? [initialPark] : []);
      setSubmitted(null);
    }
  }, [open, initialDate, initialPark, minDate]);

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
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Bell className="h-5 w-5 text-emerald-600" /> Get email alerts
          </DialogTitle>
          <DialogDescription>
            Get an email when a watched park has an opening on your dates.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="text-center space-y-3 py-6">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <p className="text-sm text-gray-600">
              A pre-filled GitHub issue opened in a new tab — click <strong>Create</strong> there to
              start your watch. You'll get an email whenever a match opens up; close the issue any
              time to stop.
            </p>
            <a href={submitted} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              Didn't open? Click here <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Parks */}
            <div>
              <label className="text-sm font-medium text-gray-700">Parks</label>
              <p className="text-xs text-gray-400 mb-2">Choose one or more, or leave empty for <strong>any</strong> park.</p>
              <div className="flex flex-wrap gap-2">
                {parkNames.map(p => {
                  const on = selectedParks.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePark(p)} aria-pressed={on}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        on ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dates */}
            <div>
              <label className="text-sm font-medium text-gray-700">Dates</label>
              <div className="flex items-center gap-2 mt-1.5">
                <input type="date" aria-label="Start date" value={start} min={minDate} max={maxDate}
                  onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }}
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" aria-label="End date" value={end} min={start} max={maxDate}
                  onChange={e => setEnd(e.target.value)}
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="alert-email" className="text-sm font-medium text-gray-700">Email</label>
              <input id="alert-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-11 px-3 mt-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              {!isValidEmail(email) && email.length > 0 && (
                <p className="text-xs text-red-500 mt-1">Enter a valid email address.</p>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Submitting opens a pre-filled GitHub issue (a free GitHub account is needed to file it).
              The tracker reads open issues every few hours and emails you on a match.
            </p>

            <Button onClick={submit} disabled={!canSubmit}
              className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-medium disabled:opacity-50">
              Create email alert
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AlertDialog;
