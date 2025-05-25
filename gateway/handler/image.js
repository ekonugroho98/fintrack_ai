// gateway/handler/image.js
import { publish } from '../utils/redis.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
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

export default async function handleImageMessage(sock, msg) {
  const from = msg.key.remoteJid

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock })
    const base64Image = buffer.toString('base64')

    const payload = {
      type: 'image',
      data: {
        from,
        messageId: msg.key.id,
        content: base64Image,
        mimetype: msg.message.imageMessage.mimetype || 'image/jpeg',
        timestamp: new Date().toISOString()
      }
    }

    await publish('incoming-message', JSON.stringify(payload))
    logger.info({
      event: 'image_message_processed',
      from,
      mimetype: payload.data.mimetype,
      timestamp: new Date().toISOString()
    })

    await sock.sendMessage(from, { text: '🖼️ Gambar kamu sedang diproses.' })
  } catch (error) {
    logger.error({
      event: 'image_message_error',
      from,
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}
