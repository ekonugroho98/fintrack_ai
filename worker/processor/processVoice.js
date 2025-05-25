import { isFeatureAllowed } from '../utils/userConfig.js';
import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';

export default async function processVoice(data) {
  const { from, content, messageId, timestamp, mimetype, duration } = data;

  // Validasi izin fitur
  if (!isFeatureAllowed(from, 'voice')) {
    logger.warn(`Fitur voice tidak diizinkan untuk ${from}`);
    return;
  }

  try {
    logger.info(`Mengirim request ke AI service untuk user ${from}`);
    const result = await apiClient.processVoice(content, from);
    logger.info(`Hasil analisis voice dari ${from}:`, result);

    // Simpan transaksi terakhir ke Redis
    await redisClient.setLastTransaction(from, {
      type: 'voice',
      raw: content,
      result,
      messageId,
      timestamp,
      mimetype,
      duration
    });

    return result;
  } catch (err) {
    logger.error(`Gagal memproses voice dari ${from}:`, {
      error: err.message,
      stack: err.stack,
      duration: duration
    });
    throw err;
  }
}
