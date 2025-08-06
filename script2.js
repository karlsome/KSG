// --- Enhanced Device Discovery Integration ---
// This version of script.js includes automatic device discovery capabilities

// Import device discovery if available
let deviceDiscovery;
if (typeof DeviceDiscovery !== 'undefined') {
    deviceDiscovery = new DeviceDiscovery();
}

// --- Configuration ---
// Dynamic API base URL (will be updated by device discovery)
let PYTHON_API_BASE_URL = 'http://192.168.0.196:5000'; // Default fallback
const NODE_API_BASE_URL = 'https://kurachi.onrender.com'; // Your Node.js server hosted on Render.com
const CUSTOMER_DB_NAME = 'KSG'; // The specific customer database name, used in queries

// Device discovery integration
window.addEventListener('deviceConnected', (event) => {
    const { device, apiBaseUrl } = event.detail;
    PYTHON_API_BASE_URL = apiBaseUrl;
    console.log(`🔗 Updated API URL to: ${PYTHON_API_BASE_URL}`);
    
    // Show connection status to user
    showStatus(`Connected to ${device.device_name} at ${device.ip_address}`, 'success');
    
    // Restart live stats polling with new URL
    stopPollingLiveStats();
    startPollingLiveStats();
});

// --- Rest of your existing script.js code ---
// (All your existing DOM elements, variables, and functions remain the same)

const statusMessage = document.getElementById('statusMessage');
const loadingIndicator = document.getElementById('loadingIndicator');

const dateYear = document.getElementById('dateYear');
const dateMonth = document.getElementById('dateMonth');
const dateDay = document.getElementById('dateDay');

const hinbanInput = document.getElementById('hinban');
const productNameInput = document.getElementById('productName');
const lhRhInput = document.getElementById('lhRh');

const operator1Select = document.getElementById('operator1');
const operator1CustomInput = document.getElementById('operator1Custom');
const operator2Select = document.getElementById('operator2');
const operator2CustomInput = document.getElementById('operator2Custom');

const goodCountInput = document.getElementById('goodCount');
const manHoursInput = document.getElementById('manHours');

const otherDescriptionTextarea = document.getElementById('otherDescription');
const remarksTextarea = document.getElementById('remarks');
const excludedManHoursInput = document.getElementById('excludedManHours');

const totalBreakTimeInput = document.getElementById('breakTime');

// Live data input fields
const initialTimeDisplayInput = document.getElementById('initialTimeDisplay');
const finalTimeDisplayInput = document.getElementById('finalTimeDisplay');
const averageCycleTimeInput = document.getElementById('averageCycleTime');

// Break time input elements
const breakInputs = {
    break1: { from: document.getElementById('break1From'), to: document.getElementById('break1To') },
    break2: { from: document.getElementById('break2From'), to: document.getElementById('break2To') },
    break3: { from: document.getElementById('break3From'), to: document.getElementById('break3To') },
    break4: { from: document.getElementById('break4From'), to: document.getElementById('break4To') },
};

const defectInputs = {
    materialDefect: document.getElementById('materialDefect'),
    doubleDefect: document.getElementById('doubleDefect'),
    peelingDefect: document.getElementById('peelingDefect'),
    foreignMatterDefect: document.getElementById('foreignMatterDefect'),
    wrinkleDefect: document.getElementById('wrinkleDefect'),
    deformationDefect: document.getElementById('deformationDefect'),
    greaseDefect: document.getElementById('greaseDefect'),
    screwLooseDefect: document.getElementById('screwLooseDefect'),
    otherDefect: document.getElementById('otherDefect'),
    shoulderDefect: document.getElementById('shoulderDefect'),
    silverDefect: document.getElementById('silverDefect'),
    shoulderScratchDefect: document.getElementById('shoulderScratchDefect'),
    shoulderOtherDefect: document.getElementById('shoulderOtherDefeet'),
};

const submitDataBtn = document.getElementById('submitDataBtn');
const resetAllBtn = document.getElementById('resetAllBtn');

