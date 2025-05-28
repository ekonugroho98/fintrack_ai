import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  // Authentication
  AUTH_FOLDER: process.env.AUTH_FOLDER || 'auth',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Message handling
  MESSAGE_TIMEOUT: parseInt(process.env.MESSAGE_TIMEOUT) || 30000,
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
  
  // Rate limiting
  RATE_LIMIT: {
    MAX_MESSAGES: parseInt(process.env.MAX_MESSAGES) || 10,
    WINDOW_MS: parseInt(process.env.RATE_WINDOW_MS) || 60000
  },
  
  // Redis
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT) || 6379,
    PASSWORD: process.env.REDIS_PASSWORD || '',
  },
  
  // AI Service
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  AI_SERVICE_API_KEY: process.env.AI_SERVICE_API_KEY || '',
  
  // Monitoring
  ENABLE_METRICS: process.env.ENABLE_METRICS === 'true',
  METRICS_PORT: parseInt(process.env.METRICS_PORT) || 9090
}; 