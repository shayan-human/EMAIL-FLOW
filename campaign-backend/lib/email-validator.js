const dns = require('dns').promises;

// List of common disposable email providers
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'temp-mail.org', 
  'dispostable.com', 'getnada.com', 'yopmail.com', 'trashmail.com'
]);

// List of common public/personal email providers
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 
  'aol.com', 'zoho.com', 'protonmail.com', 'mail.com', 'gmx.com'
]);

/**
 * Validates an email address for format, disposability, business vs personal, and DNS MX records.
 */
async function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid type', type: 'INVALID' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  
  // 1. Format Validation (Strict Regex)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, reason: 'Invalid format', type: 'INVALID' };
  }

  const [localPart, domain] = trimmedEmail.split('@');

  // 2. Disposable Email Check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Disposable email provider', type: 'DISPOSABLE' };
  }

  // 3. Business vs Personal Detection
  const isBusiness = !PUBLIC_DOMAINS.has(domain);
  const emailType = isBusiness ? 'BUSINESS' : 'PERSONAL';

  // 4. DNS MX Record Check
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'No MX records found for domain', type: 'UNAVAILABLE' };
    }
  } catch (error) {
    return { valid: false, reason: `DNS check failed: ${error.message}`, type: 'UNAVAILABLE' };
  }

  return {
    valid: true,
    reason: null,
    type: emailType,
    domain: domain
  };
}

module.exports = { validateEmail };
