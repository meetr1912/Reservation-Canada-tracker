// Helpers for the "Alert me" feature. Since the site is static (no backend),
// a subscription is created as a GitHub issue containing a machine-readable
// block; the hourly GitHub Action reads open issues and emails on a match.

export const ALERT_REPO = 'meetr1912/Reservation-Canada-tracker';

// SMS-over-email gateways. `value` is the gateway domain; a text is sent to
// <number>@<domain>. Kept in sync with the allowlist in notify.py.
export const CARRIERS = [
  { label: 'No phone (email only)', value: '' },
  { label: 'Rogers', value: 'pcs.rogers.com' },
  { label: 'Bell', value: 'txt.bell.ca' },
  { label: 'Telus', value: 'msg.telus.com' },
  { label: 'Fido', value: 'fido.ca' },
  { label: 'Koodo', value: 'msg.koodomobile.com' },
  { label: 'Virgin Plus', value: 'vmobile.ca' },
  { label: 'Freedom Mobile', value: 'txt.freedommobile.ca' },
  { label: 'Verizon (US)', value: 'vtext.com' },
  { label: 'AT&T (US)', value: 'txt.att.net' },
  { label: 'T-Mobile (US)', value: 'tmomail.net' },
];

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function parkLabel(parks) {
  if (!parks || parks.length === 0) return 'Any park';
  if (parks.length <= 2) return parks.join(', ');
  return `${parks.length} parks`;
}

// Build the prefilled GitHub "new issue" URL for a watch request.
export function buildAlertIssue({ email, phone, carrier, parks, start, end }) {
  const dateLabel = start === end ? start : `${start} → ${end}`;
  const payload = {
    email: (email || '').trim(),
    phone: (phone || '').replace(/[^\d]/g, ''),
    carrier: carrier || '',
    parks: parks || [],
    start,
    end,
  };
  const title = `🔔 Alert: ${parkLabel(parks)} · ${dateLabel}`;
  const phoneLine = payload.phone
    ? `\n**Phone:** ${payload.phone} (texts via ${carrier})`
    : '';
  const body =
`Watch request — get notified when a watched oTENTik opens up.

**Dates:** ${dateLabel}
**Parks:** ${parks && parks.length ? parks.join(', ') : 'Any park'}
**Email:** ${payload.email}${phoneLine}

_Submit this issue to start the watch. **Close it any time to stop alerts.** Don't edit the block below — the tracker reads it automatically._

\`\`\`alert
${JSON.stringify(payload, null, 2)}
\`\`\`
`;
  const url = `https://github.com/${ALERT_REPO}/issues/new`
    + `?labels=alert`
    + `&title=${encodeURIComponent(title)}`
    + `&body=${encodeURIComponent(body)}`;
  return { url, title, payload };
}
