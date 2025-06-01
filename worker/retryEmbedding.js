import redisClient from './utils/redis.js';
import apiClient from './utils/apiClient.js';
import { updateEmbedding } from './utils/db.js';
import { logger } from './utils/logger.js';

async function processRetryQueue() {
  while (true) {
    const item = await redisClient.lPop('embedding:retry_queue');
    if (!item) break;

    const { transactionId, description } = JSON.parse(item);

    try {
      const embedding = await apiClient.generateEmbedding(description);
      await updateEmbedding(transactionId, embedding);
      logger.info({ event: 'embedding_retry_success', transactionId });
    } catch (err) {
      logger.error({
        event: 'embedding_retry_failed',
        transactionId,
        error: err.message
      });

      // Kembalikan ke queue untuk retry berikutnya
      await redisClient.rPush('embedding:retry_queue', item);
    }
  }
}

processRetryQueue().then(() => {
  logger.info('Retry embedding process finished.');
  process.exit(0);
});
