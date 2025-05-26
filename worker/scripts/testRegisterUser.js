import { addUserToDB, createAccount, getUserFromDB } from '../utils/db.js';
import { logger } from '../utils/logger.js';

async function testRegisterUser() {
  try {
    // 1. Buat akun baru (accounts)
    const account = await createAccount('Akun Test Eko');
    console.log('Account created:', account);

    // 2. Daftarkan user pertama ke akun tersebut
    const user1 = {
      phone_number: '6281234567890',
      name: 'Eko Nugroho',
      account_id: account.id,
      role: 'admin',
      enable_text: true,
      enable_image: true,
      enable_voice: true,
      can_view_summary: true,
      can_add_transaction: true,
      can_delete_transaction: true
    };
    const registeredUser1 = await addUserToDB(user1);
    console.log('User 1 registered:', registeredUser1);

    // 3. Daftarkan user kedua ke akun yang sama (simulasi invite)
    const user2 = {
      phone_number: '6281111111111',
      name: 'Aulia',
      account_id: account.id,
      role: 'user',
      enable_text: true,
      enable_image: false,
      enable_voice: false,
      can_view_summary: false,
      can_add_transaction: true,
      can_delete_transaction: false
    };
    const registeredUser2 = await addUserToDB(user2);
    console.log('User 2 registered:', registeredUser2);

    // 4. Cek hasil pendaftaran user
    const checkUser1 = await getUserFromDB('6281234567890');
    const checkUser2 = await getUserFromDB('6281111111111');
    console.log('Check User 1:', checkUser1);
    console.log('Check User 2:', checkUser2);

    console.log('✅ Semua proses testing pendaftaran user berhasil!');
  } catch (err) {
    logger.error({ event: 'test_register_user_error', error: err.message });
    console.error('❌ Error saat testing pendaftaran user:', err.message);
  }
}

testRegisterUser();
