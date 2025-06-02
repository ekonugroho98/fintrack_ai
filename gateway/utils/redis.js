// gateway/utils/redis.js
import { createClient } from 'redis'
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

// Get Redis configuration from environment variables
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
logger.info(`Using Redis URL: ${REDIS_URL}`)

// Create separate connections for subscriber and publisher
const subscriber = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      logger.info(`Redis subscriber reconnecting... Attempt ${retries}`)
      if (retries > 10) {
        logger.error('Redis subscriber connection failed after 10 retries')
        return new Error('Redis connection failed')
      }
      return Math.min(retries * 100, 3000)
    },
    connectTimeout: 10000, // 10 seconds
    keepAlive: 10000 // 10 seconds
  }
})

const publisher = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      logger.info(`Redis publisher reconnecting... Attempt ${retries}`)
      if (retries > 10) {
        logger.error('Redis publisher connection failed after 10 retries')
        return new Error('Redis connection failed')
      }
      return Math.min(retries * 100, 3000)
    },
    connectTimeout: 10000, // 10 seconds
    keepAlive: 10000 // 10 seconds
  }
})

// Handle subscriber connection
subscriber.on('error', (err) => {
  logger.error('Redis subscriber error:', err.message)
})

subscriber.on('connect', () => {
  logger.info('Redis subscriber connected successfully')
})

subscriber.on('ready', () => {
  logger.info('Redis subscriber ready')
})

subscriber.on('reconnecting', () => {
  logger.info('Redis subscriber reconnecting...')
})

// Handle publisher connection
publisher.on('error', (err) => {
  logger.error('Redis publisher error:', err.message)
})

publisher.on('connect', () => {
  logger.info('Redis publisher connected successfully')
})

publisher.on('ready', () => {
  logger.info('Redis publisher ready')
})

publisher.on('reconnecting', () => {
  logger.info('Redis publisher reconnecting...')
})

// Connect both clients with retry
const connectWithRetry = async (client, name, maxRetries = 5) => {
  let retries = 0
  while (retries < maxRetries) {
    try {
      await client.connect()
      logger.info(`${name} connected successfully`)
      return
    } catch (error) {
      retries++
      logger.error(`${name} connection failed (attempt ${retries}/${maxRetries}):`, error.message)
      if (retries === maxRetries) {
        throw new Error(`${name} connection failed after ${maxRetries} attempts`)
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retries))
    }
  }
}

// Connect both clients
try {
  await Promise.all([
    connectWithRetry(subscriber, 'Redis subscriber'),
    connectWithRetry(publisher, 'Redis publisher')
  ])
  logger.info('Both Redis clients connected successfully')
} catch (error) {
  logger.error('Failed to connect to Redis:', error.message)
  throw error
}

// Export functions for pub/sub
export const publish = async (channel, message) => {
  try {
    if (!publisher.isOpen) {
      logger.warn('Publisher not connected, attempting to reconnect...')
      await connectWithRetry(publisher, 'Redis publisher')
    }
    await publisher.publish(channel, message)
  } catch (error) {
    logger.error('Failed to publish message:', error.message)
    throw error
  }
}

export const subscribe = async (channel, callback) => {
  try {
    if (!subscriber.isOpen) {
      logger.warn('Subscriber not connected, attempting to reconnect...')
      await connectWithRetry(subscriber, 'Redis subscriber')
    }
    await subscriber.subscribe(channel, callback)
  } catch (error) {
    logger.error('Failed to subscribe to channel:', error.message)
    throw error
  }
}

export const rPush = async (key, value) => {
  try {
    if (!publisher.isOpen) {
      logger.warn('Publisher not connected, attempting to reconnect...')
      await connectWithRetry(publisher, 'Redis publisher')
    }
    await publisher.rPush(key, value)
  } catch (error) {
    logger.error('Failed to push to list:', error.message)
    throw error
  }
}

export default {
  publish,
  subscribe,
  rPush
}
