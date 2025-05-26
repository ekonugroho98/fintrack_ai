import { isFeatureAllowed } from '../utils/userConfig.js';
import redisClient from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import apiClient from '../utils/apiClient.js';
import { saveTransactionToDB, addUserToDB, getUserFromDB, createAccount } from '../utils/db.js';

function formatCurrency(amount) {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) return 'Rp0,00';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numAmount);
}

function formatDate(dateStr) {
  if (!dateStr) dateStr = new Date().toISOString();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) dateStr = new Date().toISOString();
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// Fungsi parsing pesan pendaftaran
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

export default async function processText(data) {
  const { from, text, messageId, timestamp } = data;
  const phoneNumber = from.replace('@s.whatsapp.net', '');

  // --- Handler DAFTAR# (Pendaftaran User Baru) ---
  if (text.toUpperCase().startsWith('DAFTAR#')) {
    const userData = parseRegisterMessage(text, phoneNumber);
    if (!userData) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Format pendaftaran salah. Contoh: DAFTAR#Nama#role#fitur'
      }));
      return;
    }
    // Cek user sudah terdaftar?
    try {
      await getUserFromDB(userData.phone_number);
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Nomor Anda sudah terdaftar.'
      }));
      return;
    } catch (err) {
      if (err.message && err.message.includes('No rows')) {
        // lanjut daftar
      } else {
        await redisClient.publish('whatsapp-response', JSON.stringify({
          to: from,
          message: '❌ Terjadi kesalahan saat cek pendaftaran.'
        }));
        return;
      }
    }
    // Buat akun baru dan daftarkan user sebagai 'owner'
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
    return;
  }

  // --- Handler INVITE# (Mengundang User ke Akun yang Sama) ---
  if (text.toUpperCase().startsWith('INVITE#')) {
    const [cmd, invitedNumber] = text.split('#');
    const cleanNumber = invitedNumber?.replace(/[^0-9]/g, '');
    if (!cleanNumber) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Format invite salah. Contoh: INVITE#628xxxxxxx'
      }));
      return;
    }
    // Cek pengundang
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
    } catch (err) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Anda belum terdaftar.'
      }));
      return;
    }
    // Cek nomor yang di-invite
    try {
      await getUserFromDB(cleanNumber);
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Nomor tersebut sudah terdaftar.'
      }));
      return;
    } catch (err) {
      if (err.message && err.message.includes('No rows')) {
        // lanjut invite
      } else {
        await redisClient.publish('whatsapp-response', JSON.stringify({
          to: from,
          message: '❌ Terjadi kesalahan saat cek nomor invite.'
        }));
        return;
      }
    }
    // Daftarkan user baru ke account_id yang sama, role default 'editor'
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
    } catch (err) {
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: '❌ Gagal mengundang nomor. Coba lagi nanti.'
      }));
    }
    return;
  }

  // --- Ambil user dari DB untuk transaksi (harus dapat UUID user dan account_id) ---
  let user;
  try {
    user = await getUserFromDB(phoneNumber);
  } catch (err) {
    logger.error({ event: 'db_get_user_error', phoneNumber, error: err.message });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Nomor Anda belum terdaftar. Silakan daftar dulu dengan DAFTAR#Nama.'
    }));
    return;
  }

  if (!isFeatureAllowed(phoneNumber, 'text')) {
    logger.warn(`Fitur text tidak diizinkan untuk ${from}`);
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, Anda tidak memiliki akses untuk fitur ini.'
    }));
    return;
  }

  try {
    logger.info(`Mengirim request ke AI service untuk user ${from}`);
    const result = await apiClient.processText(text, from);

    logger.info({
      event: 'ai_service_response',
      raw_response: result,
      text_input: text,
      from
    });

    if (result?.message?.includes('konsultasi')) {
      logger.info('Message is a consultation, processing with consultation endpoint');
      const consultationResult = await apiClient.processConsultation({
        message: text,
        phone_number: from
      });

      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: consultationResult.reply || 'Maaf, saya tidak bisa menjawab pertanyaan tersebut.'
      }));
      return;
    }

    if (result?.message?.includes('tidak terdeteksi')) {
      logger.info('Message is not detected as transaction or consultation');
      await redisClient.publish('whatsapp-response', JSON.stringify({
        to: from,
        message: result.message
      }));
      return;
    }

    const validatedResult = {
      date: result?.data?.date || new Date().toISOString(),
      category: result?.data?.category || 'Lainnya',
      amount: result?.data?.amount || 0,
      description: result?.data?.description || text,
      type: result?.data?.type || 'expense',
      merchant: result?.data?.merchant || null
    };

    logger.info({
      event: 'validated_result',
      original: result,
      validated: validatedResult
    });

    await redisClient.setLastTransaction(phoneNumber, {
      type: 'text', raw: text, result: validatedResult, messageId, timestamp
    });

    // Simpan ke database Supabase (pakai UUID user dan account)
    try {
      await saveTransactionToDB({
        user_id: user.id,
        account_id: user.account_id,
        source: 'text',
        data: validatedResult
      });
    } catch (dbError) {
      logger.error({
        event: 'db_save_error',
        from,
        error: dbError.message,
        stack: dbError.stack,
        fallbackData: validatedResult
      });
  
      await redisClient.publisher.rPush('failed:transactions', JSON.stringify({
        from,
        source: 'text',
        data: validatedResult,
        timestamp: Date.now()
      }));
      
    }

    const responseMessage = `✅ Transaksi dicatat!\n\n📅 Tanggal: ${formatDate(validatedResult.date)}\n📋 Kategori: ${validatedResult.category}\n💰 Nominal: ${formatCurrency(validatedResult.amount)}\n📝 Keterangan: ${validatedResult.description}`;

    logger.info({
      event: 'formatted_response',
      message: responseMessage,
      validated_data: validatedResult
    });

    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: responseMessage
    }));

    return validatedResult;
  } catch (err) {
    logger.error(`Gagal memproses text dari ${from}:`, {
      error: err.message,
      stack: err.stack,
      content: text
    });
    await redisClient.publish('whatsapp-response', JSON.stringify({
      to: from,
      message: '❌ Maaf, terjadi kesalahan saat memproses pesan Anda.'
    }));
    throw err;
  }
}
