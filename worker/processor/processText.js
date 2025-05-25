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

export default async function processText(data) {
  const { from, text, messageId, timestamp } = data;

  // Validasi izin fitur
  if (!isFeatureAllowed(from, 'text')) {
    logger.warn(`Fitur text tidak diizinkan untuk ${from}`);
    // Kirim pesan error ke gateway
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, Anda tidak memiliki akses untuk fitur ini.'
    }));
    return;
  }

  try {
    logger.info(`Mengirim request ke AI service untuk user ${from}`);
    const result = await apiClient.processText(text, from);
    
    // Log detail response dari AI service
    logger.info({
      event: 'ai_service_response',
      raw_response: result,
      text_input: text,
      from: from
    });

    // Jika response adalah konsultasi, panggil endpoint konsultasi
    if (result?.message?.includes('konsultasi')) {
      logger.info('Message is a consultation, processing with consultation endpoint');
      const consultationResult = await apiClient.processConsultation({
        message: text,  // Pass as object with message field
        phone_number: from
      });
      
      // Kirim response konsultasi ke user
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: consultationResult.reply || 'Maaf, saya tidak bisa menjawab pertanyaan tersebut.'
      }));
      return;
    }

    // Jika response adalah NONE, langsung kirim pesan NONE
    if (result?.message?.includes('tidak terdeteksi')) {
      logger.info('Message is not detected as transaction or consultation');
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: result.message
      }));
      return;
    }

    // Validasi dan berikan nilai default jika data tidak lengkap
    const validatedResult = {
      date: result?.data?.date || new Date().toISOString(),
      category: result?.data?.category || 'Lainnya',
      amount: result?.data?.amount || 0,
      description: result?.data?.description || text
    };

    // Log hasil validasi
    logger.info({
      event: 'validated_result',
      original: result,
      validated: validatedResult
    });

    // Simpan transaksi terakhir ke Redis
    await redisClient.setLastTransaction(from, {
      type: 'text',
      raw: text,
      result: validatedResult,
      messageId,
      timestamp
    });

    // Format pesan response
    const responseMessage = `✅ Transaksi dicatat!

📅 Tanggal: ${formatDate(validatedResult.date)}
📋 Kategori: ${validatedResult.category}
💰 Nominal: ${formatCurrency(validatedResult.amount)}
📝 Keterangan: ${validatedResult.description}`;

    // Log response message untuk debugging
    logger.info({
      event: 'formatted_response',
      message: responseMessage,
      validated_data: validatedResult
    });

    // Kirim hasil ke gateway
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: responseMessage
    }));

    return validatedResult;
  } catch (err) {
    logger.error(`Gagal memproses text dari ${from}:`, {
      error: err.message,
      stack: err.stack,
      content: text
    });
    
    // Kirim pesan error ke gateway
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, terjadi kesalahan saat memproses pesan Anda.'
    }));
    
    throw err;
  }
}
