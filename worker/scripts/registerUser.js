import { addUserToDB, getUserFromDB, createAccount } from '../utils/db.js';
import { logger } from '../utils/logger.js';

// Fungsi untuk parsing pesan pendaftaran
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

// Handler utama untuk pesan text
export default async function handleTextMessage(sock, msg) {
  const from = msg.key.remoteJid.replace('@s.whatsapp.net', '');
  const textMsg = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

  // Cek apakah pesan adalah pendaftaran
  if (textMsg.toUpperCase().startsWith('DAFTAR#')) {
    const userData = parseRegisterMessage(textMsg, from);
    if (!userData) {
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Format pendaftaran salah. Contoh: DAFTAR#Nama#role#fitur' });
      return;
    }

    // Cek apakah user sudah terdaftar
    try {
      await getUserFromDB(from);
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Nomor Anda sudah terdaftar.' });
      return;
    } catch (err) {
      // Jika error karena user tidak ditemukan, lanjutkan pendaftaran
      if (err.message && err.message.includes('No rows')) {
        // Lanjut daftar
      } else {
        logger.error({ event: 'db_get_user_error', error: err.message });
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi kesalahan saat cek pendaftaran.' });
        return;
      }
    }

    // Buat akun baru (accounts) dan dapatkan account_id
    try {
      const account = await createAccount(userData.name);
      userData.account_id = account.id; // set account_id ke user
      await addUserToDB(userData);
      await sock.sendMessage(msg.key.remoteJid, { text: `✅ Pendaftaran berhasil, selamat datang ${userData.name}!` });
    } catch (err) {
      logger.error({ event: 'db_add_user_error', error: err.message });
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mendaftar. Coba lagi nanti.' });
    }
    return;
  }

  // Handler INVITE#nomor
  if (textMsg.toUpperCase().startsWith('INVITE#')) {
    const [cmd, invitedNumber] = textMsg.split('#');
    const cleanNumber = invitedNumber?.replace(/[^0-9]/g, '');
    if (!cleanNumber) {
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Format invite salah. Contoh: INVITE#628xxxxxxx' });
      return;
    }

    // Cek apakah pengundang sudah terdaftar dan punya account_id
    let inviter;
    try {
      inviter = await getUserFromDB(from);
      if (!inviter.account_id) {
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Anda belum terdaftar atau belum punya akun.' });
        return;
      }
    } catch (err) {
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Anda belum terdaftar.' });
      return;
    }

    // Cek apakah nomor yang di-invite sudah terdaftar
    try {
      await getUserFromDB(cleanNumber);
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Nomor tersebut sudah terdaftar.' });
      return;
    } catch (err) {
      if (err.message && err.message.includes('No rows')) {
        // lanjut invite
      } else {
        logger.error({ event: 'db_get_user_error', error: err.message });
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi kesalahan saat cek nomor invite.' });
        return;
      }
    }

    // Daftarkan user baru ke account_id yang sama
    try {
      const invitedUserData = {
        phone_number: cleanNumber,
        name: `User ${cleanNumber}`,
        account_id: inviter.account_id,
        role: 'user',
        enable_text: true,
        enable_image: inviter.enable_image,
        enable_voice: inviter.enable_voice,
        can_view_summary: inviter.can_view_summary,
        can_add_transaction: inviter.can_add_transaction,
        can_delete_transaction: inviter.can_delete_transaction
      };
      await addUserToDB(invitedUserData);
      await sock.sendMessage(msg.key.remoteJid, { text: `✅ Nomor ${cleanNumber} berhasil diundang ke akun Anda.` });
      // (Opsional) Kirim pesan ke nomor yang di-invite jika ingin
    } catch (err) {
      logger.error({ event: 'db_add_user_error', error: err.message });
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Gagal mengundang nomor. Coba lagi nanti.' });
    }
    return;
  }

  // ...lanjutkan handler text lain seperti biasa
}