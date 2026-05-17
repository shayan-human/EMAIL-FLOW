const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY = process.env.ENCRYPTION_KEY || 'development_key_change_me_32_chars_!!';

const getEncryptionKey = () => {
    return crypto.createHash('sha256').update(KEY).digest();
};

/**
 * Encrypts cleartext into a format: [iv]:[authTag]:[encryptedText]
 */
function encrypt(text) {
    if (!text) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text in format: [iv]:[authTag]:[encryptedText]
 */
function decrypt(text) {
    if (!text || !text.includes(':')) return text;

    const parts = text.split(':');
    if (parts.length !== 3) return text; // Probably not encrypted

    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

module.exports = { encrypt, decrypt };
