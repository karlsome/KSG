const { google } = require('googleapis');

const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const DEFAULT_HEADER_ROW = 1;

const PRE_DEFECT_EXPORT_FIELDS = [
  { key: 'timestamp', header: 'タイムスタンプ', aliases: ['timestamp'] },
  { key: 'date_year', header: '日付（年）', aliases: ['年', '日付(年)', 'date_year'] },
  { key: 'date_month', header: '日付（月）', aliases: ['月', '日付(月)', 'date_month'] },
  { key: 'date_day', header: '日付（日）', aliases: ['日', '日付(日)', 'date_day'] },
  { key: '工場', header: '工場', aliases: ['factory', '工場名', 'factoryLocation', 'factory_location'] },
  { key: 'hinban', header: '品番', aliases: ['品目番号', 'product_number'] },
  { key: 'product_name', header: '製品名', aliases: ['product_name'] },
  { key: 'kanban_id', header: 'かんばんID', aliases: ['kanbanID', 'kanban_id'] },
  { key: 'hako_iresu', header: '箱入数', aliases: ['hakoIresu', 'capacity'] },
  { key: 'lh_rh', header: 'LH/RH', aliases: ['lhrh', 'LHRH'] },
  { key: 'operator1', header: '技能員①', aliases: ['技能員1', 'operator1'] },
  { key: 'operator2', header: '技能員②', aliases: ['技能員2', 'operator2'] },
  { key: 'good_count', header: '良品数', aliases: ['good_count'] },
  { key: 'man_hours', header: '工数', aliases: ['man_hours'] },
  { key: 'cycle_time', header: 'サイクルタイム', aliases: ['cycle_time', '平均サイクル時間'] },
];

const POST_DEFECT_EXPORT_FIELDS = [
  { key: 'other_description', header: 'その他詳細', aliases: ['その他説明', 'other_description'] },
  { key: 'start_time', header: '開始時間', aliases: ['start_time'] },
  { key: 'end_time', header: '終了時間', aliases: ['end_time'] },
  { key: 'break_time', header: '休憩時間', aliases: ['break_time'] },
  { key: 'trouble_time', header: '機械トラブル時間', aliases: ['trouble_time', 'トラブル時間'] },
  { key: 'remarks', header: '備考', aliases: ['remarks'] },
  { key: 'excluded_man_hours', header: '工数（除外工数）', aliases: ['除外工数', 'excluded_man_hours'] },
  { key: 'submitted_from', header: '送信元', aliases: ['送信元IP', 'submitted_from'] },
];

let cachedSheetsClient = null;
let cachedServiceEmail = null;

function sanitizePrivateKey(value = '') {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function getGoogleServiceAccountCredentials() {
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || '';

  if (inlineJson) {
    const parsed = JSON.parse(inlineJson);
    const privateKey = sanitizePrivateKey(parsed.private_key || parsed.privateKey || '');
    const clientEmail = String(parsed.client_email || parsed.clientEmail || '').trim();

    if (!clientEmail || !privateKey) {
      throw new Error('Google service account JSON is missing client_email or private_key');
    }

    cachedServiceEmail = clientEmail;
    return {
      client_email: clientEmail,
      private_key: privateKey,
      project_id: String(parsed.project_id || parsed.projectId || '').trim(),
    };
  }

  const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = sanitizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '');

  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials are not configured');
  }

  cachedServiceEmail = clientEmail;
  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: String(process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID || '').trim(),
  };
}

function hasGoogleServiceAccountCredentials() {
  try {
    getGoogleServiceAccountCredentials();
    return true;
  } catch (_error) {
    return false;
  }
}

function getGoogleServiceAccountEmail() {
  if (cachedServiceEmail) {
    return cachedServiceEmail;
  }

  try {
    return getGoogleServiceAccountCredentials().client_email;
  } catch (_error) {
    return '';
  }
}

