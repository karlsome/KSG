# KSG Production Data - Google Sheets Integration Setup Guide

## 📋 Overview
This guide will help you set up Google Sheets to automatically receive production data from your KSG production system alongside MongoDB storage.

## 🚀 Setup Instructions

### Step 1: Create a New Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it something like "KSG 生産データ" or "KSG Production Data"

### Step 2: Setup Google Apps Script
1. In your Google Sheet, go to **Extensions** → **Apps Script**
2. Delete the default `myFunction()` code
3. Copy and paste the entire contents from `google-apps-script/KSG-Production-Data-Receiver.gs`
4. Save the project (Ctrl+S) and give it a name like "KSG Production Data Receiver"

### Step 3: Deploy as Web App
1. In Apps Script, click the **Deploy** button (top right)
2. Choose **New deployment**
3. Select type: **Web app**
4. Fill in the deployment details:
   - **Description**: "KSG Production Data Receiver"
   - **Execute as**: "Me"
   - **Who has access**: "Anyone"
5. Click **Deploy**
6. **Important**: Copy the **Web app URL** that appears - you'll need this for Step 4

### Step 4: Configure ksgServer.js
1. Create or update your `.env` file in the KSG project directory
2. Add the Google Sheets webhook URL:
```env
# Google Sheets Integration
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```
3. Replace `YOUR_SCRIPT_ID` with the actual URL you copied from Step 3
4. Restart your `ksgServer.js` to load the new environment variable

### Step 5: Grant Permissions (First Time Only)
1. After deployment, you'll need to authorize the script
2. Click **Authorize access** when prompted
3. Choose your Google account
4. Click **Advanced** → **Go to [Project Name] (unsafe)** if you see a warning
5. Click **Allow** to grant spreadsheet permissions

## 📊 Sheet Structure

The Google Sheet will automatically create the following columns:

| Column | Header | Description |
|--------|---------|------------|
| A | タイムスタンプ | Submission timestamp |
| B-D | 年/月/日 | Date (Year/Month/Day) |
| E | 品番 | Product number (hinban) |
| F | 製品名 | Product name |
| G | LH/RH | Part orientation |
| H-I | 技能員①② | Operators |
| J | 良品数 | Good parts count |
| K | 工数 | Work hours |
| L-Y | 不良項目 | Various defect types |
| Z-AA | 開始時間/終了時間 | Start/End times |
| AB | 休憩時間 | Break time |
| AC-AJ | 休憩1-4 | Break periods |
| AK | 備考 | Remarks |
| AL-AO | サイクル時間 | Cycle time data |
| AP-AR | システム情報 | Device/system info |

## 🧪 Testing the Integration

### Test 1: Google Apps Script Test
1. In Apps Script, run the `testDataReceiver()` function
2. Check your Google Sheet - you should see a test row appear
3. If successful, the integration is working

### Test 2: End-to-End Test
1. Submit production data through your webapp
2. Check both MongoDB and Google Sheets
3. You should see the data in both places

### Test 3: Status Check
1. Visit your webhook URL in a browser (GET request)
2. You should see a JSON status response

## 🔧 Troubleshooting

### Common Issues:

**❌ "Script not authorized"**
- Go back to Step 5 and complete the authorization process

**❌ "Permission denied"**
- Make sure deployment is set to "Anyone" can access
- Re-deploy if necessary

**❌ "Error in ksgServer.js: Google Sheets submission error"**
- Check that `GOOGLE_SHEETS_WEBHOOK_URL` is correctly set in `.env`
- Verify the webhook URL is accessible

**❌ "Data not appearing in Google Sheets"**
- Check Apps Script logs: **Executions** tab in Apps Script
- Look for error messages in the logs

### Debugging Steps:

1. **Check Apps Script Logs**:
   - Go to Apps Script → **Executions** tab
   - Look for recent executions and any error messages

2. **Test the Webhook Directly**:
   ```bash
   curl -X POST "YOUR_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"hinban":"TEST123","good_count":10,"company":"KSG"}'
   ```

3. **Check Environment Variables**:
   ```javascript
   console.log('Google Sheets URL:', process.env.GOOGLE_SHEETS_WEBHOOK_URL);
   ```

## ⚙️ Customization Options

### Modify Sheet Name
Change this line in the Apps Script:
```javascript
const SHEET_NAME = 'KSG生産データ'; // Change to your preferred name
```

### Add Custom Columns
1. Update `COLUMN_MAPPING` in the Apps Script
2. Update the `formattedData` object in `ksgServer.js`
3. Update the headers array in `setupHeaders()` function

### Change Date/Time Formatting
Modify the `formatNewRow()` function:
```javascript
sheet.getRange(rowNumber, 1).setNumberFormat('mm/dd/yyyy hh:mm:ss'); // US format
```

## 📈 Data Analysis Features

The Apps Script includes several utility functions:

- `getDataStatistics()` - Get production statistics
- `clearAllData()` - Clear all data (keep headers)
- `testDataReceiver()` - Add test data

You can run these from the Apps Script editor for data management.

## 🔒 Security Notes

- The webhook URL is public but doesn't expose sensitive data
- Consider adding authentication tokens if needed
- Google Sheets access is controlled by your Google account permissions
- Data is encrypted in transit (HTTPS)

## 📋 Data Flow Summary

```
Webapp → ksgServer.js → [MongoDB + Google Sheets]
                     ↓
              Dual confirmation sent back to webapp
```

Both storage methods work independently - if one fails, the other continues working, and the user sees the status of both systems.
