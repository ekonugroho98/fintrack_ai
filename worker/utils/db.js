import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import db from './db.js'; // jika file koneksi ada di lokasi yang sama

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase URL dan SERVICE_ROLE_KEY harus diatur di .env');
}

logger.info(`Connecting to Supabase at: ${SUPABASE_URL}`);

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
 * Dapatkan data account berdasarkan account_id
 * @param {string} accountId - UUID account
 */
export async function getAccountFromDB(accountId) {
  const { error, data } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error) {
    logger.error({
      event: 'db_get_account_error',
      accountId,
      error: error.message
    });
    throw error;
  }

  return data;
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

  const user = data[0];
  
  // Jika user memiliki account_id, ambil data account
  if (user.account_id) {
    try {
      const account = await getAccountFromDB(user.account_id);
      user.account = account;
    } catch (err) {
      logger.error({
        event: 'db_get_account_error',
        accountId: user.account_id,
        error: err.message
      });
      // Jangan throw error, biarkan user tetap bisa digunakan meski tanpa account
    }
  }

  return user;
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

export async function ensureCategoryExists(name, account_id, type = 'expense') {
  // 1. Cari kategori global
  let { data: categories, error } = await supabase
    .from('categories')
    .select('id')
    .eq('name', name)
    .eq('type', type)
    .limit(1);

  if (error) throw error;

  let categoryId;
  if (!categories || categories.length === 0) {
    // Insert kategori baru
    const { data: inserted, error: insertError } = await supabase
      .from('categories')
      .insert([{ name, type }])
      .select('id');
    if (insertError) throw insertError;
    categoryId = inserted[0].id;
  } else {
    categoryId = categories[0].id;
  }

  // 2. Cek relasi kategori ke account
  let { data: rel, error: relError } = await supabase
    .from('account_categories')
    .select('id')
    .eq('account_id', account_id)
    .eq('category_id', categoryId)
    .limit(1);

  if (relError) throw relError;

  if (!rel || rel.length === 0) {
    const { error: insertRelError } = await supabase
      .from('account_categories')
      .insert([{ account_id, category_id: categoryId }]);
    if (insertRelError) throw insertRelError;
  }

  return categoryId;
}

export async function updateEmbedding(transactionId, embedding) {
  logger.info({
    event: 'db_update_embedding_attempt',
    transactionId,
    embeddingLength: embedding?.length
  });

  const { error, data } = await supabase
    .from('transactions')
    .update({ embedding })
    .eq('id', transactionId)
    .select();

  if (error) {
    logger.error({
      event: 'db_update_embedding_error',
      transactionId,
      error: error.message
    });
    throw error;
  }

  logger.info({
    event: 'db_update_embedding_success',
    transactionId
  });

  return data[0];
}

export async function getCategoriesFromDB(account_id, type = 'expense') {
  try {
    // Coba ambil kategori dari account_categories dulu
    let { data: categories, error } = await supabase
      .from('categories')
      .select(`
        name,
        account_categories!inner (
          account_id
        )
      `)
      .eq('account_categories.account_id', account_id)
      .order('name');

    // Jika tidak ada kategori di account_categories, ambil semua kategori
    if (!categories || categories.length === 0) {
      logger.info({
        event: 'no_account_categories',
        account_id,
        message: 'No categories found in account_categories, fetching all categories'
      });

      const { data: allCategories, error: allError } = await supabase
        .from('categories')
        .select('name')
        .order('name');

      if (allError) {
        logger.error({
          event: 'get_all_categories_error',
          account_id,
          error: allError.message
        });
        throw allError;
      }

      categories = allCategories;
    }

    if (error) {
      logger.error({
        event: 'get_categories_query_error',
        account_id,
        error: error.message
      });
      throw error;
    }

    logger.info({
      event: 'get_categories_success',
      account_id,
      categories_count: categories?.length,
      categories: categories
    });

    return categories.map(cat => cat.name);
  } catch (err) {
    logger.error({
      event: 'get_categories_error',
      account_id,
      error: err.message
    });
    return ['Lainnya']; // Return default category if error
  }
}

export default supabase;
