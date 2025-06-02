import { getUserFromDB, addUserToDB, createAccount } from '../../utils/db.js';
import redisClient from '../../utils/redis.js';
import { isRegistrationAllowed } from '../../utils/userConfig.js';
import { logger } from '../../utils/logger.js';

function formatPhoneNumber(phoneNumber) {
  // Hapus semua karakter non-digit
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Jika nomor dimulai dengan 0, ganti dengan 62
  if (cleaned.startsWith('0')) {
    return '62' + cleaned.substring(1);
  }
  
  // Jika nomor dimulai dengan 62, biarkan apa adanya
  if (cleaned.startsWith('62')) {
    return cleaned;
  }
  
  // Jika nomor dimulai dengan 8, tambahkan 62
  if (cleaned.startsWith('8')) {
    return '62' + cleaned;
  }
  
  return cleaned;
}

function parseRegisterMessage(message) {
  const [cmd, phoneNumber, name, role, fitur] = message.split('#');
  if (cmd.toUpperCase() !== 'DAFTAR') return null;
  
  // Validasi format nomor telepon
  if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
    return null;
  }

  // Format nomor telepon
  const formattedPhoneNumber = formatPhoneNumber(phoneNumber);

  return {
    phone_number: formattedPhoneNumber,
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
  const senderNumber = from.replace('@s.whatsapp.net', '');
  
  // Validasi nomor pengirim (admin)
  if (!isRegistrationAllowed(senderNumber)) {
    logger.warn(`Nomor ${senderNumber} tidak diizinkan untuk mendaftarkan user`);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, Anda tidak memiliki akses untuk mendaftarkan user baru.'
    }));
    return;
  }

  const userData = parseRegisterMessage(text);
  if (!userData) {
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Format pendaftaran salah. Contoh: DAFTAR#Nomor#Nama#role#fitur'
    }));
    return;
  }

  try {
    // Cek apakah user sudah terdaftar
    await getUserFromDB(userData.phone_number);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor tersebut sudah terdaftar.'
    }));
    return;
  } catch (err) {
    // Jika error karena user tidak ditemukan, lanjutkan pendaftaran
    if (!err.message?.includes('No rows')) {
      logger.error({ event: 'db_get_user_error', error: err.message });
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Terjadi kesalahan saat cek pendaftaran.'
      }));
      return;
    }
  }

  // Buat akun baru (accounts) dan dapatkan account_id
  try {
    // Buat akun dengan menyertakan nomor telepon
    const account = await createAccount({
      name: userData.name,
      phone_number: userData.phone_number
    });
    
    // Set account_id ke user data
    userData.account_id = account.id;
    
    // Simpan data user
    await addUserToDB(userData);
    
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: `✅ Pendaftaran berhasil!\nNomor: ${userData.phone_number}\nNama: ${userData.name}\nRole: ${userData.role}\nFitur: ${userData.enable_text ? 'text ' : ''}${userData.enable_image ? 'image ' : ''}${userData.enable_voice ? 'voice' : ''}`
    }));
  } catch (err) {
    logger.error({ event: 'db_add_user_error', error: err.message });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Gagal mendaftar. Coba lagi nanti.'
    }));
  }
}
