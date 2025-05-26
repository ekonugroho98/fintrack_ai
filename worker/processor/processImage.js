import { isFeatureAllowed } from '../utils/userConfig.js';
import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';
import { saveTransactionToDB } from '../utils/db.js';

function formatCurrency(amount) {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) {
    return 'Rp0,00';
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount);
}

function formatDate(dateStr) {
  if (!dateStr) {
    dateStr = new Date().toISOString();
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    dateStr = new Date().toISOString();
  }
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatTransactionMessage(transaction) {
  return `${transaction.description}
📅 Tanggal: ${formatDate(transaction.date)}
📋 Kategori: ${transaction.category}
💰 Nominal: ${formatCurrency(transaction.amount)}
📝 Keterangan: ${transaction.description}`;
}

export default async function processImage(data) {
  const { from, content, caption, messageId, timestamp, mimetype } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');

  // Ambil user dari DB (harus dapat UUID user dan account_id)
  let user;
  try {
    user = await import('../utils/db.js').then(m => m.getUserFromDB(phoneNumber));
  } catch (err) {
    logger.error({ event: 'db_get_user_error', phoneNumber, error: err.message });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor Anda belum terdaftar. Silakan daftar dulu dengan DAFTAR#Nama.'
    }));
    return;
  }

  if (!isFeatureAllowed(phoneNumber, 'image')) {
    logger.warn(`Fitur image tidak diizinkan untuk ${from}`);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, Anda tidak memiliki akses untuk fitur ini.'
    }));
    return;
  }

  try {
    logger.info({
      event: 'sending_to_ai_service',
      from,
      contentLength: content?.length,
      caption
    });

    const result = await apiClient.processImage(content, caption, from);

    logger.info({
      event: 'ai_service_response',
      raw_response: result,
      caption: caption,
      from: from
    });

    const transactions = Array.isArray(result?.data) ? result.data : [result?.data];

    const validatedTransactions = transactions.map(transaction => ({
      date: transaction?.date || new Date().toISOString(),
      category: transaction?.category || 'Lainnya',
      amount: transaction?.amount || 0,
      description: transaction?.description || caption || 'Tidak ada deskripsi',
      type: transaction?.type || 'expense',
      merchant: transaction?.merchant || null
    }));

    logger.info({
      event: 'validated_transactions',
      original: result,
      validated: validatedTransactions
    });

    for (const transaction of validatedTransactions) {
      await redisClient.setLastTransaction(phoneNumber, {
        type: 'image',
        raw: content,
        caption,
        result: transaction,
        messageId,
        timestamp,
        mimetype
      });

      try {
        await saveTransactionToDB({
          user_id: user.id,
          account_id: user.account_id,
          source: 'image',
          data: transaction
        });
      } catch (dbError) {
        logger.error({
          event: 'db_save_error',
          from,
          error: dbError.message,
          stack: dbError.stack,
          fallbackData: transaction
        });
    
        await redisClient.publisher.rPush('failed:transactions', JSON.stringify({
          from: phoneNumber,
          source: 'image',
          data: transaction,
          timestamp: Date.now()
        }));
      }
    }

    const responseMessage = `✅ Transaksi dicatat!\n\n${validatedTransactions.map(formatTransactionMessage).join('\n\n')}`;

    logger.info({
      event: 'formatted_response',
      message: responseMessage,
      validated_transactions: validatedTransactions
    });

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: responseMessage
    }));

    return validatedTransactions;
  } catch (err) {
    logger.error({
      event: 'image_processing_error',
      from,
      error: err.message,
      stack: err.stack,
      caption,
      hasContent: !!content,
      contentLength: content?.length
    });

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, terjadi kesalahan saat memproses gambar Anda.'
    }));

    throw err;
  }
}