async function getGoogleSheetsClient() {
  if (cachedSheetsClient) {
    return cachedSheetsClient;
  }

  const credentials = getGoogleServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: GOOGLE_SHEETS_SCOPES,
  });

  const authClient = await auth.getClient();
  cachedSheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return cachedSheetsClient;
}

function normalizeHeaderText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[()（）\[\]【】「」『』_\-]/g, '');
}

function extractSpreadsheetId(spreadsheetUrlOrId = '') {
  const rawValue = String(spreadsheetUrlOrId || '').trim();
  if (!rawValue) {
    throw new Error('Google Sheet link is required');
  }

  const urlMatch = rawValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(rawValue)) {
    return rawValue;
  }

  throw new Error('Could not extract spreadsheet ID from the provided link');
}

function toColumnLetter(columnNumber) {
  let dividend = Number(columnNumber) || 0;
  let columnName = '';

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName || 'A';
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildExpectedFields({ ngGroup = null } = {}) {
  const defectFields = Array.isArray(ngGroup?.items)
    ? ngGroup.items.map(item => ({
        key: String(item?.name || '').trim(),
        header: String(item?.name || '').trim(),
        aliases: [String(item?.name || '').trim()],
        kind: 'defect',
        countUp: item?.countUp !== false,
      })).filter(field => field.key)
    : [];

  return [
    ...PRE_DEFECT_EXPORT_FIELDS.map(field => ({ ...field, kind: 'fixed' })),
    ...defectFields,
    ...POST_DEFECT_EXPORT_FIELDS.map(field => ({ ...field, kind: 'fixed' })),
  ];
}

function getFieldAliasCandidates(field = {}) {
  return uniqueValues([
    field.header,
    field.key,
    ...(Array.isArray(field.aliases) ? field.aliases : []),
  ]);
}

function matchFieldToHeader(field, availableHeaders = [], usedHeaderNames = new Set()) {
  const aliasCandidates = getFieldAliasCandidates(field);
  const aliasNormalized = new Set(aliasCandidates.map(normalizeHeaderText).filter(Boolean));

  const exactCandidates = availableHeaders.filter(header => (
    !usedHeaderNames.has(header.name) && aliasCandidates.includes(header.name)
  ));

  if (exactCandidates.length === 1) {
    return {
      matched: true,
      confidence: 'high',
      reason: 'exact',
      headerName: exactCandidates[0].name,
      columnIndex: exactCandidates[0].columnIndex,
      candidates: exactCandidates,
    };
  }

  if (exactCandidates.length > 1) {
    return {
      matched: false,
      confidence: 'ambiguous',
      reason: 'exact-multiple',
      candidates: exactCandidates,
    };
  }

  const normalizedCandidates = availableHeaders.filter(header => (
    !usedHeaderNames.has(header.name) && aliasNormalized.has(header.normalized)
  ));

  if (normalizedCandidates.length === 1) {
    return {
      matched: true,
      confidence: 'medium',
      reason: 'normalized',
      headerName: normalizedCandidates[0].name,
      columnIndex: normalizedCandidates[0].columnIndex,
      candidates: normalizedCandidates,
    };
  }

  if (normalizedCandidates.length > 1) {
    return {
      matched: false,
      confidence: 'ambiguous',
      reason: 'normalized-multiple',
      candidates: normalizedCandidates,
    };
  }

  return {
    matched: false,
    confidence: 'none',
    reason: 'not-found',
    candidates: [],
  };
}

function buildAvailableHeaders(headers = []) {
  return headers
    .map((header, index) => ({
      name: String(header || '').trim(),
      columnIndex: index + 1,
      normalized: normalizeHeaderText(header),
    }))
    .filter(header => header.name);
}

function analyzeExpectedFields({ headers = [], expectedFields = [], storedMappings = [] } = {}) {
  const availableHeaders = buildAvailableHeaders(headers);
  const usedHeaderNames = new Set();
  const savedMappingByField = new Map(
    (Array.isArray(storedMappings) ? storedMappings : [])
      .filter(mapping => mapping?.fieldKey)
      .map(mapping => [String(mapping.fieldKey), mapping])
  );

  const fieldResults = expectedFields.map(field => {
    const savedMapping = savedMappingByField.get(String(field.key));
    const savedHeaderName = String(savedMapping?.headerName || '').trim();

    if (savedHeaderName) {
      const savedHeader = availableHeaders.find(header => header.name === savedHeaderName);
      if (savedHeader) {
        usedHeaderNames.add(savedHeader.name);
        return {
          fieldKey: field.key,
          fieldLabel: field.header,
          kind: field.kind,
          countUp: field.countUp !== false,
          status: 'matched',
          confidence: 'saved',
          action: 'map',
          headerName: savedHeader.name,
          columnIndex: savedHeader.columnIndex,
          candidateHeaders: [],
        };
      }
    }

    const match = matchFieldToHeader(field, availableHeaders, usedHeaderNames);
    if (match.matched) {
      usedHeaderNames.add(match.headerName);
      return {
        fieldKey: field.key,
        fieldLabel: field.header,
        kind: field.kind,
        countUp: field.countUp !== false,
        status: 'matched',
        confidence: match.confidence,
        action: 'map',
        headerName: match.headerName,
        columnIndex: match.columnIndex,
        candidateHeaders: [],
      };
    }

    return {
      fieldKey: field.key,
      fieldLabel: field.header,
      kind: field.kind,
      countUp: field.countUp !== false,
      status: match.confidence === 'ambiguous' ? 'review' : 'new',
      confidence: match.confidence,
      action: match.confidence === 'ambiguous' ? 'review' : 'create',
      headerName: savedHeaderName || field.header,
      columnIndex: null,
      candidateHeaders: (match.candidates || []).map(candidate => ({
        headerName: candidate.name,
        columnIndex: candidate.columnIndex,
      })),
    };
  });

  const matchedHeaderNames = new Set(
    fieldResults
      .filter(result => result.status === 'matched' && result.headerName)
      .map(result => result.headerName)
  );

  const unusedHeaders = availableHeaders
    .filter(header => !matchedHeaderNames.has(header.name))
    .map(header => ({ headerName: header.name, columnIndex: header.columnIndex }));

  return {
    fields: fieldResults,
    unusedHeaders,
  };
}

async function inspectSpreadsheet(spreadsheetUrlOrId) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  const response = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties(sheetId,title,index,gridProperties(rowCount,columnCount))',
  });

  const spreadsheetTitle = String(response.data?.properties?.title || '').trim();
  const sheets = Array.isArray(response.data?.sheets)
    ? response.data.sheets.map(sheet => ({
        sheetId: sheet.properties?.sheetId,
        sheetName: sheet.properties?.title || '',
        index: sheet.properties?.index ?? 0,
        rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
        columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
      }))
    : [];

  return {
    spreadsheetId,
    spreadsheetTitle,
    sheets,
  };
}

