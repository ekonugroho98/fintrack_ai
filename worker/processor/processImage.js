import { isFeatureAllowed } from '../utils/userConfig.js';
import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';
import { saveTransactionToDB, updateEmbedding } from '../utils/db.js';
import { appendTransactionToSheet } from '../utils/sheets.js';

// Add delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    // Get categories from database
    const categories = user.account?.categories || [];
    const categoryNames = categories.map(cat => cat.name);

    // Process image with categories
    const result = await apiClient.processImageWithCategories(content, categoryNames, phoneNumber);
    if (!result.data) {
      throw new Error('Failed to process image');
    }

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
      amount: Number(transaction?.amount) || 0,
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
        const savedTransaction = await saveTransactionToDB({
          user_id: user.id,
          account_id: user.account_id,
          source: 'image',
          data: transaction
        });
        
        console.log('savedTransaction', savedTransaction);
        
        // Insert to spreadsheet if available
        if (user?.account?.spreadsheet_id) {
          try {
            const sheetData = {
              date: transaction.date,
              type: transaction.type,
              amount: Number(transaction.amount) || 0,
              category: transaction.category,
              description: transaction.description,
              notes: 'From image'
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

        // Generate embedding
        try {
          // Add delay before generating embedding
          await delay(1000); // 1 second delay
          
          const embeddingContext = `Deskripsi: ${transaction.description}\nKategori: ${transaction.category}\nNominal: ${transaction.amount}\nTipe: ${transaction.type}\nMerchant: ${transaction.merchant || 'Tidak ada'}\nTanggal: ${transaction.date}`;
          const embedding = await apiClient.generateEmbedding(embeddingContext);
          console.log('embedding', embedding);
          if (embedding) {
            await updateEmbedding(savedTransaction.id, embedding);
          }
        } catch (embeddingError) {
          logger.error({
            event: "embedding_failed",
            id: savedTransaction.id,
            error: embeddingError.message
          });
          
          // Add to retry queue without crashing
          try {
            await redisClient.lPush('embedding:retry_queue', JSON.stringify({
              id: savedTransaction.id,
              context: `Deskripsi: ${transaction.description}\nKategori: ${transaction.category}\nNominal: ${transaction.amount}\nTipe: ${transaction.type}\nMerchant: ${transaction.merchant || 'Tidak ada'}\nTanggal: ${transaction.date}`,
              retryCount: 0,
              lastError: embeddingError.message
            }));
          } catch (redisError) {
            logger.error({
              event: "redis_retry_queue_failed",
              id: savedTransaction.id,
              error: redisError.message
            });
            // Continue processing even if redis fails
          }
        }
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
