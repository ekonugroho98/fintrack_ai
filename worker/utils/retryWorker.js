import redisClient from './redis.js';
import { saveTransactionToDB, getUserFromDB } from './db.js';
import { logger } from './logger.js';

export async function startRetryWorker(intervalMs = 60000) {
  setInterval(async () => {
    try {
      const length = await redisClient.publisher.lLen('failed:transactions');
      if (length === 0) return;

      logger.info(`🔁 Memproses ${length} transaksi gagal dari antrean`);

      for (let i = 0; i < length; i++) {
        const raw = await redisClient.publisher.lPop('failed:transactions');
        if (!raw) continue;

        let trx;
        try {
          trx = JSON.parse(raw);
        } catch (e) {
          logger.warn('❌ Format JSON invalid, diskip:', raw);
          continue;
        }

        try {
          // Ambil user dari DB berdasarkan phoneNumber (trx.from)
          let user;
          try {
            user = await getUserFromDB(trx.from);
          } catch (err) {
            logger.error({ event: 'retry_db_get_user_error', phoneNumber: trx.from, error: err.message });
            continue; // skip jika user tidak ditemukan
          }
          const inserted = await saveTransactionToDB({
            user_id: user.id,
            account_id: user.account_id,
            source: trx.source,
            data: trx.data
          });

          logger.info({
            event: 'retry_db_insert_success',
            from: trx.from,
            source: trx.source,
            inserted
          });
        } catch (dbError) {
          logger.error({
            event: 'retry_db_insert_failed',
            from: trx.from,
            error: dbError.message,
            stack: dbError.stack
          });

          // Push kembali ke antrean (optional, untuk durability)
          await redisClient.publisher.rPush('failed:transactions', JSON.stringify(trx));
        }
      }
    } catch (err) {
      logger.error({
        event: 'retry_worker_crash',
        error: err.message,
        stack: err.stack
      });
    }
  }, intervalMs);
}
