# GitHub Actions Setup Guide

## Overview

Two automated workflows keep your oTENTik tracker running smoothly:

1. **Daily Scraper** - Updates availability data
2. **Deploy** - Publishes React app to GitHub Pages

## Prerequisites ⚠️ IMPORTANT

Before the workflows can run successfully, configure the following in your GitHub repository:

### 1. Enable GitHub Pages

1. Navigate to your repository: https://github.com/meetr1912/Reservation-Canada-tracker
2. Go to **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **GitHub Actions**
4. Save changes

### 2. Configure Workflow Permissions ⚠️ CRITICAL

1. Go to **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions** ← **MUST DO THIS**
4. Check ✅ **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

**Why this is required:** The scraper workflow needs write permission to commit the updated availability report. Without this, you'll get a "403 Permission denied" error.

## Workflows

### Workflow 1: Daily Availability Scan

**File:** `.github/workflows/scraper.yml`

**Schedule:** Daily at 6:00 AM UTC

**Permissions:** `contents: write` (to commit updated report)

**What it does:**
1. Checks out the repository code
2. Sets up Python 3.11 environment
3. Installs Python dependencies from `requirements.txt`
4. Installs Playwright with Chromium browser
5. Runs `test_calendar.py` to scan all 122 oTENTik sites
6. Copies the generated `availability_report.json` to `public/` folder
7. Commits and pushes the updated report

**Manual trigger:**
- Go to **Actions** tab
- Select "Daily oTENTik Availability Scan"
- Click **Run workflow**

**Expected duration:** ~8-10 minutes

### Workflow 2: Deploy React App

**File:** `.github/workflows/deploy.yml`

**Triggers:**
- Push to `main` branch with changes in `src/**`, `public/**`, or `package.json`
- Manual dispatch

**Permissions:** `contents: read`, `pages: write`, `id-token: write`

**What it does:**
1. Checks out the repository code
2. Sets up Node.js 18 with npm caching
3. Installs dependencies using `npm ci`
4. Builds the React app
5. Deploys to GitHub Pages

**Your site URL:** https://meetr1912.github.io/Reservation-Canada-tracker/

## Troubleshooting Common Errors

### ❌ Error: "Permission denied to github-actions[bot]" (403)

**Full error:**
```
remote: Permission to meetr1912/Reservation-Canada-tracker.git denied to github-actions[bot].
fatal: unable to access 'https://github.com/...': The requested URL returned error: 403
```

**Cause:** Workflow doesn't have write permissions

**Solution:**
1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Save changes
4. Re-run the workflow

✅ **Fixed in workflow:** Added `permissions: contents: write`

### ❌ Error: "Dependencies lock file is not found"

**Cause:** Missing package-lock.json

**Solution:** ✅ Already fixed - package-lock.json is now committed

### ❌ Error: Playwright not found

**Cause:** Browser not installed

**Solution:** ✅ Already handled - workflow includes `playwright install chromium`

### ❌ Error: Site shows 404

**Cause:** GitHub Pages not enabled or wrong source

**Solution:**
1. Settings → Pages
2. Source: **GitHub Actions** (not "Deploy from a branch")

## First-Time Setup Checklist

- [ ] Enable GitHub Pages (Settings → Pages → GitHub Actions)
- [ ] Set workflow permissions to "Read and write" (Settings → Actions → General)
- [ ] Trigger scraper manually (Actions → Daily oTENTik Availability Scan → Run workflow)
- [ ] Wait for scraper to complete (~8-10 min)
- [ ] Trigger deployment manually (Actions → Deploy React App → Run workflow)
- [ ] Visit your site: https://meetr1912.github.io/Reservation-Canada-tracker/

## Monitoring

### Check Status
- Go to **Actions** tab
- Recent runs show ✓ (success) or ✗ (failed)
- Click any run to see detailed logs

### Performance
- **Free tier:** 2,000 minutes/month
- **Current usage:** ~480 minutes/month ✅

## Support

If workflows fail after following this guide:
1. Check workflow logs in Actions tab
2. Verify all prerequisites are completed
3. Test locally: `python test_calendar.py` and `npm run build`
