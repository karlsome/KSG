// Reset functions for each card
function resetBasicSettings() {
  if (confirm('基本設定をリセットしますか？')) {
    document.getElementById('lhRh').value = 'LH';
    document.getElementById('inspector').selectedIndex = 0;
    document.getElementById('poster1').selectedIndex = 0;
    document.getElementById('poster2').selectedIndex = 0;
    document.getElementById('workTime').value = '00:00';
    document.getElementById('manHours').value = '';
    document.getElementById('startTime').value = '';
    document.getElementById('stopTime').value = '00:00';
    document.getElementById('endTime').value = '';
    document.getElementById('inspectionCount').value = '0';
    console.log('Basic settings reset');
  }
}

function resetButtonData() {
  if (confirm('ボタンデータをリセットしますか？')) {
    // Reset any button-related data if needed
    console.log('Button data reset');
  }
}

function resetDefectCounters() {
  if (confirm('不良カウンターをリセットしますか？')) {
    document.querySelectorAll('.counter-number').forEach(counter => {
      counter.textContent = '0';
    });
    document.getElementById('otherDetails').value = '';
    console.log('Defect counters reset');
  }
}

// Placeholder functions for buttons
function sendData() {
  console.log('Send data clicked');
}

function setWorkStartTime() {
  console.log('Work start time clicked');
}

function pauseWork() {
  console.log('Pause work clicked');
}

function setWorkStopTime() {
  console.log('Work stop time clicked');
}

function setWorkEndTime() {
  console.log('Work end time clicked');
}

function addInspectionCount() {
  console.log('Add inspection count clicked');
}

function completeInspection() {
  console.log('Complete inspection clicked');
}

function sendInspectionData() {
  console.log('Send inspection data clicked');
}

function editRemarks() {
  console.log('Edit remarks clicked');
}

function viewInspectionList() {
  console.log('View inspection list clicked');
}

// Add click handlers for counter buttons (increment)
document.querySelectorAll('.counter-button').forEach((button, index) => {
  button.addEventListener('click', function() {
    const counterDisplay = this.previousElementSibling;
    const counterNumber = counterDisplay.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    counterNumber.textContent = currentCount + 1;
  });
});

// Add click handlers for counter displays (decrement)
document.querySelectorAll('.counter-display').forEach((display, index) => {
  display.addEventListener('click', function() {
    const counterNumber = this.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    if (currentCount > 0) {
      counterNumber.textContent = currentCount - 1;
    }
  });
});