// --- Global Variables for State Management ---
let qrBuffer = ''; // Buffer for QR scanner input
let operator1Scanned = false; // Flag to track if operator1 was filled by QR
let liveStatsPollingInterval; // To hold the interval ID for live data polling

// --- Enhanced Device Discovery Functions ---

/**
 * Initialize device discovery system
 */
async function initializeDeviceDiscovery() {
    if (!deviceDiscovery) {
        console.log('⚠️ Device discovery not available');
        return;
    }
    
    try {
        console.log('🔍 Initializing device discovery...');
        
        // Try to discover devices automatically
        const devices = await deviceDiscovery.discoverDevices();
        
        if (devices.length > 0) {
            console.log(`✅ Found ${devices.length} device(s) automatically`);
            
            // If only one device found, connect automatically
            if (devices.length === 1) {
                await deviceDiscovery.connectToDevice(devices[0]);
                console.log('🔗 Auto-connected to single device');
            } else {
                // Multiple devices found, show selection UI
                showDeviceSelection(devices);
            }
        } else {
            console.log('ℹ️ No devices found automatically. Using fallback URL.');
            showStatus('No Raspberry Pi devices found on network. Using default connection.', 'info');
        }
    } catch (error) {
        console.error('❌ Device discovery initialization failed:', error);
        showStatus('Device discovery failed. Using default connection.', 'error');
    }
}

/**
 * Show device selection UI if multiple devices are found
 */
