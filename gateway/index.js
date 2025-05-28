// gateway/index.js
import { makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { CONFIG } from './config.js'
import { middlewareManager } from './middleware/index.js'
import { stateManager } from './state/index.js'
import { metrics, startMetricsServer } from './monitoring/index.js'
import { subscribe } from './utils/redis.js'

import handleTextMessage from './handler/text.js'
import handleImageMessage from './handler/image.js'
import handleVoiceMessage from './handler/voice.js'

// Initialize logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  },
  level: CONFIG.LOG_LEVEL
})

// Start metrics server if enabled
if (CONFIG.ENABLE_METRICS) {
  startMetricsServer()
}

// Add basic middleware
middlewareManager
  .use(async (ctx, next) => {
    const startTime = Date.now()
    await next()
    const duration = (Date.now() - startTime) / 1000
    metrics.observeProcessingTime(ctx.msg.messageType, duration)
  })
  .use(async (ctx, next) => {
    const userId = jidNormalizedUser(ctx.msg.key.remoteJid)
    stateManager.incrementMessageCount(userId)
    await next()
  })

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
      logger: pino({ level: 'silent' }),
    })

    // Subscribe to worker responses
    await subscribe('whatsapp-response', async (message) => {
      try {
        const { to, message: responseMessage } = JSON.parse(message)
        await sock.sendMessage(to, { text: responseMessage })
        metrics.incrementMessage('response')
        logger.info({
          event: 'response_sent',
          to,
          message: responseMessage
        })
      } catch (error) {
        metrics.incrementError('response')
        logger.error({
          event: 'response_error',
          error: error.message,
          stack: error.stack
        })
      }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        logger.info('📱 Scan QR Code berikut untuk login:')
        qrcode.generate(qr, { small: true })
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        if (reason === DisconnectReason.loggedOut) {
          metrics.incrementError('logout')
          logger.warn({ 
            event: 'connection_closed',
            reason: 'logged_out',
            message: 'Session logout. Scan ulang QR.'
          })
        } else {
          metrics.incrementError('disconnect')
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
      const msgType = Object.keys(msg.message)[0]
      
      try {
        // Process through middleware
        const context = await middlewareManager.processMessage(msg, sock)
        
        // Update metrics
        metrics.incrementMessage(msgType)
        
        // Handle message based on type
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
      } catch (err) {
        metrics.incrementError('message_processing')
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
    metrics.incrementError('startup')
    logger.error({
      event: 'startup_error',
      error: err.message,
      stack: err.stack
    })
    setTimeout(startBot, 5000)
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  metrics.incrementError('uncaught_exception')
  logger.error({
    event: 'uncaught_exception',
    error: err.message,
    stack: err.stack
  })
})

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  metrics.incrementError('unhandled_rejection')
  logger.error({
    event: 'unhandled_rejection',
    reason: reason,
    promise: promise
  })
})

startBot()
  