async function getSheetHeaders(spreadsheetId, sheetName, headerRow = DEFAULT_HEADER_ROW) {
  const sheetsClient = await getGoogleSheetsClient();
  const quotedSheetName = sheetName.replace(/'/g, "''");
  const range = `'${quotedSheetName}'!${headerRow}:${headerRow}`;
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return Array.isArray(response.data?.values?.[0]) ? response.data.values[0] : [];
}

async function analyzeSheetTarget({ spreadsheetUrlOrId, sheetName, ngGroup, storedMappings = [], headerRow = DEFAULT_HEADER_ROW } = {}) {
  const inspection = await inspectSpreadsheet(spreadsheetUrlOrId);
  const selectedSheet = inspection.sheets.find(sheet => sheet.sheetName === sheetName);
  if (!selectedSheet) {
    throw new Error(`Sheet tab not found: ${sheetName}`);
  }

  const headers = await getSheetHeaders(inspection.spreadsheetId, sheetName, headerRow);
  const expectedFields = buildExpectedFields({ ngGroup });
  const analysis = analyzeExpectedFields({ headers, expectedFields, storedMappings });

  return {
    ...inspection,
    headerRow,
    selectedSheet,
    headers,
    expectedFields,
    analysis,
  };
}

function formatTimestampForSheet(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
  }, {});

  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatFieldValue(field = {}, value) {
  const fieldKey = String(field?.key || '');

  if (fieldKey === 'timestamp') {
    return formatTimestampForSheet(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (field?.kind === 'defect') {
    if (typeof value === 'string' && value.trim() === '') {
      return '';
    }

    if (typeof value === 'number') {
      return value === 0 ? '' : value;
    }

    const normalized = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(normalized) && Number(normalized) === 0) {
      return '';
    }
  }

  return value;
}

function buildStoredMappings(fieldMappings = []) {
  return Array.isArray(fieldMappings)
    ? fieldMappings.map(mapping => ({
        fieldKey: String(mapping?.fieldKey || '').trim(),
        headerName: String(mapping?.headerName || '').trim(),
        action: mapping?.action === 'map' ? 'map' : 'create',
      })).filter(mapping => mapping.fieldKey && mapping.headerName)
    : [];
}

function buildSheetRowValues({ headers = [], fieldColumnMap = new Map(), expectedFields = [], submission = {}, baseValues = [] } = {}) {
  const rowValues = Array.from({ length: headers.length }, (_value, index) => {
    const existingValue = Array.isArray(baseValues) ? baseValues[index] : '';
    return existingValue === undefined || existingValue === null ? '' : existingValue;
  });

  expectedFields.forEach(field => {
    const columnIndex = fieldColumnMap.get(field.key);
    if (!columnIndex) {
      return;
    }

    rowValues[columnIndex - 1] = formatFieldValue(field, submission[field.key]);
  });

  return rowValues;
}

function normalizeTimestampMatchValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (value instanceof Date) {
    return normalizeTimestampMatchValue(formatTimestampForSheet(value));
  }

  const textValue = String(value).trim();

  if (/T\d{2}:\d{2}/.test(textValue) || /(?:Z|GMT|UTC)$/i.test(textValue)) {
    const parsedDate = new Date(textValue);
    if (!Number.isNaN(parsedDate.getTime())) {
      return normalizeTimestampMatchValue(formatTimestampForSheet(parsedDate));
    }
  }

  const textMatch = textValue.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (textMatch) {
    return `${Number(textMatch[1])}-${Number(textMatch[2])}-${Number(textMatch[3])} ${Number(textMatch[4])}:${Number(textMatch[5])}:${Number(textMatch[6] || 0)}`;
  }

  const parsedDate = new Date(textValue);
  if (!Number.isNaN(parsedDate.getTime())) {
    return normalizeTimestampMatchValue(formatTimestampForSheet(parsedDate));
  }

  return textValue;
}

