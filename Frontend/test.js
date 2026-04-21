const https = require('https');

const req = https.request('https://categorizr.com/emailserver/api/userpaymentmethod/getPaymentMethodv1', {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.end();
