import { logger } from '../../utils/logger.js';
import apiClient from '../../utils/apiClient.js';
import { getUserFromDB, saveTransactionToDB, getTransactionsByUser, updateEmbedding, getCategoriesFromDB } from '../../utils/db.js';
import redisClient from '../../utils/redis.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { appendTransactionToSheet } from '../../utils/sheets.js';

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

  if (!user.enable_text) {
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
    logger.info({ 
      event: 'processing_transaction',
      user: {
        id: user?.id,
        account_id: user?.account_id,
        has_account: !!user?.account,
        has_spreadsheet: !!user?.account?.spreadsheet_id
      },
      text,
      from 
    });
    
    // Get categories from database
    const categories = await getCategoriesFromDB(user.account_id);
    logger.info({
      event: 'got_categories',
      categories,
      account_id: user.account_id
    });
    
    logger.info({ event: 'ai_service_request', text, from });
    const result = await apiClient.processTextWithCategories(text, from, categories);
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

    const savedTransaction = await saveTransaction(user, validatedResult, { messageId, timestamp, from, text });

    console.log('user', user);
    console.log('account data:', user?.account);
    
    if (user?.account?.spreadsheet_id) {
        try {
          // Format data sesuai dengan yang diharapkan oleh sheets.js
          const sheetData = {
            date: validatedResult.date,
            type: validatedResult.type,
            amount: validatedResult.amount,
            category: validatedResult.category,
            description: validatedResult.description,
            notes: validatedResult.merchant || ''
          };
          
          await appendTransactionToSheet(user.account.spreadsheet_id, sheetData);
          logger.info({
            event: 'sheet_append_success',
            spreadsheet_id: user.account.spreadsheet_id,
            transaction_id: savedTransaction.id
          });
        } catch (sheetErr) {
          logger.error({ 
            event: 'sheet_append_error', 
            error: sheetErr.message,
            spreadsheet_id: user.account.spreadsheet_id,
            transaction_id: savedTransaction.id
          });
        }
    } else {
        logger.warn({
            event: 'no_spreadsheet_id',
            user_id: user.id,
            account_id: user.account_id,
            has_account: !!user?.account
        });
    }
        
    const responseMessage = `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formatDate(validatedResult.date)}\n📋 Kategori: ${validatedResult.category}\n💰 Nominal: ${formatCurrency(validatedResult.amount)}\n📝 Keterangan: ${validatedResult.description}`;

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: responseMessage
    }));

    const embeddingContext = [
      `Deskripsi: ${validatedResult.description}`,
      `Kategori: ${validatedResult.category}`,
      `Nominal: ${validatedResult.amount}`,
      `Tipe: ${validatedResult.type}`,
      `Merchant: ${validatedResult.merchant || '-'}`,
      `Tanggal: ${validatedResult.date}`
    ].join('\n');

    apiClient.generateEmbedding(embeddingContext)
      .then(async (embedding) => {
        return updateEmbedding(savedTransaction.id, embedding);
      })
      .catch(async (err) => {
        logger.warn({
          event: 'embedding_failed',
          id: savedTransaction.id,
          error: err.message
        });

        await redisClient.publisher.rPush('embedding:retry_queue', JSON.stringify({
          transactionId: savedTransaction.id,
          context: embeddingContext
        }));
      });

    return savedTransaction;
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
    const savedTransaction = await saveTransactionToDB({
      user_id: user.id,
      account_id: user.account_id,
      source: 'text',
      data: validatedResult
    });
    return savedTransaction;
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
