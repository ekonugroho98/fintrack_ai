import { isFeatureAllowed } from '../../utils/userConfig.js';
import { logger } from '../../utils/logger.js';
import apiClient from '../../utils/apiClient.js';
import { getUserFromDB, saveTransactionToDB, getTransactionsByUser } from '../../utils/db.js';
import redisClient from '../../utils/redis.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { MESSAGES } from '../utils/constants.js';

export async function handleTransaction(data) {
  const { from, text, messageId, timestamp } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');

  let user;
  try {
    user = await getUserFromDB(phoneNumber);
  } catch (err) {
    logger.error({
      event: 'db_get_user_error',
      phoneNumber,
      error: err.message
    });
    throw err;
  }

  if (!isFeatureAllowed(phoneNumber, 'text')) {
    logger.warn(`Fitur text tidak diizinkan untuk ${from}`);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, Anda tidak memiliki akses untuk fitur ini.'
    }));
    return;
  }

  // Handle intent detection
  try {
    // Tambahkan logging untuk debug
    logger.info({
      event: 'intent_detection_start',
      phoneNumber,
      text
    });

    const intentResult = await apiClient.detectIntent({
      text,
      phone_number: phoneNumber,
      messageId
    });

    logger.info({
      event: 'intent_detection_success',
      phoneNumber,
      result: intentResult
    });
    
    if (intentResult.intent.toLowerCase() === 'view_transaction') {
      return handleViewTransaction(user, from);
    }
    
    if (intentResult.intent.toLowerCase() === 'delete_transaction') {
      return handleDeleteTransaction(user, from);
    }

    if (intentResult.intent.toLowerCase() === 'add_transaction') {
      return processTransaction(data, user);
    }

    if ( intentResult.intent.toLowerCase() === 'konsultasi') {
        return handleConsultation(text, from);
      }
  } catch (error) {
    logger.error({
      event: 'intent_detection_error',
      phoneNumber,
      text,
      error: error.message,
      stack: error.stack
    });

    // Fallback ke pemrosesan transaksi biasa
    return processTransaction(data, user);
  }
}

// Fungsi fallback untuk memproses transaksi tanpa intent detection
async function processTransaction(data, user) {
  const { from, text, messageId, timestamp } = data;
  try {
    logger.info({ event: 'ai_service_request', text, from });
    const result = await apiClient.processText(text, from);
    logger.info({ event: 'ai_service_response', raw_response: result, text_input: text, from });

    if (result?.message?.includes('tidak terdeteksi')) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: result.message
      }));
      return;
    }

    const validatedResult = {
      date: result?.data?.date || new Date().toISOString(),
      category: result?.data?.category || 'Lainnya',
      amount: result?.data?.amount || 0,
      description: result?.data?.description || text,
      type: result?.data?.type || 'expense',
      merchant: result?.data?.merchant || null
    };

    await saveTransaction(user, validatedResult, { messageId, timestamp, from, text });
    
    const responseMessage = `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formatDate(validatedResult.date)}\n📋 Kategori: ${validatedResult.category}\n💰 Nominal: ${formatCurrency(validatedResult.amount)}\n📝 Keterangan: ${validatedResult.description}`;

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: responseMessage
    }));

    return validatedResult;
  } catch (error) {
    logger.error({
      event: 'transaction_processing_error',
      from,
      text,
      error: error.message
    });
    throw error;
  }
}

async function handleViewTransaction(user, from) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString();

  const records = await getTransactionsByUser({
    phoneNumber: user.phone_number,
    accountId: user.account_id,
    fromDate: startOfMonth,
    toDate: today
  });

  if (!records.length) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '📭 Tidak ada transaksi yang ditemukan bulan ini.'
    }));
    return;
  }

  const response = records.map((trx, i) =>
    `${i + 1}. ${trx.category} - ${formatCurrency(trx.amount)}\n📅 ${trx.date.split('T')[0]}\n📝 ${trx.description}`
  ).join('\n\n');

  await redisClient.publish('whatsapp-response', JSON.stringify({
    to: from,
    message: `📊 Riwayat Transaksi Bulan Ini:\n\n${response}`
  }));
}

async function handleDeleteTransaction(user, from) {
  const last = await redisClient.getLastTransaction(user.phone_number);
  if (!last) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '⚠️ Tidak ada transaksi sebelumnya yang bisa dihapus.'
    }));
    return;
  }

  const parsed = typeof last === 'string' ? JSON.parse(last) : last;

  try {
    await deleteTransactionByDetails({
      account_id: user.account_id,
      ...parsed.result
    });

    await redisClient.deleteLastTransaction(user.phone_number);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '🗑️ Transaksi terakhir berhasil dihapus.'
    }));
  } catch (err) {
    logger.error({ event: 'delete_transaction_failed', from, error: err.message, last });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Gagal menghapus transaksi terakhir.'
    }));
  }
}

async function handleConsultation(text, from) {
  const consultationResult = await apiClient.processConsultation({
    message: text,
    phone_number: from
  });

  await redisClient.publish('whatsapp-response', JSON.stringify({
    to: from,
    message: consultationResult.reply || 'Maaf, saya tidak bisa menjawab pertanyaan tersebut.'
  }));
}

async function saveTransaction(user, validatedResult, metadata) {
  await redisClient.setLastTransaction(user.phone_number, {
    type: 'text',
    raw: metadata.text,
    result: validatedResult,
    messageId: metadata.messageId,
    timestamp: metadata.timestamp
  });

  try {
    await saveTransactionToDB({
      user_id: user.id,
      account_id: user.account_id,
      source: 'text',
      data: validatedResult
    });
  } catch (dbError) {
    logger.error({
      event: 'db_save_error',
      from: metadata.from,
      error: dbError.message,
      stack: dbError.stack,
      fallbackData: validatedResult
    });

    await redisClient.publisher.rPush('failed:transactions', JSON.stringify({
      from: metadata.from,
      source: 'text',
      data: validatedResult,
      timestamp: Date.now()
    }));
  }
}
