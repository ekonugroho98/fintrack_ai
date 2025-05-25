import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const configPath = path.resolve('config/user_config.json');

let userConfig = {};

// Load config saat startup
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  userConfig = JSON.parse(raw);
  logger.info('User config loaded successfully');
} catch (err) {
  logger.error('Failed to load user config:', err.message);
}

/**
 * Cek apakah user dengan nomor tertentu diizinkan menggunakan fitur
 * @param {string} phoneNumber - Nomor telepon seperti '6281234567890'
 * @param {string} feature - Misalnya: 'text', 'image', 'voice'
 * @returns {boolean}
 */
export function isFeatureAllowed(phoneNumber, feature) {
  // Hapus karakter '+' jika ada
  phoneNumber = phoneNumber.replace('+', '');
  
  // Hapus suffix @s.whatsapp.net jika ada
  phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
  
  // Cek di konfigurasi user
  const user = userConfig.users?.[phoneNumber];
  if (!user) {
    logger.warn(`User ${phoneNumber} not found in config`);
    return false;
  }

  // Cek fitur yang diizinkan
  const allowed = user.features?.includes(feature);
  logger.info(`User ${phoneNumber} ${allowed ? 'allowed' : 'not allowed'} to use ${feature}`);
  return allowed;
}
