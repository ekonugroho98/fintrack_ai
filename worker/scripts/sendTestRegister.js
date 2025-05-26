import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createClient({ url: REDIS_URL });

await redis.connect();

// Test messages untuk pendaftaran dan invite
const testMessages = [
  // 1. Pendaftaran user baru
  {
    type: 'text',
    data: {
      from: '6285550001111',
      messageId: 'reg001',
      text: 'DAFTAR#User Test#user#text,image',
      timestamp: new Date().toISOString(),
      pushName: 'User Test'
    }
  },
  // 2. Pendaftaran user baru lain
  {
    type: 'text',
    data: {
      from: '6285550002222',
      messageId: 'reg002',
      text: 'DAFTAR#User Dua#user#text',
      timestamp: new Date().toISOString(),
      pushName: 'User Dua'
    }
  },
  // 3. Invite user ke akun user pertama
  {
    type: 'text',
    data: {
      from: '6285550001111',
      messageId: 'inv001',
      text: 'INVITE#6285550003333',
      timestamp: new Date().toISOString(),
      pushName: 'User Test'
    }
  },
  // 4. Invite user ke akun user kedua
  {
    type: 'text',
    data: {
      from: '6285550002222',
      messageId: 'inv002',
      text: 'INVITE#6285550004444',
      timestamp: new Date().toISOString(),
      pushName: 'User Dua'
    }
  }
];

for (const message of testMessages) {
  await redis.publish('incoming-message', JSON.stringify(message));
  console.log('📤 Pesan test terkirim:', {
    type: message.type,
    messageId: message.data.messageId,
    text: message.data.text
  });
  await new Promise(resolve => setTimeout(resolve, 3000));
}

console.log('✅ Semua pesan test pendaftaran/invite telah terkirim');

await redis.quit(); 