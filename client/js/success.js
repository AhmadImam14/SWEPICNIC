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

const showFailure = (message) => {
  state.innerHTML = `
    <h2>Payment was not completed.</h2>
    <p>No payment has been recorded for your registration number.</p>
    <a href="/" class="primary-btn" style="display:inline-block;text-decoration:none;">Try Again</a>
  `;
  state.classList.remove('hidden');
};

const verify = async () => {
  if (!reference) {
    showFailure('No payment reference was provided.');
    return;
  }

  try {
    const response = await fetch(`/api/payments/verify/${encodeURIComponent(reference)}`);
    const result = await response.json();

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
