import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { saveTransactionToDB, getUserFromDB } from '../utils/db.js';

function formatTransactionResponse(transaction) {
  const emoji = transaction.type === 'income' ? '💰' : '💸';
  const typeText = transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  
  let response = `✅ Transaksi berhasil dicatat!\n\n`;
  response += `${emoji} ${typeText}\n`;
  response += `📝 Deskripsi: ${transaction.description}\n`;
  response += `💵 Jumlah: Rp${transaction.amount.toLocaleString('id-ID')}\n`;
  
  if (transaction.category && transaction.category !== 'Lainnya') {
    response += `🏷️ Kategori: ${transaction.category}\n`;
  }
  
  if (transaction.merchant) {
    response += `🏪 Merchant: ${transaction.merchant}\n`;
  }
  
  return response;
}

export async function processTransaction(data, context) {
  const { from, text } = data;
  
  try {
    logger.info({
      event: 'transaction_processing_start',
      from,
      context
    });

    // Validate transaction data
    const validatedResult = {
      date: new Date().toISOString(),
      category: context.category || 'Lainnya',
      amount: context.amount || 0,
      description: context.description || text,
      type: context.transaction_type || 'expense',
      merchant: context.merchant || null
    };

    // Get user data
    const user = await getUserFromDB(from.replace('@s.whatsapp.net', ''));
    
    // Save transaction
    await saveTransactionToDB({
      user_id: user.id,
      account_id: user.account_id,
      source: 'text',
      data: validatedResult
    });

    logger.info({
      event: 'transaction_saved',
      from,
      transaction: validatedResult
    });

    // Format response
    const response = formatTransactionResponse(validatedResult);
    
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: response
    }));

  } catch (error) {
    logger.error({
      event: 'transaction_processing_error',
      from,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
} 