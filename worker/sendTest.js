import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createClient({ url: REDIS_URL });

await redis.connect();

// Test messages dengan berbagai skenario
const testMessages = [
  // 1. Transaksi Makanan & Minuman (Format Standar)
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test123',
      text: 'Saya beli makan siang Rp 50.000',
      timestamp: new Date().toISOString(),
      pushName: 'Test User'
    }
  },
  // 2. Transaksi dengan Merchant
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test124',
      text: 'Belanja di Indomaret Rp 150.000',
      timestamp: new Date().toISOString(),
      pushName: 'Test User'
    }
  },
  // 3. Transaksi Pemasukan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test125',
      text: 'Dapat gaji Rp 5.000.000',
      timestamp: new Date().toISOString(),
      pushName: 'Test User'
    }
  },
  // 4. Transaksi Tagihan
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test126',
      text: 'Bayar listrik Rp 200.000',
      timestamp: new Date().toISOString(),
      pushName: 'Test User'
    }
  },
  // 5. Transaksi Transfer
  {
    type: 'text',
    data: {
      from: '6281234567890',
      messageId: 'test127',
      text: 'Transfer ke teman Rp 100.000',
      timestamp: new Date().toISOString(),
      pushName: 'Test User'
    }
  }
];

async function sendMessage(message) {
  try {
    await redis.publish('incoming-message', JSON.stringify(message));
    console.log('📤 Pesan test terkirim:', {
      type: message.type,
      messageId: message.data.messageId,
      text: message.data.text
    });
    
    // Tunggu 1 detik antara setiap message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
  }
}

async function runTests() {
  try {
    console.log('🚀 Starting message tests...\n');
    
    // Send test messages
    for (const message of testMessages) {
      await sendMessage(message);
    }
    
    console.log('\n✅ Semua pesan test telah terkirim');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// Run tests
runTests();
