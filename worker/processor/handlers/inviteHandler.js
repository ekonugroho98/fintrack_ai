import { getUserFromDB, addUserToDB } from '../../utils/db.js';
import redisClient from '../../utils/redis.js';

export async function handleInvite(data) {
  const { from, text } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');
  
  const [cmd, invitedNumber] = text.split('#');
  const cleanNumber = invitedNumber?.replace(/[^0-9]/g, '');
  if (!cleanNumber) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Format invite salah. Contoh: INVITE#628xxxxxxx'
    }));
    return;
  }

  let inviter;
  try {
    inviter = await getUserFromDB(phoneNumber);
    if (!inviter.account_id) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Anda belum terdaftar atau belum punya akun.'
      }));
      return;
    }
  } catch {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Anda belum terdaftar.'
    }));
    return;
  }

  try {
    await getUserFromDB(cleanNumber);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor tersebut sudah terdaftar.'
    }));
    return;
  } catch (err) {
    if (!err.message.includes('No rows')) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Terjadi kesalahan saat cek nomor invite.'
      }));
      return;
    }
  }

  try {
    const invitedUserData = {
      phone_number: cleanNumber,
      name: `User ${cleanNumber}`,
      account_id: inviter.account_id,
      role: 'editor',
      enable_text: true,
      enable_image: inviter.enable_image,
      enable_voice: inviter.enable_voice,
      can_view_summary: inviter.can_view_summary,
      can_add_transaction: inviter.can_add_transaction,
      can_delete_transaction: inviter.can_delete_transaction
    };
    await addUserToDB(invitedUserData);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `✅ Nomor ${cleanNumber} berhasil diundang ke akun Anda.`
    }));
  } catch {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Gagal mengundang nomor. Coba lagi nanti.'
    }));
  }
}
