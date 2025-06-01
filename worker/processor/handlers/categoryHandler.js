import redisClient from '../../utils/redis.js';
import { ensureCategoryExists } from '../../utils/db.js';
import { getUserFromDB } from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

export default async function handleCategory(data) {
  const { from, text } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');

  const match = text.match(/^KATEGORI\s*:\s*(.+)$/i);
  const categoryName = match?.[1]?.trim();

  if (!categoryName) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Format salah. Gunakan: KATEGORI: nama_kategori'
    }));
    return;
  }

  let user;
  try {
    user = await getUserFromDB(phoneNumber);
  } catch (err) {
    logger.error({ event: 'get_user_failed', phoneNumber, error: err.message });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor Anda belum terdaftar. Gunakan perintah DAFTAR# terlebih dahulu.'
    }));
    return;
  }

  try {
    await ensureCategoryExists(categoryName, user.account_id, 'expense');
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `✅ Kategori "${categoryName}" berhasil disimpan untuk akun Anda.`
    }));
  } catch (err) {
    logger.error({ event: 'save_category_failed', phoneNumber, error: err.message });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Gagal menyimpan kategori. Coba lagi nanti.'
    }));
  }
}