function showDeviceSelection(devices) {
    // Create a simple device selection modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 500px;
        width: 90%;
        max-height: 80%;
        overflow-y: auto;
    `;
    
    content.innerHTML = `
        <h3>🔍 Select Raspberry Pi Device</h3>
        <p>Multiple devices found. Please select one to connect:</p>
        <div class="device-list">
            ${devices.map(device => `
                <div class="device-option" data-device-id="${device.device_id}" style="
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 15px;
                    margin: 10px 0;
                    cursor: pointer;
                    transition: background-color 0.2s;
                " onmouseover="this.style.backgroundColor='#f0f8ff'" onmouseout="this.style.backgroundColor='white'">
                    <h4 style="margin: 0 0 10px 0;">${device.device_name}</h4>
                    <p style="margin: 5px 0;"><strong>IP:</strong> ${device.ip_address}:${device.port}</p>
                    <p style="margin: 5px 0;"><strong>Model:</strong> ${device.pi_model || 'Unknown'}</p>
                    <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #28a745;">Online</span></p>
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 20px; text-align: center;">
            <button id="cancelSelection" style="
                background: #6c757d;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 10px;
            ">Use Default Connection</button>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Add event listeners
    content.querySelectorAll('.device-option').forEach(option => {
        option.addEventListener('click', async () => {
            const deviceId = option.dataset.deviceId;
            const device = devices.find(d => d.device_id === deviceId);
            if (device) {
                try {
                    await deviceDiscovery.connectToDevice(device);
                    document.body.removeChild(modal);
                } catch (error) {
                    alert(`Failed to connect: ${error.message}`);
                }
            }
        });
    });
    
    document.getElementById('cancelSelection').addEventListener('click', () => {
        document.body.removeChild(modal);
        showStatus('Using default connection settings.', 'info');
    });
}

// --- All your existing utility functions remain the same ---

function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800');
    if (type === 'success') {
        statusMessage.classList.add('bg-green-100', 'text-green-800');
    } else if (type === 'error') {
        statusMessage.classList.add('bg-red-100', 'text-red-800');
    } else {
        statusMessage.classList.add('bg-blue-100', 'text-blue-800');
    }
    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 5000);
}

function showLoading() {
    loadingIndicator.classList.remove('hidden');
    submitDataBtn.disabled = true;
    resetAllBtn.disabled = true;
    submitDataBtn.classList.add('opacity-50', 'cursor-not-allowed');
    resetAllBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

function hideLoading() {
    loadingIndicator.classList.add('hidden');
    submitDataBtn.disabled = false;
    resetAllBtn.disabled = false;
    submitDataBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    resetAllBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function getCurrentJSTTime() {
    const now = new Date();
    const jstOffset = 9 * 60;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const jstDate = new Date(utc + (jstOffset * 60000));

    const hours = jstDate.getHours().toString().padStart(2, '0');
    const minutes = jstDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function flashInput(element) {
    if (element) {
        element.classList.add('flash-green');
        setTimeout(() => {
            element.classList.remove('flash-green');
        }, 1500);
    }
}

// --- All your existing API functions remain the same, just using the dynamic PYTHON_API_BASE_URL ---

async function fetchOperators() {
    showLoading();
    try {
        const response = await fetch(`${NODE_API_BASE_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: CUSTOMER_DB_NAME,
                collectionName: 'users',
                query: { role: 'member' },
                projection: { 'username': 1, _id: 0 }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const operators = await response.json();
        populateOperatorDropdown(operator1Select, operators);
        populateOperatorDropdown(operator2Select, operators);
        showStatus('技能員リストをロードしました', 'success');
    } catch (error) {
        console.error('Error fetching operators:', error);
        showStatus(`技能員リストのロードに失敗しました: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function populateOperatorDropdown(selectElement, operators) {
    selectElement.innerHTML = '<option value="">選択または入力</option>';
    operators.forEach(operator => {
        const option = document.createElement('option');
        option.value = operator.username;
        option.textContent = operator.username;
        selectElement.appendChild(option);
    });
}

async function fetchProductDetails(hinban) {
    if (!hinban) {
        productNameInput.value = '';
        lhRhInput.value = '';
        return;
    }

    showLoading();
    try {
        const response = await fetch(`${NODE_API_BASE_URL}/queries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: CUSTOMER_DB_NAME,
                collectionName: 'masterDB',
                query: { 品番: hinban },
                projection: { '製品名': 1, 'LH/RH': 1, _id: 0 }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.length > 0) {
            const product = data[0];
            productNameInput.value = product['製品名'] || '';
            lhRhInput.value = product['LH/RH'] || '';
            flashInput(productNameInput);
            flashInput(lhRhInput);
            showStatus('製品詳細をロードしました', 'success');
        } else {
            productNameInput.value = '';
            lhRhInput.value = '';
            showStatus('指定された品番の製品が見つかりません', 'error');
        }
    } catch (error) {
        console.error('Error fetching product details:', error);
        showStatus(`製品詳細のロードに失敗しました: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// --- Python (Raspberry Pi) Interaction Functions (using dynamic URL) ---

async function sendHinbanToPython(hinban) {
    try {
        const response = await fetch(`${PYTHON_API_BASE_URL}/set-current-hinban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hinban: hinban })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Unknown error');
        }
        console.log("Python hinban set response:", result.message);
        showStatus(`Pythonに品番 (${hinban}) を設定しました。`, 'info');
    } catch (error) {
        console.error('Error sending hinban to Python:', error);
        showStatus(`Pythonに品番設定エラー: ${error.message}`, 'error');
    }
}

async function pollLiveCycleStats() {
    try {
        const response = await fetch(`${PYTHON_API_BASE_URL}/get-current-cycle-stats`);
        const data = await response.json();

        if (response.ok && data.status === 'success') {
            goodCountInput.value = data.quantity || 0;
            initialTimeDisplayInput.value = data.initial_time || '';
            finalTimeDisplayInput.value = data.final_time || '';
            averageCycleTimeInput.value = data.average_cycle_time || 0;
        } else {
            console.warn('Failed to get live cycle stats:', data.message);
        }
    } catch (error) {
        console.error('Network error during live stats polling from Python:', error);
    }
}

function startPollingLiveStats() {
    if (liveStatsPollingInterval) {
        clearInterval(liveStatsPollingInterval);
    }
    liveStatsPollingInterval = setInterval(pollLiveCycleStats, 1000);
    console.log("Started live stats polling from Python.");
}

