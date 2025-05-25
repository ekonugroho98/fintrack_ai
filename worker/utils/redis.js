import { createClient } from 'redis';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import memoryCache from './memoryCache.js';
import CircuitBreaker from './circuitBreaker.js';

dotenv.config();

class RedisClient {
  constructor() {
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000;
    this.connectionPromise = null;
    this.circuitBreaker = new CircuitBreaker({
      serviceName: 'redis',
      failureThreshold: 5,
      resetTimeout: 60000
    });
  }

  async connect() {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
        const REDIS_PORT = process.env.REDIS_PORT || '6379';
        const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
        
        const REDIS_URL = REDIS_PASSWORD 
          ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
          : `redis://${REDIS_HOST}:${REDIS_PORT}`;

        logger.info(`Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
        
        // Create separate clients for subscriber and publisher
        this.subscriber = createClient({ 
          url: REDIS_URL,
          socket: {
            connectTimeout: 10000,
            reconnectStrategy: (retries) => {
              if (retries > this.maxRetries) {
                logger.error('Max Redis reconnection attempts reached');
                return new Error('Max retries reached');
              }
              const delay = Math.min(retries * 1000, 10000);
              logger.info(`Redis reconnecting in ${delay}ms...`);
              return delay;
            }
          }
        });

        this.publisher = createClient({
          url: REDIS_URL,
          socket: {
            connectTimeout: 10000,
            reconnectStrategy: (retries) => {
              if (retries > this.maxRetries) {
                logger.error('Max Redis reconnection attempts reached');
                return new Error('Max retries reached');
              }
              const delay = Math.min(retries * 1000, 10000);
              logger.info(`Redis reconnecting in ${delay}ms...`);
              return delay;
            }
          }
        });

        // Set up event handlers for subscriber
        this.subscriber.on('error', (err) => {
          logger.error('Redis subscriber error:', err.message);
          this.isConnected = false;
          this.connectionPromise = null;
        });

        this.subscriber.on('connect', () => {
          logger.info('Successfully connected to Redis (subscriber)');
          this.isConnected = true;
          this.retryCount = 0;
        });

        this.subscriber.on('end', () => {
          logger.warn('Redis subscriber connection ended');
          this.isConnected = false;
          this.connectionPromise = null;
        });

        this.subscriber.on('reconnecting', () => {
          logger.info('Redis subscriber reconnecting...');
          this.isConnected = false;
        });

        // Set up event handlers for publisher
        this.publisher.on('error', (err) => {
          logger.error('Redis publisher error:', err.message);
          this.isConnected = false;
          this.connectionPromise = null;
        });

        this.publisher.on('connect', () => {
          logger.info('Successfully connected to Redis (publisher)');
          this.isConnected = true;
          this.retryCount = 0;
        });

        this.publisher.on('end', () => {
          logger.warn('Redis publisher connection ended');
          this.isConnected = false;
          this.connectionPromise = null;
        });

        this.publisher.on('reconnecting', () => {
          logger.info('Redis publisher reconnecting...');
          this.isConnected = false;
        });

        // Connect both clients
        await Promise.all([
          this.subscriber.connect(),
          this.publisher.connect()
        ]);

        resolve();
      } catch (err) {
        logger.error('Failed to connect to Redis:', err.message);
        this.isConnected = false;
        this.connectionPromise = null;
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  async ensureConnection() {
    if (!this.isConnected) {
      logger.info('Redis not connected, attempting to connect...');
      await this.connect();
    }
    return this.isConnected;
  }

  async subscribe(channel, callback) {
    try {
      // Ensure connection before proceeding
      if (!await this.ensureConnection()) {
        throw new Error('Redis not connected');
      }

      // Use Promise.race to add timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis operation timeout')), 5000)
      );

      const result = await Promise.race([
        this.circuitBreaker.execute(async () => {
          try {
            await this.subscriber.subscribe(channel, (message) => {
              logger.debug(`Received message from channel ${channel}:`, message);
              callback(message);
            });
            logger.info(`Subscribed to channel ${channel}`);
          } catch (redisError) {
            logger.error(`Redis SUBSCRIBE operation failed:`, redisError);
            throw redisError;
          }
        }),
        timeout
      ]);

      return result;
    } catch (err) {
      logger.error(`Failed to subscribe to channel ${channel}:`, {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  async publish(channel, message) {
    try {
      // Ensure connection before proceeding
      if (!await this.ensureConnection()) {
        throw new Error('Redis not connected');
      }

      // Use Promise.race to add timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis operation timeout')), 5000)
      );

      const result = await Promise.race([
        this.circuitBreaker.execute(async () => {
          try {
            const publishResult = await this.publisher.publish(channel, message);
            logger.debug(`Redis PUBLISH result for ${channel}:`, publishResult);
            return publishResult;
          } catch (redisError) {
            logger.error(`Redis PUBLISH operation failed:`, redisError);
            throw redisError;
          }
        }),
        timeout
      ]);

      logger.info(`Published message to channel ${channel}`);
      return result;
    } catch (err) {
      logger.error(`Failed to publish to channel ${channel}:`, {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  async setLastTransaction(phoneNumber, transaction) {
    const key = `last_transaction:${phoneNumber}`;
    
    try {
      // Ensure connection before proceeding
      if (!await this.ensureConnection()) {
        throw new Error('Redis not connected');
      }

      // Validate transaction data
      if (!transaction || typeof transaction !== 'object') {
        throw new Error('Invalid transaction data');
      }

      // Log the transaction data for debugging
      logger.debug(`Setting transaction for ${phoneNumber}:`, {
        key,
        transaction: JSON.stringify(transaction)
      });

      // Try to stringify the transaction first to catch any JSON errors
      const transactionJson = JSON.stringify(transaction);

      // Use Promise.race to add timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis operation timeout')), 5000)
      );

      try {
        const result = await Promise.race([
          this.circuitBreaker.execute(async () => {
            try {
              const setResult = await this.publisher.set(key, transactionJson, {
                EX: 60 * 60 * 24 // TTL 24 jam
              });
              logger.debug(`Redis SET result for ${key}:`, setResult);
              return setResult;
            } catch (redisError) {
              logger.error(`Redis SET operation failed:`, redisError);
              throw redisError;
            }
          }),
          timeout
        ]);
        
        if (result !== 'OK') {
          throw new Error(`Redis SET failed with result: ${result}`);
        }

        logger.info(`Saved last transaction for ${phoneNumber} to Redis`);
      } catch (operationError) {
        logger.error(`Redis operation failed for ${phoneNumber}:`, {
          error: operationError.message,
          stack: operationError.stack
        });
        throw operationError;
      }
    } catch (err) {
      const errorMessage = err.message || 'Unknown error';
      const errorStack = err.stack || '';
      
      if (err instanceof SyntaxError) {
        logger.error(`JSON error for ${phoneNumber}:`, {
          message: errorMessage,
          stack: errorStack
        });
      } else {
        logger.warn(`Redis failed for ${phoneNumber}, using memory cache. Error:`, {
          message: errorMessage,
          stack: errorStack
        });
      }
      
      // Log the transaction data that failed to be saved
      logger.debug(`Failed transaction data:`, {
        phoneNumber,
        transaction: JSON.stringify(transaction)
      });
      
      memoryCache.set(key, transaction);
    }
  }

  async getLastTransaction(phoneNumber) {
    const key = `last_transaction:${phoneNumber}`;
    
    try {
      // Ensure connection before proceeding
      if (!await this.ensureConnection()) {
        throw new Error('Redis not connected');
      }

      // Use Promise.race to add timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis operation timeout')), 5000)
      );

      try {
        const data = await Promise.race([
          this.circuitBreaker.execute(async () => {
            try {
              const result = await this.publisher.get(key);
              logger.debug(`Redis GET result for ${key}:`, result);
              return result;
            } catch (redisError) {
              logger.error(`Redis GET operation failed:`, redisError);
              throw redisError;
            }
          }),
          timeout
        ]);
        
        if (!data) return null;

        try {
          return JSON.parse(data);
        } catch (parseError) {
          logger.error(`JSON parse error for ${phoneNumber}:`, {
            message: parseError.message,
            stack: parseError.stack,
            data
          });
          return null;
        }
      } catch (operationError) {
        logger.error(`Redis operation failed for ${phoneNumber}:`, {
          error: operationError.message,
          stack: operationError.stack
        });
        throw operationError;
      }
    } catch (err) {
      const errorMessage = err.message || 'Unknown error';
      const errorStack = err.stack || '';
      
      logger.warn(`Redis failed for ${phoneNumber}, checking memory cache. Error:`, {
        message: errorMessage,
        stack: errorStack
      });
      
      return memoryCache.get(key);
    }
  }

  async deleteLastTransaction(phoneNumber) {
    const key = `last_transaction:${phoneNumber}`;
    
    try {
      // Ensure connection before proceeding
      if (!await this.ensureConnection()) {
        throw new Error('Redis not connected');
      }

      // Use Promise.race to add timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis operation timeout')), 5000)
      );

      const result = await Promise.race([
        this.circuitBreaker.execute(async () => {
          try {
            const delResult = await this.publisher.del(key);
            logger.debug(`Redis DEL result for ${key}:`, delResult);
            return delResult;
          } catch (redisError) {
            logger.error(`Redis DEL operation failed:`, redisError);
            throw redisError;
          }
        }),
        timeout
      ]);

      if (result !== 1) {
        throw new Error(`Redis DEL failed with result: ${result}`);
      }
      
      logger.info(`Deleted last transaction for ${phoneNumber} from Redis`);
    } catch (err) {
      const errorMessage = err.message || 'Unknown error';
      const errorStack = err.stack || '';
      
      logger.warn(`Redis failed for ${phoneNumber}, deleting from memory cache. Error:`, {
        message: errorMessage,
        stack: errorStack
      });
      
      memoryCache.delete(key);
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      retryCount: this.retryCount,
      circuitBreaker: this.circuitBreaker.getStatus(),
      memoryCacheSize: memoryCache.getSize()
    };
  }
}

// Export singleton instance
const redisClient = new RedisClient();
export default redisClient;
