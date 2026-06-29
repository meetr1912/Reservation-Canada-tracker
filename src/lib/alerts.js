// Helpers for the "Alert me" feature. Since the site is static (no backend),
// a subscription is created as a GitHub issue containing a machine-readable
// block; the scheduled GitHub Action reads open issues and emails on a match.

export const ALERT_REPO = 'meetr1912/Reservation-Canada-tracker';

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function parkLabel(parks) {
  if (!parks || parks.length === 0) return 'Any park';
  if (parks.length <= 2) return parks.join(', ');
  return `${parks.length} parks`;
}

// Build the prefilled GitHub "new issue" URL for an email watch request.
export function buildAlertIssue({ email, parks, start, end }) {
  const dateLabel = start === end ? start : `${start} → ${end}`;
  const payload = {
    email: (email || '').trim(),
    parks: parks || [],
    start,
    end,
  };
  const title = `🔔 Alert: ${parkLabel(parks)} · ${dateLabel}`;
  const body =
`Watch request — get an email when a watched site opens up.

**Dates:** ${dateLabel}
**Parks:** ${parks && parks.length ? parks.join(', ') : 'Any park'}
**Email:** ${payload.email}

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
