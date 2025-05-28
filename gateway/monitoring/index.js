import prometheus from 'prom-client';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

// Initialize Prometheus metrics
const messageCounter = new prometheus.Counter({
  name: 'whatsapp_messages_total',
  help: 'Total number of messages processed',
  labelNames: ['type']
});

const messageProcessingTime = new prometheus.Histogram({
  name: 'whatsapp_message_processing_seconds',
  help: 'Time spent processing messages',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const activeUsers = new prometheus.Gauge({
  name: 'whatsapp_active_users',
  help: 'Number of active users in the last hour'
});

const errorCounter = new prometheus.Counter({
  name: 'whatsapp_errors_total',
  help: 'Total number of errors',
  labelNames: ['type']
});

// Metrics server
let metricsServer = null;

export function startMetricsServer() {
  if (!CONFIG.ENABLE_METRICS) return;

  const express = require('express');
  const app = express();

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', prometheus.register.contentType);
      res.end(await prometheus.register.metrics());
    } catch (error) {
      logger.error({
        event: 'metrics_error',
        error: error.message
      });
      res.status(500).end();
    }
  });

  metricsServer = app.listen(CONFIG.METRICS_PORT, () => {
    logger.info({
      event: 'metrics_server_started',
      port: CONFIG.METRICS_PORT
    });
  });
}

export function stopMetricsServer() {
  if (metricsServer) {
    metricsServer.close();
    metricsServer = null;
  }
}

export const metrics = {
  incrementMessage: (type) => messageCounter.inc({ type }),
  observeProcessingTime: (type, duration) => messageProcessingTime.observe({ type }, duration),
  setActiveUsers: (count) => activeUsers.set(count),
  incrementError: (type) => errorCounter.inc({ type })
}; 