import { logger } from '../utils/logger.js';
import { getUserFromDB } from '../utils/db.js';
import redisClient from '../utils/redis.js';

export async function processReportQuery(data) {
  const { from, text, messageId, timestamp } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');

  try {
    // Get user data
    const user = await getUserFromDB(phoneNumber);
    
    // Check if user has permission to view reports
    if (!user.can_view_summary) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Maaf, Anda tidak memiliki akses untuk melihat laporan keuangan.'
      }));
      return;
    }

    // Extract date range from query
    const dateRange = extractDateRange(text);
    if (!dateRange) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Mohon tentukan periode waktu yang ingin dilihat (hari ini, minggu ini, bulan ini, atau bulan tertentu).'
      }));
      return;
    }

    // Get transactions from database
    const transactions = await getTransactions(user.account_id, dateRange);
    
    // Process based on query type
    if (text.toLowerCase().includes('total pengeluaran')) {
      await handleTotalExpense(from, transactions, dateRange);
    } else if (text.toLowerCase().includes('pengeluaran terbesar')) {
      await handleLargestExpense(from, transactions, dateRange);
    } else if (text.toLowerCase().includes('tampilkan semua transaksi')) {
      await handleAllTransactions(from, transactions, dateRange);
    } else {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Maaf, saya tidak mengerti permintaan laporan Anda. Silakan coba dengan format yang berbeda.'
      }));
    }

  } catch (error) {
    logger.error({
      event: 'report_processing_error',
      from,
      error: error.message,
      stack: error.stack
    });

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, terjadi kesalahan saat memproses laporan. Mohon coba lagi nanti.'
    }));
  }
}

function extractDateRange(text) {
  const now = new Date();
  const lowerText = text.toLowerCase();

  if (lowerText.includes('hari ini')) {
    const start = new Date(now.setHours(0, 0, 0, 0));
    const end = new Date(now.setHours(23, 59, 59, 999));
    return { start, end, label: 'hari ini' };
  }

  if (lowerText.includes('minggu ini')) {
    const start = new Date(now.setDate(now.getDate() - now.getDay()));
    const end = new Date(now.setDate(now.getDate() + 6));
    return { start, end, label: 'minggu ini' };
  }

  if (lowerText.includes('bulan ini')) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end, label: 'bulan ini' };
  }

  // Match specific month (e.g., "bulan April")
  const monthMatch = text.match(/bulan\s+(\w+)/i);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const monthIndex = getMonthIndex(monthName);
    if (monthIndex !== -1) {
      const year = now.getFullYear();
      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0);
      return { start, end, label: `bulan ${monthName}` };
    }
  }

  return null;
}

function getMonthIndex(monthName) {
  const months = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3,
    'mei': 4, 'juni': 5, 'juli': 6, 'agustus': 7,
    'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
  };
  return months[monthName] ?? -1;
}

async function handleTotalExpense(from, transactions, dateRange) {
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const response = `📊 Laporan Keuangan ${dateRange.label}\n\n` +
    `💰 Total Pemasukan: Rp${totalIncome.toLocaleString('id-ID')}\n` +
    `💸 Total Pengeluaran: Rp${totalExpense.toLocaleString('id-ID')}\n` +
    `💵 Saldo: Rp${(totalIncome - totalExpense).toLocaleString('id-ID')}`;

  await redisClient.publish('whatsapp-response', JSON.stringify({
    to: from,
    message: response
  }));
}

async function handleLargestExpense(from, transactions, dateRange) {
  const expenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount);

  if (expenses.length === 0) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `📊 Tidak ada pengeluaran ${dateRange.label}.`
    }));
    return;
  }

  const largest = expenses[0];
  const response = `📊 Pengeluaran Terbesar ${dateRange.label}\n\n` +
    `💸 ${largest.description}\n` +
    `💵 Rp${largest.amount.toLocaleString('id-ID')}\n` +
    `🏷️ Kategori: ${largest.category}\n` +
    (largest.merchant ? `🏪 Merchant: ${largest.merchant}\n` : '') +
    `📅 ${new Date(largest.date).toLocaleDateString('id-ID')}`;

  await redisClient.publish('whatsapp-response', JSON.stringify({
    to: from,
    message: response
  }));
}

async function handleAllTransactions(from, transactions, dateRange) {
  if (transactions.length === 0) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `📊 Tidak ada transaksi ${dateRange.label}.`
    }));
    return;
  }

  let response = `📊 Semua Transaksi ${dateRange.label}\n\n`;
  
  // Group by date
  const groupedByDate = transactions.reduce((groups, t) => {
    const date = new Date(t.date).toLocaleDateString('id-ID');
    if (!groups[date]) groups[date] = [];
    groups[date].push(t);
    return groups;
  }, {});

  // Format each day's transactions
  Object.entries(groupedByDate).forEach(([date, dayTransactions]) => {
    response += `📅 ${date}\n`;
    
    dayTransactions.forEach(t => {
      const emoji = t.type === 'income' ? '💰' : '💸';
      response += `${emoji} ${t.description}\n`;
      response += `   Rp${t.amount.toLocaleString('id-ID')}\n`;
      if (t.category && t.category !== 'Lainnya') {
        response += `   🏷️ ${t.category}\n`;
      }
      if (t.merchant) {
        response += `   🏪 ${t.merchant}\n`;
      }
      response += '\n';
    });
  });

  // Add summary
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  response += `\n📈 Ringkasan:\n` +
    `💰 Total Pemasukan: Rp${totalIncome.toLocaleString('id-ID')}\n` +
    `💸 Total Pengeluaran: Rp${totalExpense.toLocaleString('id-ID')}\n` +
    `💵 Saldo: Rp${(totalIncome - totalExpense).toLocaleString('id-ID')}`;

  await redisClient.publish('whatsapp-response', JSON.stringify({
    to: from,
    message: response
  }));
} 