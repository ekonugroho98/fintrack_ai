import { isFeatureAllowed } from '../utils/userConfig.js';
import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';

function formatCurrency(amount) {
  // Pastikan amount adalah angka
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
  // Jika dateStr tidak valid, gunakan tanggal hari ini
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

  // Log received data
  logger.info({
    event: 'received_image_data',
    from,
    hasContent: !!content,
    contentLength: content?.length,
    caption,
    messageId,
    timestamp,
    mimetype
  });

  // Validasi izin fitur
  if (!isFeatureAllowed(from, 'image')) {
    logger.warn(`Fitur image tidak diizinkan untuk ${from}`);
    // Kirim pesan error ke gateway
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
    
    // Log detail response dari AI service
    logger.info({
      event: 'ai_service_response',
      raw_response: result,
      caption: caption,
      from: from
    });

    // Handle both single transaction and array of transactions
    const transactions = Array.isArray(result?.data) ? result.data : [result?.data];

    // Validate and format each transaction
    const validatedTransactions = transactions.map(transaction => ({
      date: transaction?.date || new Date().toISOString(),
      category: transaction?.category || 'Lainnya',
      amount: transaction?.amount || 0,
      description: transaction?.description || caption || 'Tidak ada deskripsi'
    }));

    // Log hasil validasi
    logger.info({
      event: 'validated_transactions',
      original: result,
      validated: validatedTransactions
    });

    // Simpan setiap transaksi ke Redis
    for (const transaction of validatedTransactions) {
      await redisClient.setLastTransaction(from, {
        type: 'image',
        raw: content,
        caption,
        result: transaction,
        messageId,
        timestamp,
        mimetype
      });
    }

    // Format pesan response untuk multiple transactions
    const responseMessage = `✅ Transaksi dicatat!\n\n${validatedTransactions.map(formatTransactionMessage).join('\n\n')}`;

    // Log response message untuk debugging
    logger.info({
      event: 'formatted_response',
      message: responseMessage,
      validated_transactions: validatedTransactions
    });

    // Kirim hasil ke gateway
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
    
    // Kirim pesan error ke gateway
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, terjadi kesalahan saat memproses gambar Anda.'
    }));
    
    throw err;
  }
}
