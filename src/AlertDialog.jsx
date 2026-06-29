import React, { useState, useEffect } from 'react';
import { Bell, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import { CARRIERS, isValidEmail, buildAlertIssue } from './lib/alerts';

function AlertDialog({ open, onOpenChange, dates, parks, initialDate, initialPark }) {
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const parkNames = parks.filter(p => p !== 'all');

  const [start, setStart] = useState(initialDate || minDate);
  const [end, setEnd] = useState(initialDate || minDate);
  const [selectedParks, setSelectedParks] = useState([]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [carrier, setCarrier] = useState('');
  const [submitted, setSubmitted] = useState(null);

  // Reset the form each time the dialog is opened.
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

  const phoneDigits = (phone || '').replace(/\D/g, '');
  const phoneOk = phoneDigits.length === 0 || (phoneDigits.length >= 10 && !!carrier);
  const inWindow = start >= minDate && end <= maxDate;
  const validRange = start && end && start <= end && inWindow;
  const canSubmit = isValidEmail(email) && validRange && phoneOk;

  const submit = () => {
    if (!canSubmit) return;
    const { url } = buildAlertIssue({ email, phone, carrier, parks: selectedParks, start, end });
    window.open(url, '_blank', 'noopener,noreferrer');
    setSubmitted(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Bell className="h-5 w-5 text-emerald-600" /> Get an availability alert
          </DialogTitle>
          <DialogDescription>
            Pick your dates and parks. We'll email you when a match opens up — checked every few hours.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="mt-4 text-center space-y-4 py-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <div>
              <p className="font-semibold text-gray-900">Almost there — confirm on GitHub</p>
              <p className="text-sm text-gray-600 mt-1">
                A pre-filled GitHub issue opened in a new tab. Click <strong>Create</strong> there to start your watch.
                Close that issue any time to stop alerts.
              </p>
            </div>
            <a href={submitted} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800">
              Didn't open? Click here <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Dates */}
            <div>
              <label className="text-sm font-medium text-gray-700">Dates to watch</label>
              <div className="flex items-center gap-2 mt-1.5">
                <input type="date" aria-label="Start date" value={start} min={minDate} max={maxDate}
                  onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }}
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" aria-label="End date" value={end} min={start} max={maxDate}
                  onChange={e => setEnd(e.target.value)}
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Pick the same date twice to watch a single day.</p>
            </div>

            {/* Parks */}
            <div>
              <label className="text-sm font-medium text-gray-700">Parks</label>
              <p className="text-xs text-gray-400 mb-2">Leave all off to watch <strong>any</strong> park.</p>
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

            {/* Contact */}
            <div>
              <label htmlFor="alert-email" className="text-sm font-medium text-gray-700">Email</label>
              <input id="alert-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-11 px-3 mt-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>

            <div>
              <label htmlFor="alert-phone" className="text-sm font-medium text-gray-700">Phone text <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="flex gap-2 mt-1.5">
                <input id="alert-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="5551234567"
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <select value={carrier} onChange={e => setCarrier(e.target.value)} aria-label="Phone carrier"
                  className="h-11 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {phoneDigits.length > 0 && !carrier ? (
                <p className="text-xs text-amber-600 mt-1">Pick your carrier to receive texts.</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Carrier texts are free but can be delayed; email is most reliable.</p>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
              Signing up opens a free GitHub issue that the tracker watches. Your email lives only in that issue —
              close it any time to stop alerts.
            </div>

            <Button onClick={submit} disabled={!canSubmit}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
              <Bell className="h-4 w-4 mr-2" /> Create alert
            </Button>
            {!isValidEmail(email) && email.length > 0 && (
              <p className="text-xs text-red-500 -mt-3">Enter a valid email address.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AlertDialog;
