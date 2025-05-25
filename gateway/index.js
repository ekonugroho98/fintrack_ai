// gateway/index.js
import { makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import NodeCache from 'node-cache'
import qrcode from 'qrcode-terminal'
import { subscribe } from './utils/redis.js'

import handleTextMessage from './handler/text.js'
import handleImageMessage from './handler/image.js'
import handleVoiceMessage from './handler/voice.js'

// Configuration
const CONFIG = {
  AUTH_FOLDER: 'auth',
  LOG_LEVEL: 'info',
  MESSAGE_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3
}

// Initialize logger with pino-pretty
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

const msgRetryCounterCache = new NodeCache()

// Rate limiting cache
const rateLimitCache = new NodeCache({
  stdTTL: 60, // 1 minute
  checkperiod: 120
})

// Check rate limit
function checkRateLimit(userId) {
  const key = `rate_limit_${userId}`
  const currentCount = rateLimitCache.get(key) || 0
  
  if (currentCount >= 10) { // Max 10 messages per minute
    return false
  }
  
  rateLimitCache.set(key, currentCount + 1)
  return true
}

async function startBot() {
  try {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_FOLDER)

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      msgRetryCounterCache,
      logger: pino({ level: 'silent' }), // Set to silent to avoid duplicate logs
    })

    // Subscribe to worker responses
    await subscribe('whatsapp-response', async (message) => {
      try {
        const { to, message: responseMessage } = JSON.parse(message);
        await sock.sendMessage(to, { text: responseMessage });
        logger.info({
          event: 'response_sent',
          to,
          message: responseMessage
        });
      } catch (error) {
        logger.error({
          event: 'response_error',
          error: error.message,
          stack: error.stack
        });
      }
    });

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        logger.info('📱 Scan QR Code berikut untuk login:')
        qrcode.generate(qr, { small: true })
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        if (reason === DisconnectReason.loggedOut) {
          logger.warn({ 
            event: 'connection_closed',
            reason: 'logged_out',
            message: 'Session logout. Scan ulang QR.'
          })
        } else {
          logger.warn({ 
            event: 'connection_closed',
            reason: 'disconnected',
            message: 'Terputus. Menyambung ulang...'
          })
          startBot()
        }
      } else if (connection === 'open') {
        logger.info({ 
          event: 'connection_opened',
          message: 'WhatsApp bot terkoneksi.'
        })
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      const msg = messages[0]
      if (!msg.message || msg.key.fromMe) return

      const from = jidNormalizedUser(msg.key.remoteJid)
      
      // Check rate limit
      if (!checkRateLimit(from)) {
        logger.warn(`Rate limit exceeded for user ${from}`)
        await sock.sendMessage(from, { text: '⚠️ Terlalu banyak pesan. Mohon tunggu sebentar.' })
        return
      }

      const msgType = Object.keys(msg.message)[0]
      logger.info({
        event: 'message_received',
        from,
        type: msgType,
        timestamp: new Date().toISOString()
      })

      try {
        await sock.sendPresenceUpdate('composing', from)

        // Set timeout for message handling
        const messagePromise = (async () => {
          if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
            await handleTextMessage(sock, msg)
          } else if (msgType === 'imageMessage') {
            await handleImageMessage(sock, msg)
          } else if (msgType === 'audioMessage') {
            await handleVoiceMessage(sock, msg)
          } else {
            logger.warn({
              event: 'unsupported_message_type',
              from,
              type: msgType
            })
            await sock.sendMessage(from, { text: `⚠️ Pesan tipe "${msgType}" belum didukung.` })
          }
        })()

        // Add timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Message handling timeout')), CONFIG.MESSAGE_TIMEOUT)
        )

        await Promise.race([messagePromise, timeoutPromise])

      } catch (err) {
        logger.error({
          event: 'message_error',
          from,
          type: msgType,
          error: err.message,
          stack: err.stack
        })
        
        await sock.sendMessage(from, { 
          text: '❌ Terjadi error saat memproses pesan. Mohon coba lagi nanti.' 
        })
      }
    })

  } catch (err) {
    logger.error({
      event: 'startup_error',
      error: err.message,
      stack: err.stack
    })
    // Retry startup after delay
    setTimeout(startBot, 5000)
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error({
    event: 'uncaught_exception',
    error: err.message,
    stack: err.stack
  })
})

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    event: 'unhandled_rejection',
    reason: reason,
    promise: promise
  })
})

startBot()
  