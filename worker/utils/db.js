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
 * Simpan transaksi ke database Supabase
 * @param {Object} trx - Objek transaksi
 * @param {string} trx.phoneNumber - Nomor pengguna
 * @param {string} trx.source - 'text' | 'image' | 'voice'
 * @param {Object} trx.data - { category, amount, date, description }
 */
export async function saveTransactionToDB({ phoneNumber, source, data }) {
  const payload = {
    user_id: phoneNumber,
    category: data.category || 'Lainnya',
    amount: data.amount || 0,
    description: data.description || '',
    date: data.date || new Date().toISOString(),
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

export default supabase;
