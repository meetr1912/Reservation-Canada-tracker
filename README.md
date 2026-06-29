# Parks Canada oTENTik Availability Tracker

🔗 **Live Site:** https://meetr1912.github.io/Reservation-Canada-tracker/

A real-time availability tracker for Parks Canada oTENTik sites with automated scanning (every 4 hours), email/SMS availability alerts, and a beautiful React dashboard.

## 🏕️ Coverage

### Supported Parks (13)
- **Fundy National Park** (3 campgrounds: Headquarters, Chignecto, Point Wolfe)
- **Kejimkujik National Park** (Jeremys Bay & Jakes Landing)
- **Cape Breton Highlands National Park** (4 locations: Broad Cove, Cheticamp, Ingonish Beach, Mkwesaqtuk/Cap-Rouge)
- **Prince Edward Island National Park** (2 locations: Cavendish, Stanhope)
- **Kouchibouguac National Park** (South)
- **Grand-Pré National Historic Site**

### Accommodation Types
Currently tracking: **oTENTik** (122 units across all parks)

**oTENTiks** are a unique Parks Canada accommodation - a cross between a tent and a rustic cabin, offering a comfortable camping experience with beds, furniture, and a covered porch. Perfect for families new to camping or those seeking comfort in nature.

### Future Support
The scanner architecture can be extended to support:
- ⛺ Traditional campsites
- 🏠 Backcountry shelters
- 🚐 RV sites
- 🏘️ Parks Canada roofed accommodations

## Features

- 🏕️ **Real-time Tracking**: Monitors availability across all 122 oTENTik sites
- 📊 **Interactive Dashboard**: Beautiful React UI to visualize availability data
- ⏰ **Automated Scanning**: GitHub Actions runs scans every 4 hours automatically
- 🔔 **Availability Alerts**: Watch specific dates + parks and get emailed (and optionally texted) when an opening appears
- 🔍 **Smart Filtering**: Filter by date, park, and availability status
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 📅 **6-Month Forecast**: Scans availability for the next 180 days


## 🔔 Availability Alerts

Because the site is fully static (no backend), alert subscriptions are stored as
**GitHub issues** and delivered by the scanning workflow:

1. On the site, click **"Alert me"**, choose your date range + parks + email
   (and optionally a phone number + carrier), and submit.
2. This opens a pre-filled GitHub issue containing a machine-readable `alert`
   block. Submitting it starts the watch; **closing the issue stops alerts**.
3. After each scan, `notify.py` reads open alert issues, checks the new
   availability, and emails you when a watched park has an opening on a watched
   date (re-notifying each run while it stays open). Expired watches auto-close.

### Setup (maintainer)

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Required | Notes |
| --- | --- | --- |
| `EMAIL_ADDRESS` | yes | Sending Gmail address |
| `EMAIL_PASSWORD` | yes | Gmail **app password** (not your login password) |
| `SMTP_SERVER` | no | Defaults to `smtp.gmail.com` |
| `SMTP_PORT` | no | Defaults to `587` |

If the email secrets are absent, scanning still works and alerts are simply
skipped. Phone texts use free carrier email-to-SMS gateways (Rogers, Bell,
Telus, Fido, Koodo, Virgin, Freedom, Verizon, AT&T, T-Mobile); these can be
delayed, so email is the reliable channel.

**Privacy/limitations:** an alert issue is public and self-serve, so anyone can
file one; emails live only in their issue and stop when it's closed. This suits
a small personal tracker rather than large-scale use.


## License

MIT License - feel free to use and modify as needed.

## Contributing

Pull requests are welcome! For major changes, please open an issue first.
