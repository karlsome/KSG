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

// Add click handlers for counter buttons
document.querySelectorAll('.counter-button').forEach((button, index) => {
  button.addEventListener('click', function() {
    const counterDisplay = this.previousElementSibling;
    const counterNumber = counterDisplay.querySelector('.counter-number');
    const currentCount = parseInt(counterNumber.textContent);
    counterNumber.textContent = currentCount + 1;
  });
});
