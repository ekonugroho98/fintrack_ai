import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createClient({ url: REDIS_URL });

await redis.connect();

// Test messages dengan berbagai skenario
const testMessages = [
  // 1. Transaksi Makanan & Minuman
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test123',
      text: 'saya beli ayam geprek 25 ribu',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 2. Transaksi Transportasi
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test124',
      text: 'grab dari rumah ke kantor 45rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 3. Transaksi Belanja
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test125',
      text: 'belanja di indomaret 150rb untuk kebutuhan bulanan',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 4. Transaksi Tagihan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test126',
      text: 'bayar listrik 350rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 5. Transaksi Hiburan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test127',
      text: 'nonton film di XXI 75rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 6. Transaksi Kesehatan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test128',
      text: 'cek kesehatan di RS 500rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 7. Transaksi Pendidikan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test129',
      text: 'bayar SPP kuliah 2.5jt',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 8. Transaksi Investasi
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test130',
      text: 'beli saham BBCA 10 lot',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 9. Transaksi Gaji
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test131',
      text: 'terima gaji 8jt',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 10. Transaksi Tabungan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test132',
      text: 'setor tabungan 1jt',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 11. Transaksi Makanan (Restoran)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test133',
      text: 'makan di Sate Khas Senayan 350rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 12. Transaksi Transportasi (Tol)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test134',
      text: 'bayar tol JORR 15rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 13. Transaksi Belanja (Online)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test135',
      text: 'beli baju di Tokopedia 250rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 14. Transaksi Tagihan (Internet)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test136',
      text: 'bayar paket internet 300rb',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  },
  // 15. Transaksi Hiburan (Konser)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test137',
      text: 'beli tiket konser Coldplay 2jt',
      timestamp: new Date().toISOString(),
      pushName: 'Eko Nugroho'
    }
  }
];

// Kirim semua test messages
for (const message of testMessages) {
  await redis.publish('incoming-message', JSON.stringify(message));
  console.log('📤 Pesan test terkirim:', {
    type: message.type,
    messageId: message.data.messageId,
    text: message.data.text
  });
  
  // Tunggu 1 detik antara setiap message
  await new Promise(resolve => setTimeout(resolve, 1000));
}

console.log('✅ Semua pesan test telah terkirim');

await redis.quit();
