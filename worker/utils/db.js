import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase URL dan SERVICE_ROLE_KEY harus diatur di .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Tambahkan user baru ke database
 * @param {Object} user - Data user
 * @param {string} user.phone_number - Nomor WhatsApp user
 * @param {string} user.name - Nama user
 * @param {string} user.account_id - ID akun user (UUID)
 * @param {string} user.role - Peran user ('owner'|'editor'|'viewer')
 * @param {boolean} user.enable_text
 * @param {boolean} user.enable_image
 * @param {boolean} user.enable_voice
 * @param {boolean} user.can_view_summary
 * @param {boolean} user.can_add_transaction
 * @param {boolean} user.can_delete_transaction
 */
export async function addUserToDB({
  phone_number,
  name,
  account_id = null,
  role = 'editor',
  enable_text = true,
  enable_image = false,
  enable_voice = false,
  can_view_summary = true,
  can_add_transaction = true,
  can_delete_transaction = false
}) {
  const payload = {
    phone_number,
    name,
    account_id,
    role,
    enable_text,
    enable_image,
    enable_voice,
    can_view_summary,
    can_add_transaction,
    can_delete_transaction,
    created_at: new Date().toISOString()
  };

  logger.info({ event: 'db_add_user_attempt', payload });

  const { error, data } = await supabase
    .from('users')
    .insert([payload])
    .select();

  if (error) {
    logger.error({ event: 'db_add_user_error', error: error.message, payload });
    throw error;
  }

  logger.info({ event: 'db_add_user_success', data });
  return data[0]; // data[0].id adalah UUID user
}

/**
 * Update data user
 * @param {string} phoneNumber - Nomor WhatsApp user
 * @param {Object} updates - Data yang akan diupdate
 */
export async function updateUserInDB(phoneNumber, updates) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  logger.info({
    event: 'db_update_user_attempt',
    phoneNumber,
    payload
  });

  const { error, data: updated } = await supabase
    .from('users')
    .update(payload)
    .eq('phone_number', phoneNumber)
    .select();

  if (error) {
    logger.error({
      event: 'db_update_user_error',
      error: error.message,
      phoneNumber,
      payload
    });
    throw error;
  }

  logger.info({
    event: 'db_update_user_success',
    updated
  });

  return updated[0];
}

/**
 * Dapatkan data user berdasarkan nomor WhatsApp
 * @param {string} phoneNumber - Nomor WhatsApp user
 */
export async function getUserFromDB(phoneNumber) {
  const { error, data } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phoneNumber);

  logger.info({
    event: 'db_get_user_raw',
    phoneNumber,
    data,
    error
  });

  if (error) {
    logger.error({
      event: 'db_get_user_error',
      error: error.message,
      phoneNumber
    });
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error('No rows found for phoneNumber: ' + phoneNumber);
  }
  if (data.length > 1) {
    throw new Error('Multiple rows found for phoneNumber: ' + phoneNumber);
  }

  return data[0];
}

/**
 * Simpan transaksi ke database Supabase
 * @param {Object} trx - Objek transaksi
 * @param {string} trx.user_id - UUID user
 * @param {string} trx.account_id - UUID akun
 * @param {string} trx.source - 'text' | 'image' | 'voice'
 * @param {Object} trx.data - { category, amount, date, description, type, merchant }
 */
export async function saveTransactionToDB({ user_id, account_id, source, data }) {
  const payload = {
    user_id,
    account_id,
    transaction_date: data.date ? data.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    amount: data.amount || 0,
    type: data.type || 'expense',
    category: data.category || 'Lainnya',
    description: data.description || '',
    merchant: data.merchant || null,
    source: source,
    created_at: new Date().toISOString()
  };

  logger.info({
    event: 'db_insert_attempt',
    payload
  });

  const { error, data: inserted } = await supabase
    .from('transactions')
    .insert([payload])
    .select();

  if (error) {
    logger.error({
      event: 'db_insert_error',
      error: error.message,
      payload
    });
    throw error;
  }

  logger.info({
    event: 'db_insert_success',
    inserted
  });

  return inserted[0];
}

export async function createAccount(name) {
  const payload = {
    name,
    created_at: new Date().toISOString()
  };
  const { error, data } = await supabase
    .from('accounts')
    .insert([payload])
    .select();
  if (error) throw error;
  return data[0];
}

export async function getTransactionsByUser({ phoneNumber, accountId, fromDate, toDate }) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', phoneNumber)
    .eq('account_id', accountId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function deleteTransactionByDetails({ account_id, date, amount, description, category }) {
  const db = get_db(); // gunakan koneksi yang kamu gunakan di db.js

  const query = `
    DELETE FROM transactions
    WHERE account_id = $1
      AND date::date = $2::date
      AND amount = $3
      AND description = $4
      AND category = $5
    LIMIT 1;
  `;

  const values = [account_id, date, amount, description, category];

  const result = await db.query(query, values);
  if (result.rowCount === 0) {
    throw new Error('Tidak ada transaksi yang cocok untuk dihapus.');
  }

  return result;
}



export default supabase;
