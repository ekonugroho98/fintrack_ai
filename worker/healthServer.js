import express from 'express';
import redisClient from './utils/redis.js';
import apiClient from './utils/apiClient.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.WORKER_PORT || 3100;

app.get('/status', async (req, res) => {
  const redisStatus = redisClient.getStatus();
  const aiServiceStatus = apiClient.getStatus();

  res.json({
    status: 'ok',
    redis: redisStatus,
    aiService: aiServiceStatus
  });
});

app.listen(PORT, () => {
  logger.info(`🔍 Health check server running on port ${PORT}`);
});
