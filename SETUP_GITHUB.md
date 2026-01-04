# GitHub Setup Instructions

## ✅ Completed Steps
- React app and GitHub Actions workflows created
- Initial availability report generated and committed
- All code pushed to GitHub

## 🚀 Next Steps to Enable GitHub Pages

### 1. Enable GitHub Pages
1. Go to your repository: https://github.com/meetr1912/Reservation-Canada-tracker
2. Click **Settings** → **Pages** (in the left sidebar)
3. Under **Source**, select **GitHub Actions** (not "Deploy from a branch")
4. Save the settings

### 2. Configure Workflow Permissions
1. Go to **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Check ✓ **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

### 3. Test the Workflows

#### Test the Deployment Workflow (Manual)
1. Go to **Actions** tab in your repo
2. Click on **Deploy React App to GitHub Pages** workflow
3. Click **Run workflow** → **Run workflow**
4. Wait for it to complete (green checkmark)
5. Your site will be live at: **https://meetr1912.github.io/Reservation-Canada-tracker/**

#### Test the Scraper Workflow (Manual)
1. Go to **Actions** tab
2. Click on **Daily oTENTik Availability Scan** workflow
3. Click **Run workflow** → **Run workflow**
4. This will run the Python scraper and update the availability report

### 4. Verify Everything Works
1. After deployment completes, visit: https://meetr1912.github.io/Reservation-Canada-tracker/
2. You should see the oTENTik availability dashboard
3. The scraper will run automatically every day at 6 AM UTC

## 📋 Workflow Schedule
- **Scraper**: Runs daily at 6:00 AM UTC (automatically)
- **Deploy**: Runs when you push changes to `src/`, `public/`, or `package.json`

## 🔧 Troubleshooting

### If the site shows a blank page:
1. Check the browser console for errors (F12)
2. Ensure `public/availability_report.json` exists in your repo
3. Try running the scraper workflow manually first

### If the scraper fails:
1. Go to Actions tab and click on the failed workflow
2. Check the logs for error messages
3. Common issues:
   - Playwright installation failed → Already handled in workflow
   - Parks Canada website changed → May need to update scraper logic
   - Permissions denied → Check workflow permissions (step 2 above)

### If deployment fails:
1. Make sure GitHub Pages is set to "GitHub Actions" mode
2. Verify workflow permissions are set to "Read and write"
3. Check the deployment logs in the Actions tab

## 🎯 Quick Commands for Local Development

```bash
# Test the scraper locally
python test_calendar.py

# Copy report to public folder
cp availability_report.json public/

# Install React dependencies
npm install

# Run React app locally
npm start

# Build for production
npm run build
```

## 📊 Monitoring

- **GitHub Actions**: Check the Actions tab for workflow runs
- **Site Status**: Visit your GitHub Pages URL
- **Last Update**: Check the footer of the React app for last scan time

## 🎨 Customization

### Change Scraper Schedule
Edit `.github/workflows/scraper.yml`:
```yaml
schedule:
  - cron: '0 6 * * *'  # Format: minute hour day month weekday
```

### Change Scan Duration
Edit `test_calendar.py`, line 13:
```python
end_date = start_date + timedelta(days=180)  # Change 180 to desired days
```

### Update Site Colors
Edit `src/App.css` and `src/index.css`

---

**Ready to go! 🎉** Follow the steps above and your site will be live!
