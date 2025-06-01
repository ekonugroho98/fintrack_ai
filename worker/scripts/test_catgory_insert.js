import { ensureCategoryExists } from '../utils/db.js';

const testUserId = '58e3079c-5beb-40f1-b8e7-cbe15bb781c9'; // Ganti dengan UUID user yang valid di test DB

async function testInsertCategory() {
  try {
    await ensureCategoryExists('Test Kategori Unit', testUserId, 'expense');
    console.log('✅ Test berhasil: kategori berhasil dimasukkan (atau sudah ada).');
  } catch (err) {
    console.error('❌ Test gagal:', err.message);
  }
}

testInsertCategory();
