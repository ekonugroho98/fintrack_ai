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
 * Cek apakah nomor adalah nomor testing
 * @param {string} phoneNumber - Nomor telepon seperti '6281234567890'
 * @returns {boolean}
 */
export function isTestNumber(phoneNumber) {
  // Hapus karakter '+' jika ada
  phoneNumber = phoneNumber.replace('+', '');
  
  // Hapus suffix @s.whatsapp.net jika ada
  phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
  
  // Cek apakah nomor ada di daftar test numbers
  const isTest = userConfig.test_numbers?.includes(phoneNumber);
  logger.info(`Number ${phoneNumber} ${isTest ? 'is' : 'is not'} a test number`);
  return isTest;
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

/**
 * Cek apakah nomor diizinkan untuk mendaftarkan user baru
 * @param {string} phoneNumber - Nomor telepon seperti '6281234567890'
 * @returns {boolean}
 */
export function isRegistrationAllowed(phoneNumber) {
  // Hapus karakter '+' jika ada
  phoneNumber = phoneNumber.replace('+', '');
  
  // Hapus suffix @s.whatsapp.net jika ada
  phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
  
  // Cek apakah nomor ada di daftar yang diizinkan
  const allowed = userConfig.allowed_numbers?.includes(phoneNumber);
  logger.info(`User ${phoneNumber} ${allowed ? 'allowed' : 'not allowed'} to register users`);
  return allowed;
}
