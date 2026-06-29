import React, { useState, useEffect } from 'react';
import { Bell, ExternalLink, CheckCircle2, Copy, Check, Smartphone } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import {
  CARRIERS, isValidEmail, buildAlertIssue, ntfyTopic, ntfyUrl,
} from './lib/alerts';

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
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (open) {
      const d = initialDate || minDate;
      setStart(d);
      setEnd(d);
      setSelectedParks(initialPark && initialPark !== 'all' ? [initialPark] : []);
      setSubmitted(null);
      setCopied('');
    }
  }, [open, initialDate, initialPark, minDate]);

  const togglePark = (p) => setSelectedParks(prev =>
    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  // Topics for the free push path: chosen parks, or the catch-all when none.
  const topics = selectedParks.length
    ? selectedParks.map(p => ({ park: p, topic: ntfyTopic(p) }))
    : [{ park: 'Any park', topic: ntfyTopic('all') }];

  const copy = async (topic) => {
    try { await navigator.clipboard.writeText(topic); setCopied(topic); setTimeout(() => setCopied(''), 1500); }
    catch (e) { /* clipboard may be blocked; the Open button still works */ }
  };

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
            <Bell className="h-5 w-5 text-emerald-600" /> Get availability alerts
          </DialogTitle>
          <DialogDescription>
            Free phone push — no account, no sign-up. Pick your parks below.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Parks (shared) */}
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

          {/* Free push via ntfy — no registration */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-emerald-900">Free phone push — no sign-up</h3>
            </div>
            <ol className="text-xs text-gray-600 list-decimal ml-4 space-y-0.5 mb-3">
              <li>Install the free <strong>ntfy</strong> app (iOS / Android), or just open the link below.</li>
              <li>Subscribe to your topic{topics.length > 1 ? 's' : ''} — no account needed.</li>
              <li>Get a push whenever {selectedParks.length ? 'these parks' : 'any park'} have an opening.</li>
            </ol>
            <div className="space-y-2">
              {topics.map(({ park, topic }) => (
                <div key={topic} className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-500 truncate">{park}</p>
                    <code className="text-xs font-mono text-gray-800 break-all">{topic}</code>
                  </div>
                  <button type="button" onClick={() => copy(topic)} aria-label={`Copy topic for ${park}`}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 flex-shrink-0">
                    {copied === topic ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                  </button>
                  <a href={ntfyUrl(topic)} target="_blank" rel="noopener noreferrer"
                    className="h-8 px-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex-shrink-0">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Optional: email + exact dates via GitHub issue */}
          <details className="group rounded-2xl border border-gray-200">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 flex items-center justify-between">
              Prefer email for exact dates? <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4">
              {submitted ? (
                <div className="text-center space-y-3 py-3">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                  <p className="text-sm text-gray-600">
                    A pre-filled GitHub issue opened in a new tab — click <strong>Create</strong> there to start your watch.
                  </p>
                  <a href={submitted} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    Didn't open? Click here <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Email needs a free GitHub account (to file the watch issue). For no sign-up at all, use the push option above.
                  </p>
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
                    {phoneDigits.length > 0 && !carrier && (
                      <p className="text-xs text-amber-600 mt-1">Pick your carrier to receive texts.</p>
                    )}
                  </div>
                  <Button onClick={submit} disabled={!canSubmit}
                    className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-medium disabled:opacity-50">
                    Create email alert
                  </Button>
                  {!isValidEmail(email) && email.length > 0 && (
                    <p className="text-xs text-red-500 -mt-2">Enter a valid email address.</p>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AlertDialog;
