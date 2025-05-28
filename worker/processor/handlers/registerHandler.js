import { getUserFromDB, addUserToDB, createAccount } from '../../utils/db.js';
import redisClient from '../../utils/redis.js';

function parseRegisterMessage(message, phoneNumber) {
  const [cmd, name, role, fitur] = message.split('#');
  if (cmd.toUpperCase() !== 'DAFTAR') return null;
  return {
    phone_number: phoneNumber,
    name: name?.trim() || 'User',
    role: role?.trim() || 'user',
    enable_text: fitur?.includes('text') ?? true,
    enable_image: fitur?.includes('image') ?? false,
    enable_voice: fitur?.includes('voice') ?? false,
    can_view_summary: false,
    can_add_transaction: true,
    can_delete_transaction: false
  };
}

export async function handleRegister(data) {
  const { from, text } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');
  
  const userData = parseRegisterMessage(text, phoneNumber);
  if (!userData) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Format salah. Contoh: DAFTAR#Nama#role#fitur'
    }));
    return;
  }

  try {
    await getUserFromDB(userData.phone_number);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor Anda sudah terdaftar.'
    }));
    return;
  } catch (err) {
    if (!err.message.includes('No rows')) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Terjadi kesalahan saat cek pendaftaran.'
      }));
      return;
    }
  }

  try {
    const account = await createAccount(userData.name);
    userData.account_id = account.id;
    userData.role = 'owner';
    const user = await addUserToDB(userData);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `✅ Pendaftaran berhasil, selamat datang ${userData.name}!`
    }));
  } catch (err) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Gagal mendaftar. Coba lagi nanti.'
    }));
  }
}
