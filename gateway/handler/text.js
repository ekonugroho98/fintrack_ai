// gateway/handler/text.js
import { publish } from '../utils/redis.js'
import pino from 'pino'

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  }
})

export default async function handleTextMessage(sock, msg) {
  const from = msg.key.remoteJid
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

  const payload = {
    type: 'text',
    data: {
      from,
      messageId: msg.key.id,
      text: text,
      timestamp: new Date().toISOString()
    }
  }

  try {
    // Publish message to Redis for processing
    await publish('incoming-message', JSON.stringify(payload))
    
    logger.info({
      event: 'text_message_processed',
      from,
      content: text,
      timestamp: new Date().toISOString()
    })

    // Send acknowledgment to user
    await sock.sendMessage(from, { 
      text: '✅ Pesan kamu sedang diproses oleh AI. Mohon tunggu sebentar...' 
    })
  } catch (error) {
    logger.error({
      event: 'text_message_error',
      from,
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}