function stopPollingLiveStats() {
    if (liveStatsPollingInterval) {
        clearInterval(liveStatsPollingInterval);
        liveStatsPollingInterval = null;
        console.log("Stopped live stats polling from Python.");
    }
}

async function getAllCycleLogsFromPython() {
    try {
        const response = await fetch(`${PYTHON_API_BASE_URL}/get-all-cycle-logs-for-submission`);
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'Unknown error');
        }
        return data.logs;
    } catch (error) {
        console.error('Error fetching logs from Python for submission:', error);
        showStatus(`Pythonログ取得エラー: ${error.message}`, 'error');
        throw error;
    }
}

async function resetPythonLogs() {
    try {
        const response = await fetch(`${PYTHON_API_BASE_URL}/reset-all-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Unknown error');
        }
        console.log("Python reset response:", result.message);
        showStatus('Python側のログがリセットされました。', 'info');
    } catch (error) {
        console.error('Error resetting Python logs:', error);
        showStatus(`Pythonログのリセットに失敗しました: ${error.message}`, 'error');
        throw error;
    }
}

// --- All your existing break time calculation and event listener code remains the same ---

function parseTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return hours * 60 + minutes;
        }
    }
    return null;
}

function calculateDuration(fromTimeStr, toTimeStr) {
    const fromMinutes = parseTime(fromTimeStr);
    const toMinutes = parseTime(toTimeStr);

    if (fromMinutes === null || toMinutes === null) {
        return 0;
    }

    let duration = toMinutes - fromMinutes;
    if (duration < 0) {
        console.warn(`休憩時間で終了時刻が開始時刻より前です (${fromTimeStr} - ${toTimeStr}). duration treated as 0.`);
        return 0;
    }
    return duration;
}

function calculateTotalBreakTime() {
    let totalMinutes = 0;
    for (const key in breakInputs) {
        if (breakInputs.hasOwnProperty(key)) {
            const fromValue = breakInputs[key].from.value;
            const toValue = breakInputs[key].to.value;
            totalMinutes += calculateDuration(fromValue, toValue);
        }
    }
    totalBreakTimeInput.value = totalMinutes;
}

function resetBreakRow(breakId) {
    if (breakInputs[breakId]) {
        breakInputs[breakId].from.value = '';
        breakInputs[breakId].to.value = '';
        calculateTotalBreakTime();
        showStatus(`${breakId.replace('break', '休憩')} の時間がリセットされました。`, 'info');
    }
}

// --- Enhanced Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date();
    const jstOffset = 9 * 60;
    const utc = today.getTime() + (today.getTimezoneOffset() * 60000);
    const jstDate = new Date(utc + (jstOffset * 60000));

    dateYear.value = jstDate.getFullYear();
    dateMonth.value = (jstDate.getMonth() + 1).toString().padStart(2, '0');
    dateDay.value = jstDate.getDate().toString().padStart(2, '0');

    // Initialize device discovery first
    await initializeDeviceDiscovery();
    
    // Then proceed with normal initialization
    fetchOperators();
    calculateTotalBreakTime();
    startPollingLiveStats();
});

// --- All your existing event listeners remain the same ---

document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleQrScan(qrBuffer.trim());
        qrBuffer = '';
    } else if (event.key.length === 1 || event.key === ' ') {
        qrBuffer += event.key;
    }
});

document.querySelectorAll('.qty-btn').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.dataset.target;
        const action = button.dataset.action;
        const targetInput = document.getElementById(targetId);

        if (targetId === 'goodCount' && action === 'plus') {
            return;
        }

        if (targetInput) {
            let currentValue = parseInt(targetInput.value) || 0;
            if (action === 'plus') {
                targetInput.value = currentValue + 1;
            } else if (action === 'minus' && currentValue > 0) {
                targetInput.value = currentValue - 1;
            }
        }
    });
});

hinbanInput.addEventListener('change', async (event) => {
    const hinbanValue = event.target.value;
    await fetchProductDetails(hinbanValue);
    await sendHinbanToPython(hinbanValue);
});

operator1Select.addEventListener('change', (event) => {
    if (event.target.value === '') {
        operator1CustomInput.classList.remove('hidden');
        operator1CustomInput.focus();
    } else {
        operator1CustomInput.classList.add('hidden');
        operator1CustomInput.value = '';
    }
});

operator2Select.addEventListener('change', (event) => {
    if (event.target.value === '') {
        operator2CustomInput.classList.remove('hidden');
        operator2CustomInput.focus();
    } else {
        operator2CustomInput.classList.add('hidden');
        operator2CustomInput.value = '';
    }
});

document.querySelectorAll('.time-input').forEach(input => {
    input.addEventListener('click', (event) => {
        event.target.value = getCurrentJSTTime();
        calculateTotalBreakTime();
    });
    input.addEventListener('change', calculateTotalBreakTime);
    input.addEventListener('input', calculateTotalBreakTime);
});

document.querySelectorAll('.reset-break-btn').forEach(button => {
    button.addEventListener('click', (event) => {
        const breakId = event.target.dataset.breakId;
        resetBreakRow(breakId);
    });
});

function handleQrScan(data) {
    const parts = data.split(':');
    if (parts.length < 2) {
        console.warn('Invalid QR format:', data);
        return;
    }

    const key = parts[0].trim().toLowerCase();
    const value = parts.slice(1).join(':').trim();

    console.log(`QR Scanned - Key: "${key}", Value: "${value}"`);

    switch (key) {
        case 'hinban':
            hinbanInput.value = value;
            hinbanInput.dispatchEvent(new Event('change'));
            flashInput(hinbanInput);
            showStatus(`QRスキャン: 品番 "${value}" が設定されました`, 'success');
            break;
        case 'name':
            if (!operator1Scanned) {
                operator1Select.value = value;
                operator1Scanned = true;
                flashInput(operator1Select);
                showStatus(`QRスキャン: 技能員① "${value}" が設定されました`, 'success');
            } else {
                operator2Select.value = value;
                flashInput(operator2Select);
                showStatus(`QRスキャン: 技能員② "${value}" が設定されました`, 'success');
            }
            break;
        default:
            console.warn('Unknown QR key:', key);
            showStatus(`未知のQRコード: ${key}`, 'error');
    }
}

// --- Data submission and form reset remain the same ---

submitDataBtn.addEventListener('click', async () => {
    showStatus('データ送信準備中...', 'info');
    showLoading();

    try {
        const formData = collectFormData();
        const pythonLogs = await getAllCycleLogsFromPython();

        if (pythonLogs.length > 0) {
            formData['開始時間'] = pythonLogs[0].initial_time;
            formData['終了時間'] = pythonLogs[pythonLogs.length - 1].final_time;

            const totalCycleTime = pythonLogs.reduce((sum, log) => sum + log.cycle_time, 0);
            formData['平均サイクル時間'] = pythonLogs.length > 0 ? (totalCycleTime / pythonLogs.length).toFixed(2) : 0;

            const cycleTimes = pythonLogs.map(log => log.cycle_time);
            formData['最速サイクルタイム'] = Math.min(...cycleTimes).toFixed(2);
            formData['最も遅いサイクルタイム'] = Math.max(...cycleTimes).toFixed(2);
        }

        const response = await fetch(`${NODE_API_BASE_URL}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dbName: CUSTOMER_DB_NAME,
                collectionName: 'production_data',
                document: formData
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        showStatus('データが正常に送信されました！', 'success');
        
        setTimeout(() => {
            resetForm();
        }, 2000);

    } catch (error) {
        console.error('Submission error:', error);
        showStatus(`送信エラー: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
});

resetAllBtn.addEventListener('click', async () => {
    if (confirm("全てのデータとPython側のログをリセットします。よろしいですか？")) {
        showLoading();
        try {
            await resetPythonLogs();
            resetForm();
            showStatus('全てのデータがリセットされました。', 'success');
        } catch (error) {
            showStatus('リセット中にエラーが発生しました。', 'error');
        } finally {
            hideLoading();
        }
    }
});

function collectFormData() {
    const operator1Value = operator1Select.value || operator1CustomInput.value;
    const operator2Value = operator2Select.value || operator2CustomInput.value;

    const data = {
        'タイムスタンプ': new Date().toISOString(),
        '日付（年）': parseInt(dateYear.value),
        '日付（月）': parseInt(dateMonth.value),
        '日付（日）': parseInt(dateDay.value),
        '製品名': productNameInput.value,
        '品番': hinbanInput.value,
        'LH/RH': lhRhInput.value,
        '技能員①': operator1Value,
        '技能員②': operator2Value,
        '良品数': parseInt(goodCountInput.value) || 0,
        '工数': parseInt(manHoursInput.value) || 0,
        '不良項目　素材不良': parseInt(defectInputs.materialDefect.value) || 0,
        '不良項目　ダブり': parseInt(defectInputs.doubleDefect.value) || 0,
        '不良項目　ハガレ': parseInt(defectInputs.peelingDefect.value) || 0,
        '不良項目　イブツ': parseInt(defectInputs.foreignMatterDefect.value) || 0,
        '不良項目　シワ': parseInt(defectInputs.wrinkleDefect.value) || 0,
        '不良項目　ヘンケイ': parseInt(defectInputs.deformationDefect.value) || 0,
        '不良項目　グリス付着': parseInt(defectInputs.greaseDefect.value) || 0,
        '不良項目　ビス不締まり': parseInt(defectInputs.screwLooseDefect.value) || 0,
        '不良項目　その他': parseInt(defectInputs.otherDefect.value) || 0,
        'その他説明': otherDescriptionTextarea.value,
        '不良項目　ショルダー': parseInt(defectInputs.shoulderDefect.value) || 0,
        '不良項目　シルバー': parseInt(defectInputs.silverDefect.value) || 0,
        '不良項目　ショルダー　キズ': parseInt(defectInputs.shoulderScratchDefect.value) || 0,
        '不良項目　ショルダー　その他': parseInt(defectInputs.shoulderOtherDefect.value) || 0,
        '開始時間': null,
        '終了時間': null,
        '休憩時間': parseInt(totalBreakTimeInput.value) || 0,
        '休憩1開始': breakInputs.break1.from.value,
        '休憩1終了': breakInputs.break1.to.value,
        '休憩2開始': breakInputs.break2.from.value,
        '休憩2終了': breakInputs.break2.to.value,
        '休憩3開始': breakInputs.break3.from.value,
        '休憩3終了': breakInputs.break3.to.value,
        '休憩4開始': breakInputs.break4.from.value,
        '休憩4終了': breakInputs.break4.to.value,
        '備考': remarksTextarea.value,
        '工数（除外工数）': parseInt(excludedManHoursInput.value) || 0,
        'アイドル時間': null,
        '平均サイクル時間': null,
        '最速サイクルタイム': null,
        '最も遅いサイクルタイム': null
    };
    return data;
}

function resetForm() {
    hinbanInput.value = '';
    productNameInput.value = '';
    lhRhInput.value = '';

    operator1Select.value = '';
    operator1CustomInput.value = '';
    operator1CustomInput.classList.add('hidden');
    operator2Select.value = '';
    operator2CustomInput.value = '';
    operator2CustomInput.classList.add('hidden');
    operator1Scanned = false;

    goodCountInput.value = '0';
    manHoursInput.value = '0';
    otherDescriptionTextarea.value = '';
    remarksTextarea.value = '';
    excludedManHoursInput.value = '0';

    initialTimeDisplayInput.value = '';
    finalTimeDisplayInput.value = '';
    averageCycleTimeInput.value = '';

    resetBreakRow('break1');
    resetBreakRow('break2');
    resetBreakRow('break3');
    resetBreakRow('break4');
    totalBreakTimeInput.value = '0';

    for (const key in defectInputs) {
        if (defectInputs.hasOwnProperty(key)) {
            defectInputs[key].value = '0';
        }
    }

    showStatus('フォームがリセットされました。', 'info');
}