function getSingleColumnValues(valueRange = {}) {
  const rows = Array.isArray(valueRange?.values) ? valueRange.values : [];
  return rows.map(row => String(Array.isArray(row) ? row[0] ?? '' : '').trim());
}

async function ensureHeadersForTarget({ spreadsheetId, sheetName, expectedFields = [], fieldMappings = [], headerRow = DEFAULT_HEADER_ROW } = {}) {
  const sheetsClient = await getGoogleSheetsClient();
  const headers = await getSheetHeaders(spreadsheetId, sheetName, headerRow);
  const analysis = analyzeExpectedFields({
    headers,
    expectedFields,
    storedMappings: buildStoredMappings(fieldMappings),
  });

  const resolvedHeaders = [...headers];
  const fieldColumnMap = new Map();

  analysis.fields.forEach(field => {
    if (field.status === 'matched' && field.columnIndex) {
      fieldColumnMap.set(field.fieldKey, field.columnIndex);
      return;
    }

    const preferredHeader = field.headerName || field.fieldLabel;
    const existingIndex = resolvedHeaders.findIndex(header => String(header || '').trim() === preferredHeader);

    if (existingIndex >= 0) {
      fieldColumnMap.set(field.fieldKey, existingIndex + 1);
      return;
    }

    resolvedHeaders.push(preferredHeader);
    fieldColumnMap.set(field.fieldKey, resolvedHeaders.length);
  });

  if (resolvedHeaders.length !== headers.length || resolvedHeaders.some((header, index) => header !== headers[index])) {
    const lastColumnLetter = toColumnLetter(Math.max(resolvedHeaders.length, 1));
    const quotedSheetName = sheetName.replace(/'/g, "''");
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `'${quotedSheetName}'!A${headerRow}:${lastColumnLetter}${headerRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [resolvedHeaders],
      },
    });
  }

  return {
    headers: resolvedHeaders,
    fieldColumnMap,
  };
}

async function findSubmissionRowInSheet({ spreadsheetId, sheetName, fieldColumnMap = new Map(), expectedFields = [], previousSubmission = {}, submission = {}, headerRow = DEFAULT_HEADER_ROW } = {}) {
  const sheetsClient = await getGoogleSheetsClient();
  const quotedSheetName = sheetName.replace(/'/g, "''");
  const fieldsByKey = new Map(expectedFields.map(field => [field.key, field]));
  const timestampColumnIndex = fieldColumnMap.get('timestamp');
  const timestampValue = normalizeTimestampMatchValue(previousSubmission.timestamp ?? submission.timestamp);

  if (!timestampColumnIndex) {
    throw new Error('Timestamp column is not configured for this sheet');
  }

  if (!timestampValue) {
    throw new Error('Timestamp is required to locate the matching sheet row');
  }

  const matchKeys = ['timestamp', 'hinban', 'kanban_id', 'product_name', 'submitted_from'];
  const matchSpecs = matchKeys.reduce((accumulator, key) => {
    const columnIndex = fieldColumnMap.get(key);
    if (!columnIndex) {
      return accumulator;
    }

    if (key === 'timestamp') {
      accumulator.push({ key, columnIndex, value: timestampValue });
      return accumulator;
    }

    const field = fieldsByKey.get(key) || { key };
    const rawValue = previousSubmission[key] ?? submission[key];
    const formattedValue = String(formatFieldValue(field, rawValue) ?? '').trim();
    if (!formattedValue) {
      return accumulator;
    }

    accumulator.push({ key, columnIndex, value: formattedValue });
    return accumulator;
  }, []);

  const ranges = matchSpecs.map(spec => {
    const columnLetter = toColumnLetter(spec.columnIndex);
    return `'${quotedSheetName}'!${columnLetter}${headerRow + 1}:${columnLetter}`;
  });

  const response = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const valueRanges = Array.isArray(response.data?.valueRanges) ? response.data.valueRanges : [];
  const columnValuesByKey = new Map();

  matchSpecs.forEach((spec, index) => {
    const rawValues = getSingleColumnValues(valueRanges[index]);
    columnValuesByKey.set(
      spec.key,
      spec.key === 'timestamp' ? rawValues.map(normalizeTimestampMatchValue) : rawValues
    );
  });

  const timestampValues = columnValuesByKey.get('timestamp') || [];
  const timestampMatches = [];
  timestampValues.forEach((value, rowIndex) => {
    if (value === timestampValue) {
      timestampMatches.push(headerRow + 1 + rowIndex);
    }
  });

  if (timestampMatches.length === 0) {
    return {
      found: false,
      reason: 'timestamp-not-found',
      timestampValue,
      matchCount: 0,
    };
  }

  if (timestampMatches.length === 1) {
    return {
      found: true,
      rowNumber: timestampMatches[0],
      matchCount: 1,
      matchedBy: 'timestamp',
      timestampValue,
    };
  }

  let narrowedMatches = [...timestampMatches];

  matchSpecs.forEach(spec => {
    if (spec.key === 'timestamp' || narrowedMatches.length <= 1) {
      return;
    }

    const columnValues = columnValuesByKey.get(spec.key) || [];
    const filteredMatches = narrowedMatches.filter(rowNumber => {
      const rowIndex = rowNumber - (headerRow + 1);
      return String(columnValues[rowIndex] ?? '').trim() === spec.value;
    });

    if (filteredMatches.length > 0) {
      narrowedMatches = filteredMatches;
    }
  });

  if (narrowedMatches.length === 1) {
    return {
      found: true,
      rowNumber: narrowedMatches[0],
      matchCount: 1,
      matchedBy: 'timestamp+fallback',
      timestampValue,
    };
  }

  return {
    found: false,
    reason: 'ambiguous-timestamp',
    timestampValue,
    matchCount: narrowedMatches.length,
  };
}

async function updateSubmissionRowInSheet({ spreadsheetId, sheetName, expectedFields = [], fieldMappings = [], submission = {}, previousSubmission = {}, headerRow = DEFAULT_HEADER_ROW } = {}) {
  const sheetsClient = await getGoogleSheetsClient();
  const { headers, fieldColumnMap } = await ensureHeadersForTarget({
    spreadsheetId,
    sheetName,
    expectedFields,
    fieldMappings,
    headerRow,
  });

  const matchResult = await findSubmissionRowInSheet({
    spreadsheetId,
    sheetName,
    fieldColumnMap,
    expectedFields,
    previousSubmission,
    submission,
    headerRow,
  });

  if (!matchResult.found) {
    if (matchResult.reason === 'ambiguous-timestamp') {
      throw new Error(`Multiple Google Sheets rows matched timestamp ${matchResult.timestampValue}`);
    }

    throw new Error(`Matching Google Sheets row not found for timestamp ${matchResult.timestampValue}`);
  }

  const quotedSheetName = sheetName.replace(/'/g, "''");
  const lastColumnLetter = toColumnLetter(Math.max(headers.length, 1));
  const range = `'${quotedSheetName}'!A${matchResult.rowNumber}:${lastColumnLetter}${matchResult.rowNumber}`;
  const existingRowResponse = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const existingRowValues = Array.isArray(existingRowResponse.data?.values?.[0])
    ? existingRowResponse.data.values[0]
    : [];

  const rowValues = buildSheetRowValues({
    headers,
    fieldColumnMap,
    expectedFields,
    submission,
    baseValues: existingRowValues,
  });

  const response = await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues],
    },
  });

  return {
    rowNumber: matchResult.rowNumber,
    matchedBy: matchResult.matchedBy || 'timestamp',
    updatedRange: response.data?.updatedRange || range,
    updatedRows: Number(response.data?.updatedRows || 0),
    updatedColumns: Number(response.data?.updatedColumns || 0),
  };
}

async function appendSubmissionToSheet({ spreadsheetId, sheetName, expectedFields = [], fieldMappings = [], submission = {}, headerRow = DEFAULT_HEADER_ROW } = {}) {
  const sheetsClient = await getGoogleSheetsClient();
  const { headers, fieldColumnMap } = await ensureHeadersForTarget({
    spreadsheetId,
    sheetName,
    expectedFields,
    fieldMappings,
    headerRow,
  });

  const rowValues = buildSheetRowValues({
    headers,
    fieldColumnMap,
    expectedFields,
    submission,
  });

  const quotedSheetName = sheetName.replace(/'/g, "''");
  const response = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `'${quotedSheetName}'!A${headerRow}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });

  return {
    updatedRange: response.data?.updates?.updatedRange || '',
    updatedRows: Number(response.data?.updates?.updatedRows || 0),
    updatedColumns: Number(response.data?.updates?.updatedColumns || 0),
  };
}

module.exports = {
  DEFAULT_HEADER_ROW,
  PRE_DEFECT_EXPORT_FIELDS,
  POST_DEFECT_EXPORT_FIELDS,
  hasGoogleServiceAccountCredentials,
  getGoogleServiceAccountEmail,
  getGoogleSheetsClient,
  extractSpreadsheetId,
  normalizeHeaderText,
  buildExpectedFields,
  analyzeExpectedFields,
  inspectSpreadsheet,
  getSheetHeaders,
  analyzeSheetTarget,
  appendSubmissionToSheet,
  updateSubmissionRowInSheet,
  buildStoredMappings,
};