/**
 * KSG Production Data Receiver for Google Sheets
 * This Google Apps Script receives production data from ksgServer.js and stores it in Google Sheets
 * 
 * Setup Instructions:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Save and deploy as web app
 * 5. Set permissions to "Anyone" and execution as "Me"
 * 6. Copy the web app URL to your ksgServer.js environment variable GOOGLE_SHEETS_WEBHOOK_URL
 */

// Configuration - Change these to match your sheet structure
const SHEET_NAME = 'KSG生産データ'; // Name of the sheet tab
const HEADER_ROW = 1; // Row number where headers are located

// Column mapping - matches the data from ksgServer.js
const COLUMN_MAPPING = {
  'A': 'timestamp',           // タイムスタンプ
  'B': 'date_year',          // 年
  'C': 'date_month',         // 月  
  'D': 'date_day',           // 日
  'E': 'hinban',             // 品番
  'F': 'product_name',       // 製品名
  'G': 'lh_rh',              // LH/RH
  'H': 'operator1',          // 技能員①
  'I': 'operator2',          // 技能員②
  'J': 'good_count',         // 良品数
  'K': 'man_hours',          // 工数
  'L': 'material_defect',    // 素材不良
  'M': 'double_defect',      // ダブり
  'N': 'peeling_defect',     // ハガレ
  'O': 'foreign_matter_defect', // イブツ
  'P': 'wrinkle_defect',     // シワ
  'Q': 'deformation_defect', // ヘンケイ
  'R': 'grease_defect',      // グリス付着
  'S': 'screw_loose_defect', // ビス不締まり
  'T': 'other_defect',       // その他
  'U': 'other_description',  // その他説明
  'V': 'shoulder_defect',    // ショルダー
  'W': 'silver_defect',      // シルバー
  'X': 'shoulder_scratch_defect', // ショルダーキズ
  'Y': 'shoulder_other_defect',   // ショルダーその他
  'Z': 'start_time',         // 開始時間
  'AA': 'end_time',          // 終了時間
  'AB': 'break_time',        // 休憩時間
  'AC': 'break1_start',      // 休憩1開始
  'AD': 'break1_end',        // 休憩1終了
  'AE': 'break2_start',      // 休憩2開始
  'AF': 'break2_end',        // 休憩2終了
  'AG': 'break3_start',      // 休憩3開始
  'AH': 'break3_end',        // 休憩3終了
  'AI': 'break4_start',      // 休憩4開始
  'AJ': 'break4_end',        // 休憩4終了
  'AK': 'remarks',           // 備考
  'AL': 'excluded_man_hours', // 除外工数
  'AM': 'average_cycle_time', // 平均サイクル時間
  'AN': 'fastest_cycle_time', // 最速サイクル時間
  'AO': 'slowest_cycle_time', // 最遅サイクル時間
  'AP': 'device_id',         // デバイスID
  'AQ': 'submitted_from',    // 送信元IP
  'AR': 'company'            // 会社名
};

/**
 * Main function to handle incoming POST requests
 */
function doPost(e) {
  try {
    // Log the incoming request
    console.log('📥 Received POST request');
    console.log('Request body:', e.postData.contents);
    
    // Parse JSON data
    const data = JSON.parse(e.postData.contents);
    console.log('📋 Parsed data:', JSON.stringify(data, null, 2));
    
    // Get or create the spreadsheet
    const sheet = getOrCreateSheet();
    
    // Add headers if they don't exist
    setupHeaders(sheet);
    
    // Add the data to the sheet
    const rowNumber = addDataToSheet(sheet, data);
    
    // Format the new row
    formatNewRow(sheet, rowNumber);
    
    console.log(`✅ Data successfully added to row ${rowNumber}`);
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Data received and processed successfully',
        rowNumber: rowNumber,
        timestamp: new Date().toISOString(),
        hinban: data.hinban || 'N/A'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error processing request:', error);
    
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      message: 'KSG Production Data Receiver is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      endpoints: {
        POST: 'Send production data',
        GET: 'Status check'
      }
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get the target sheet or create it if it doesn't exist
 */
function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    console.log(`📄 Creating new sheet: ${SHEET_NAME}`);
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  
  return sheet;
}

/**
 * Setup column headers if they don't exist
 */
