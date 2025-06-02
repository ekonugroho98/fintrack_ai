import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';
import { saveTransactionToDB, updateEmbedding } from '../utils/db.js';
import { appendTransactionToSheet } from '../utils/sheets.js';

export default async function processVoice(data) {
  const { from, content, messageId, timestamp, mimetype, duration } = data;
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

  if (!user.enable_voice) {
    logger.warn(`Fitur voice tidak diizinkan untuk ${from}`);
    return;
  }

  try {
    logger.info(`Mengirim request ke AI service untuk user ${from}`);
    const result = await apiClient.processVoice(content, from);
    logger.info(`Hasil analisis voice dari ${from}:`, result);

    await redisClient.setLastTransaction(phoneNumber, {
      type: 'voice',
      raw: content,
      result,
      messageId,
      timestamp,
      mimetype,
      duration
    });

    try {
      const saved = await saveTransactionToDB({
        user_id: user.id,
        account_id: user.account_id,
        source: 'voice',
        data: result?.data || {}
      });
    
      logger.info({
        event: 'db_save_success',
        from,
        saved
      });

      // Insert to spreadsheet if available
      if (user?.account?.spreadsheet_id) {
        try {
          const sheetData = {
            date: result?.data?.date || new Date().toISOString(),
            type: result?.data?.type || 'expense',
            amount: Number(result?.data?.amount) || 0,
            category: result?.data?.category || 'Lainnya',
            description: result?.data?.description || '',
            notes: result?.data?.merchant || ''
          };
          
          await appendTransactionToSheet(user.account.spreadsheet_id, sheetData);
          logger.info({
            event: 'sheet_append_success',
            spreadsheet_id: user.account.spreadsheet_id,
            transaction_id: saved.id
          });
        } catch (sheetErr) {
          logger.error({ 
            event: 'sheet_append_error', 
            error: sheetErr.message,
            spreadsheet_id: user.account.spreadsheet_id,
            transaction_id: saved.id
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

      // Generate and update embedding
      if (saved.id && result?.data) {
        const embeddingContext = [
          `Deskripsi: ${result.data.description || ''}`,
          `Kategori: ${result.data.category || 'Lainnya'}`,
          `Nominal: ${result.data.amount || 0}`,
          `Tipe: ${result.data.type || 'expense'}`,
          `Merchant: ${result.data.merchant || '-'}`,
          `Tanggal: ${result.data.date || new Date().toISOString()}`
        ].join('\n');

        apiClient.generateEmbedding(embeddingContext)
          .then(async (embedding) => {
            return updateEmbedding(saved.id, embedding);
          })
          .catch(async (err) => {
            logger.warn({
              event: 'embedding_failed',
              id: saved.id,
              error: err.message
            });
            
            await redisClient.rPush('embedding:retry_queue', JSON.stringify({
              transactionId: saved.id,
              context: embeddingContext
            }));
          });
      }
    } catch (dbError) {
      logger.error({
        event: 'db_save_error',
        from,
        error: dbError.message,
        stack: dbError.stack,
        fallbackData: result?.data
      });
    
      await redisClient.publisher.rPush('failed:transactions', JSON.stringify({
        from: phoneNumber,
        source: 'voice',
        data: result?.data,
        timestamp: Date.now()
      }));
    }
    
    
    return result;
  } catch (err) {
      logger.error({
        event: 'voice_processing_error',
        from,
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
}
