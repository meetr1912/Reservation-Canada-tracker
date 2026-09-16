// Helpers for the "Alert me" feature. Since the site is static (no backend),
// a subscription is created as a GitHub issue containing a machine-readable
// block; the scheduled GitHub Action reads open issues and emails on a match.
//
// Privacy: the subscriber's address is base64-encoded inside the alert block
// (and masked in the human-readable body) so it isn't trivially harvestable
// from public issues. notify.py decodes it when sending.
export const ALERT_REPO = 'meetr1912/Reservation-Canada-tracker';

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

export function encodeEmail(email) {
  const clean = (email || '').trim();
  if (typeof btoa === 'function') return `b64:${btoa(clean)}`;
  return `b64:${Buffer.from(clean, 'utf8').toString('base64')}`;
}

export function maskEmail(email) {
  const clean = (email || '').trim();
  const at = clean.indexOf('@');
  if (at <= 0) return '•••';
  return `${clean[0]}***${clean.slice(at)}`;
}

function parkLabel(parks) {
  if (!parks || parks.length === 0) return 'Any park';
  if (parks.length <= 2) return parks.join(', ');
  return `${parks.length} parks`;
}

// Build the prefilled GitHub "new issue" URL for an email watch request.
export function buildAlertIssue({ email, parks, start, end }) {
  const dateLabel = start === end ? start : `${start} → ${end}`;
  const cleanEmail = (email || '').trim();
  const payload = {
    email: encodeEmail(cleanEmail),
    parks: parks || [],
    start,
    end,
  };
  const title = `🔔 Alert: ${parkLabel(parks)} · ${dateLabel}`;
  const body =
`Watch request — get an email when a watched site opens up.

**Dates:** ${dateLabel}
**Parks:** ${parks && parks.length ? parks.join(', ') : 'Any park'}
**Email:** ${maskEmail(cleanEmail)} (encoded in the block below)

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