function setupHeaders(sheet) {
  const headers = [
    'タイムスタンプ', '年', '月', '日', '品番', '製品名', 'LH/RH',
    '技能員①', '技能員②', '良品数', '工数',
    '素材不良', 'ダブり', 'ハガレ', 'イブツ', 'シワ', 'ヘンケイ',
    'グリス付着', 'ビス不締まり', 'その他', 'その他説明',
    'ショルダー', 'シルバー', 'ショルダーキズ', 'ショルダーその他',
    '開始時間', '終了時間', '休憩時間',
    '休憩1開始', '休憩1終了', '休憩2開始', '休憩2終了',
    '休憩3開始', '休憩3終了', '休憩4開始', '休憩4終了',
    '備考', '除外工数', '平均サイクル時間', '最速サイクル時間', '最遅サイクル時間',
    'デバイスID', '送信元IP', '会社名'
  ];
  
  // Check if headers exist
  const firstRow = sheet.getRange(HEADER_ROW, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow.some(cell => cell !== '');
  
  if (!hasHeaders) {
    console.log('📝 Setting up column headers');
    sheet.getRange(HEADER_ROW, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    const headerRange = sheet.getRange(HEADER_ROW, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // Freeze the header row
    sheet.setFrozenRows(HEADER_ROW);
  }
}

/**
 * Add data to the sheet
 */
function addDataToSheet(sheet, data) {
  const lastRow = sheet.getLastRow();
  const newRowNumber = lastRow + 1;
  
  console.log(`📝 Adding data to row ${newRowNumber}`);
  
  // Create array of values in correct column order
  const rowData = [];
  const columnLetters = Object.keys(COLUMN_MAPPING);
  
  for (let i = 0; i < columnLetters.length; i++) {
    const columnLetter = columnLetters[i];
    const dataKey = COLUMN_MAPPING[columnLetter];
    let value = data[dataKey] || '';
    
    // Format specific data types
    if (dataKey === 'timestamp') {
      value = new Date(value);
    } else if (typeof value === 'number') {
      // Keep numbers as numbers
    } else if (value === '' || value === null || value === undefined) {
      value = '';
    }
    
    rowData.push(value);
  }
  
  // Write the data to the sheet
  sheet.getRange(newRowNumber, 1, 1, rowData.length).setValues([rowData]);
  
  return newRowNumber;
}

/**
 * Format the newly added row
 */
function formatNewRow(sheet, rowNumber) {
  const totalColumns = Object.keys(COLUMN_MAPPING).length;
  const range = sheet.getRange(rowNumber, 1, 1, totalColumns);
  
  // Alternate row colors
  if (rowNumber % 2 === 0) {
    range.setBackground('#f8f9fa');
  }
  
  // Set borders
  range.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  
  // Format timestamp column
  if (sheet.getRange(rowNumber, 1).getValue() instanceof Date) {
    sheet.getRange(rowNumber, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
  }
  
  // Format numeric columns (adjust column numbers as needed)
  const numericColumns = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 41, 42, 43, 44]; // Good count, defects, cycle times, etc.
  numericColumns.forEach(col => {
    if (col <= totalColumns) {
      const cell = sheet.getRange(rowNumber, col);
      cell.setHorizontalAlignment('right');
      if (col >= 42 && col <= 44) { // Cycle time columns
        cell.setNumberFormat('0.00"秒"');
      }
    }
  });
  
  // Auto-resize columns (only if sheet is small)
  if (sheet.getLastRow() <= 10) {
    sheet.autoResizeColumns(1, totalColumns);
  }
}

/**
 * Test function to simulate receiving data (for development)
 */
function testDataReceiver() {
  const testData = {
    timestamp: new Date().toISOString(),
    date_year: 2025,
    date_month: 8,
    date_day: 6,
    hinban: 'TEST123',
    product_name: 'テスト製品',
    lh_rh: 'LH',
    operator1: 'テストユーザー1',
    operator2: 'テストユーザー2',
    good_count: 100,
    man_hours: 8,
    material_defect: 1,
    double_defect: 0,
    peeling_defect: 2,
    start_time: '09:00:00',
    end_time: '17:00:00',
    break_time: 60,
    remarks: 'テストデータ',
    average_cycle_time: 30.5,
    device_id: '4Y02SX',
    company: 'KSG'
  };
  
  try {
    const sheet = getOrCreateSheet();
    setupHeaders(sheet);
    const rowNumber = addDataToSheet(sheet, testData);
    formatNewRow(sheet, rowNumber);
    
    console.log(`✅ Test data added to row ${rowNumber}`);
    return { success: true, rowNumber: rowNumber };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear all data except headers (for development/testing)
 */
function clearAllData() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow > HEADER_ROW) {
    const dataRange = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, sheet.getLastColumn());
    dataRange.clearContent();
    console.log(`🗑️ Cleared ${lastRow - HEADER_ROW} rows of data`);
  } else {
    console.log('ℹ️ No data rows to clear');
  }
}

/**
 * Get statistics about the data
 */
function getDataStatistics() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  const dataRows = lastRow - HEADER_ROW;
  
  if (dataRows <= 0) {
    return { totalRows: 0, message: 'No data available' };
  }
  
  // Get some sample statistics
  const hinbanColumn = 5; // Column E (品番)
  const goodCountColumn = 10; // Column J (良品数)
  
  const hinbanRange = sheet.getRange(HEADER_ROW + 1, hinbanColumn, dataRows, 1);
  const goodCountRange = sheet.getRange(HEADER_ROW + 1, goodCountColumn, dataRows, 1);
  
  const hinbanValues = hinbanRange.getValues().flat().filter(value => value !== '');
  const goodCountValues = goodCountRange.getValues().flat().filter(value => value !== '' && !isNaN(value));
  
  const totalGoodParts = goodCountValues.reduce((sum, count) => sum + Number(count), 0);
  const uniqueHinban = [...new Set(hinbanValues)];
  
  return {
    totalRows: dataRows,
    uniqueProducts: uniqueHinban.length,
    totalGoodParts: totalGoodParts,
    averageGoodParts: goodCountValues.length > 0 ? totalGoodParts / goodCountValues.length : 0,
    lastUpdated: new Date().toISOString()
  };
}
