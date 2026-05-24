/**
 * Generate a secure JWT secret for production
 * 
 * Usage:
 *   node generate-jwt-secret.js
 * 
 * Copy the output and paste it as JWT_SECRET in your .env file
 */

const crypto = require('crypto');

console.log('\n========================================');
console.log('  JWT Secret Generator');
console.log('========================================\n');

// Generate a 64-byte random string
const secret = crypto.randomBytes(64).toString('hex');

console.log('Your new JWT secret:');
console.log('');
console.log(secret);
console.log('');
console.log('========================================');
console.log('');
console.log('Copy this value and paste it in your .env file:');
console.log('');
console.log(`JWT_SECRET=${secret}`);
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('  - Never commit this secret to version control');
console.log('  - Use a different secret for each environment');
console.log('  - Store securely in production');
console.log('');
console.log('========================================\n');
