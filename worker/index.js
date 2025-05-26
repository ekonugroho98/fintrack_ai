import redisClient from './utils/redis.js';
import processText from './processor/processText.js';
import processImage from './processor/processImage.js';
import processVoice from './processor/processVoice.js';
import './healthServer.js'; // menjalankan health endpoint di background
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { startRetryWorker } from './utils/retryWorker.js';

dotenv.config();
startRetryWorker(); // interval default: 60 detik

try {
    await redisClient.connect();
    logger.info('Worker listening for messages...');

    // Subscribe to Redis channel
    await redisClient.subscribe('incoming-message', async (message) => {
        try {
            const payload = JSON.parse(message);
            const { type, data } = payload;

            logger.info({
                event: 'received_message',
                type,
                from: data?.from
            });

            switch (type) {
                case 'text':
                    await processText(data);
                    break;
                case 'image':
                    await processImage(data);
                    break;
                case 'voice':
                    await processVoice(data);
                    break;
                default:
                    logger.warn({
                        event: 'unknown_message_type',
                        type
                    });
            }
        } catch (error) {
            logger.error({
                event: 'message_processing_error',
                error: error.message,
                stack: error.stack
            });
        }
    });
} catch (error) {
    logger.error({
        event: 'worker_startup_error',
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
}
