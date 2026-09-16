# Parks Canada oTENTik Availability Tracker

🔗 **Live Site:** https://meetr1912.github.io/Reservation-Canada-tracker/

A real-time availability tracker for Parks Canada oTENTik sites with automated scanning (every 4 hours), email/SMS availability alerts, and a beautiful React dashboard.

## 🏕️ Coverage

Coverage is data-driven: the scanner tracks every unit listed in
`resources.json` (built by `discover.py`) — currently **552 prebuilt sites
across 51 locations** (oTENTiks, yurts, cabins, equipped camping, micrOcube,
prospector tents, teepees, Ôasis and more). Totals live in the report's
`metadata`, so the UI never hard-codes them.

**oTENTiks** are a unique Parks Canada accommodation - a cross between a tent and a rustic cabin, offering a comfortable camping experience with beds, furniture, and a covered porch. Perfect for families new to camping or those seeking comfort in nature.

### Future Support
The scanner architecture can be extended to support:
- ⛺ Traditional campsites
- 🏠 Backcountry shelters
- 🚐 RV sites
- 🏘️ Parks Canada roofed accommodations

## Features

- 🏕️ **Real-time Tracking**: Monitors availability across 550+ prebuilt sites (oTENTiks, yurts, cabins & more) nationwide
- 📊 **Interactive Dashboard**: Beautiful React UI to visualize availability data
- ⏰ **Automated Scanning**: GitHub Actions runs scans every 4 hours automatically
- 🔔 **Availability Alerts**: Email when a watched park has an opening on your dates
- 🔍 **Smart Filtering**: Multi-select parks and accommodation types, search, availability-only toggle
- 🌙 **Multi-night stays**: Check 1–3 consecutive nights; list and booking links follow the stay length
- 🔗 **Shareable URLs**: Date, parks, types, nights, view and language live in the query string
- 🇫🇷 **Bilingual**: Full English/French UI with a one-tap toggle (and `?lang=fr`)
- 📱 **Responsive & installable**: Mobile bottom-sheet filters, PWA manifest and offline support
- 🛡️ **Self-healing data**: Snapshot validation, stale-data warnings, last-good cache fallback
- 📅 **6-Month Forecast**: Scans availability for the next 180 days


## 🔔 Availability Alerts (email)

Because the site is fully static (no backend), email subscriptions are stored as
**GitHub issues** and delivered by the scanning workflow:

1. On the site, click **"Alert me"**, choose your date range + parks + email, and submit.
2. This opens a pre-filled GitHub issue containing a machine-readable `alert`
   block. Submitting it starts the watch; **closing the issue stops alerts**.
3. After each scan, `notify.py` reads open alert issues, checks the new
   availability, and emails you when a watched park has an opening on a watched
   date — each email includes a direct booking link per opening (re-notifying
   each run while it stays open). Expired watches auto-close.

### Setup (maintainer)

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Required | Notes |
| --- | --- | --- |
| `EMAIL_ADDRESS` | yes | Sending Gmail address |
| `EMAIL_PASSWORD` | yes | Gmail **app password** (not your login password) |
| `SMTP_SERVER` | no | Defaults to `smtp.gmail.com` |
| `SMTP_PORT` | no | Defaults to `587` |

If the email secrets are absent, scanning still works and alerts are simply
skipped (expired watch issues are still auto-closed).

**Privacy/limitations:** an alert issue is public and self-serve, so anyone can
file one; emails live only in their issue and stop when it's closed. This suits
a small personal tracker rather than large-scale use.


## 🧪 Testing

### End-to-end (Playwright)

Runs against the production build, served at the real GitHub Pages base path.

```bash
npm ci
npx playwright install chromium   # one-time browser download
npm run build
npm run test:e2e                  # desktop, Pixel 7, iPhone 14 and iPad Mini projects
npm run test:e2e:ui               # interactive debugging
```

Coverage includes: loading/error/retry states, multi-select park & type filters,
search, the ranked "soonest openings" feed, multi-night stays, shareable URL state,
the availability calendar, booking deep links, email-alert flows (with privacy
encoding), stale/partial-data warnings, cache fallback, frozen-clock determinism,
offline service-worker behavior, automated axe accessibility scans, and responsive
guarantees (sticky bars, mobile filter sheet, no horizontal overflow, touch-target
sizes) across desktop, Pixel 7, iPhone 14 and iPad Mini projects.

### Python (scraper/notifier)

```bash
pytest -q
```

## License

MIT License - feel free to use and modify as needed.

## Contributing

Pull requests are welcome! For major changes, please open an issue first.
