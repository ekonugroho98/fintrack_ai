import { addUserToDB, getUserFromDB, createAccount, saveTransactionToDB } from '../utils/db.js';

async function testDbValidation() {
  try {
    // 1. Buat akun baru
    const account = await createAccount('Akun Validasi Test');
    console.log('Account created:', account);

    // 2. Daftarkan user baru ke akun tersebut
    const user = await addUserToDB({
      phone_number: '6289998887777',
      name: 'User Validasi',
      account_id: account.id,
      role: 'owner',
      enable_text: true,
      enable_image: true,
      enable_voice: true,
      can_view_summary: true,
      can_add_transaction: true,
      can_delete_transaction: true
    });
    console.log('User registered:', user);

    // 3. Ambil user berdasarkan phone_number
    const userFetched = await getUserFromDB('6289998887777');
    console.log('User fetched:', userFetched);

    // 4. Simpan transaksi untuk user tersebut
    const trx = await saveTransactionToDB({
      user_id: user.id,
      account_id: user.account_id,
      source: 'text',
      data: {
        date: new Date().toISOString(),
        category: 'Test Kategori',
        amount: 12345,
        description: 'Transaksi validasi',
        type: 'expense',
        merchant: 'Toko Validasi'
      }
    });
    console.log('Transaction inserted:', trx);

    // 5. Validasi relasi UUID
    if (trx.user_id === user.id && trx.account_id === account.id) {
      console.log('✅ Relasi UUID user_id dan account_id valid!');
    } else {
      console.error('❌ Relasi UUID tidak valid!');
    }

    console.log('✅ Semua proses validasi database berhasil!');
  } catch (err) {
    console.error('❌ Error saat validasi database:', err.message);
  }
}

testDbValidation(); 