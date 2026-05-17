const crypto = require('crypto');

function maskEmail(email) {
  if (!email) return '[unknown]';
  if (process.env.NODE_ENV === 'development') return email;
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 8) + '***';
}

module.exports = { maskEmail };
