const eventDate = '2026-09-30T23:59:59';
const eventVenue = 'To Be Announced';
const feeAmount = 10000;

const countdownEls = {
  days: document.getElementById('days'),
  hours: document.getElementById('hours'),
  minutes: document.getElementById('minutes'),
  seconds: document.getElementById('seconds'),
};

const verifyForm = document.getElementById('verifyForm');
const registrationInput = document.getElementById('registrationNumber');
const verifyButton = document.getElementById('verifyButton');
const messageBox = document.getElementById('msgBox');
const studentResult = document.getElementById('studentResult');

const setMessage = (text, type = 'info') => {
  messageBox.textContent = text;
  messageBox.className = `message-box ${type}`;
  messageBox.classList.remove('hidden');
};

const hideMessage = () => {
  messageBox.classList.add('hidden');
};

const updateCountdown = () => {
  const target = new Date(eventDate).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    countdownEls.days.textContent = '00';
    countdownEls.hours.textContent = '00';
    countdownEls.minutes.textContent = '00';
    countdownEls.seconds.textContent = '00';
    document.getElementById('countdown').innerHTML = '<div class="closed-message">PAYMENT CLOSED</div>';
    verifyButton.disabled = true;
    registrationInput.disabled = true;
    setMessage('PAYMENT CLOSED', 'info');
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  countdownEls.days.textContent = String(days).padStart(2, '0');
  countdownEls.hours.textContent = String(hours).padStart(2, '0');
  countdownEls.minutes.textContent = String(minutes).padStart(2, '0');
  countdownEls.seconds.textContent = String(seconds).padStart(2, '0');
};

setInterval(updateCountdown, 1000);
updateCountdown();

document.getElementById('event-date').textContent = new Date(eventDate).toISOString().split('T')[0];
document.getElementById('event-venue').textContent = eventVenue;
document.getElementById('fee-amount').textContent = `₦${feeAmount.toLocaleString()}`;

const renderVerifiedStudent = (student, alreadyPaid = false) => {
  if (alreadyPaid) {
    studentResult.innerHTML = `
      <h3>Payment Already Completed ✓</h3>
      <div class="detail-row"><span class="label">Name:</span><span>${student.name}</span></div>
      <div class="detail-row"><span class="label">Registration Number:</span><span>${student.registrationNumber}</span></div>
      <div class="detail-row"><span class="label">Status:</span><span>PAID</span></div>
      <div class="detail-row"><span class="label">Status:</span><span>You have already paid for the SWE Final Year Picnic.</span></div>
    `;
    return;
  }

  studentResult.innerHTML = `
    <h3>Student Verified ✓</h3>
    <div class="detail-row"><span class="label">Name:</span><span>${student.name}</span></div>
    <div class="detail-row"><span class="label">Registration Number:</span><span>${student.registrationNumber}</span></div>
    <div class="detail-row"><span class="label">Picnic Fee:</span><span>₦${feeAmount.toLocaleString()}</span></div>
    <button type="button" id="payButton" class="primary-btn">Proceed to Payment</button>
  `;

  document.getElementById('payButton').addEventListener('click', async () => {
    const registrationNumber = registrationInput.value.trim();
    verifyButton.disabled = true;
    const payButton = document.getElementById('payButton');
    payButton.disabled = true;
    payButton.textContent = 'Preparing payment...';
    setMessage('Preparing payment...', 'info');

    try {
      const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationNumber }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to initialize payment.');
      }

      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      }
    } catch (error) {
      setMessage(error.message || 'Payment initialization failed.', 'error');
      payButton.disabled = false;
      payButton.textContent = 'Proceed to Payment';
      verifyButton.disabled = false;
    }
  });
};

verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const registrationNumber = registrationInput.value.trim();

  if (!registrationNumber) {
    setMessage('Please enter your registration number.', 'error');
    return;
  }

  verifyButton.disabled = true;
  verifyButton.textContent = 'Verifying...';
  hideMessage();
  studentResult.classList.add('hidden');

  try {
    const response = await fetch('/api/students/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Registration verification failed.');
    }

    if (result.alreadyPaid) {
      setMessage('Payment Already Completed ✓', 'success');
      renderVerifiedStudent(result.student, true);
      studentResult.classList.remove('hidden');
      return;
    }

    renderVerifiedStudent(result.student, false);
    studentResult.classList.remove('hidden');
    setMessage('Student Verified ✓', 'success');
  } catch (error) {
    setMessage(error.message || 'Verification failed.', 'error');
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = 'Verify Registration';
    registrationInput.focus();
  }
});
