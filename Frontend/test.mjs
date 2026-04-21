fetch('https://categorizr.com/emailserver/api/userpaymentmethod/getPaymentMethodv1', {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
  }
}).then(async (res) => {
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}).catch((e) => {
  console.error('Error:', e);
});
