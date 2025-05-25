// gateway/handler/voice.js
import redis from '../utils/redis.js'
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

export default async function handleVoiceMessage(sock, msg) {
  const from = msg.key.remoteJid

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock })
    const base64Audio = buffer.toString('base64')

    const payload = {
      from,
      type: 'voice',
      timestamp: msg.messageTimestamp,
      content: base64Audio,
      mimetype: msg.message.audioMessage.mimetype || 'audio/ogg'
    }

    await redis.rPush('incoming_messages', JSON.stringify(payload))
    logger.info({
      event: 'voice_message_processed',
      from,
      mimetype: payload.mimetype,
      timestamp: new Date().toISOString()
    })

    await sock.sendMessage(from, { text: '🎤 Voice note kamu sedang diproses.' })
  } catch (error) {
    logger.error({
      event: 'voice_message_error',
      from,
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}
