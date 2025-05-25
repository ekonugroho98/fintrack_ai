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

// Create separate connections for subscriber and publisher
const subscriber = createClient()
const publisher = createClient()

// Handle subscriber connection
subscriber.on('error', (err) => {
  logger.error('Redis subscriber error:', err)
})

subscriber.on('connect', () => {
  logger.info('Redis subscriber connected')
})

// Handle publisher connection
publisher.on('error', (err) => {
  logger.error('Redis publisher error:', err)
})

publisher.on('connect', () => {
  logger.info('Redis publisher connected')
})

// Connect both clients
try {
  await subscriber.connect()
  await publisher.connect()
} catch (error) {
  logger.error('Failed to connect to Redis:', error)
  throw error
}

// Export functions for pub/sub
export const publish = async (channel, message) => {
  try {
    await publisher.publish(channel, message)
  } catch (error) {
    logger.error('Failed to publish message:', error)
    throw error
  }
}

export const subscribe = async (channel, callback) => {
  try {
    await subscriber.subscribe(channel, callback)
  } catch (error) {
    logger.error('Failed to subscribe to channel:', error)
    throw error
  }
}

export const rPush = async (key, value) => {
  try {
    await publisher.rPush(key, value)
  } catch (error) {
    logger.error('Failed to push to list:', error)
    throw error
  }
}

export default {
  publish,
  subscribe,
  rPush
}
