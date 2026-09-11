const params = new URLSearchParams(window.location.search);
const reference = params.get('reference') || params.get('trxref');
const state = document.getElementById('successState');

const formatCurrency = (amount) => `₦${Number(amount || 0).toLocaleString()}`;

const showSuccess = (payload) => {
  state.innerHTML = `
    <h2>Payment Successful ✓</h2>
    <p>SWE Final Year Picnic</p>
    <div class="result-summary">
      <div class="result-row"><span>Name:</span><strong>${payload.name}</strong></div>
      <div class="result-row"><span>Registration Number:</span><strong>${payload.registrationNumber}</strong></div>
      <div class="result-row"><span>Amount Paid:</span><strong>${formatCurrency(payload.amountPaid)}</strong></div>
      <div class="result-row"><span>Payment Reference:</span><strong>${payload.paymentReference}</strong></div>
    </div>
  `;
  state.classList.remove('hidden');
};

const showPending = (message = 'Your payment is still being processed by Paystack. Please wait a moment and we will check again automatically.') => {
  state.innerHTML = `
    <h2>Payment pending.</h2>
    <p>${message}</p>
    <p>Your transaction reference: <strong>${reference}</strong></p>
    <a href="/" class="primary-btn" style="display:inline-block;text-decoration:none;">Back Home</a>
  `;
  state.classList.remove('hidden');
};

const showFailure = (message = 'No payment has been recorded for your registration number.') => {
  state.innerHTML = `
    <h2>Payment was not completed.</h2>
    <p>${message}</p>
    <a href="/" class="primary-btn" style="display:inline-block;text-decoration:none;">Try Again</a>
  `;
  state.classList.remove('hidden');
};

const verify = async (retryCount = 0) => {
  if (!reference) {
    showFailure('No payment reference was provided.');
    return;
  }

  try {
    const response = await fetch(`/api/payments/verify/${encodeURIComponent(reference)}`);
    const result = await response.json();

    if (result && result.status === 'pending') {
      showPending(result.message || 'Your payment is still being processed by Paystack. Please wait a moment and we will check again automatically.');

      if (retryCount < 3) {
        setTimeout(() => verify(retryCount + 1), 5000);
      }
      return;
    }

    if (!response.ok || !result.success) {
      showFailure(result.message || 'Verification failed.');
      return;
    }

    showSuccess(result.student);
  } catch (error) {
    showFailure('Unable to verify your payment right now.');
  }
};

verify();
