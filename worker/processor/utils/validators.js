import { VALIDATION } from './constants.js';
import { ValidationError } from './errors.js';

export function validatePhoneNumber(phone) {
  if (!VALIDATION.PHONE_REGEX.test(phone)) {
    throw new ValidationError('Format nomor telepon tidak valid');
  }
  return true;
}

export function validateName(name) {
  if (name.length < VALIDATION.NAME_MIN_LENGTH || name.length > VALIDATION.NAME_MAX_LENGTH) {
    throw new ValidationError('Nama harus antara 3-50 karakter');
  }
  return true;
}
