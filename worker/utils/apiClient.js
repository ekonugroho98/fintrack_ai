import fetch from 'node-fetch';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import { logger } from './logger.js';
import CircuitBreaker from './circuitBreaker.js';
import { createClient } from 'redis';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

class ApiClient {
  constructor() {
    this.baseUrl = AI_SERVICE_URL;
    this.circuitBreaker = new CircuitBreaker({
      serviceName: 'ai-service',
      failureThreshold: 5,
      resetTimeout: 60000
    });
  }

  async retry(fn, retries = 3, delay = 10000) {
    try {
      return await this.circuitBreaker.execute(fn);
    } catch (error) {
      // Handle rate limiting error
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        const waitTime = delay * 2;
        logger.warn({
          event: 'rate_limit_hit',
          message: `Rate limit hit, waiting ${waitTime}ms before retry`,
          retriesLeft: retries,
          error: error.message
        });
        
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.retry(fn, retries - 1, waitTime);
        }
      }

      if (retries === 0) {
        logger.error({
          event: 'max_retries_exceeded',
          message: 'Maximum retry attempts reached',
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
      
      logger.warn({
        event: 'request_failed',
        message: `Request failed, retrying... (${retries} attempts left)`,
        error: error.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retry(fn, retries - 1, delay * 2);
    }
  }

  async processText(text, phoneNumber) {
    return this.retry(async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/process_expense_keuangan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            phone_number: phoneNumber
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`HTTP ${response.status}: ${errorText}`);
          error.status = response.status;
          throw error;
        }

        const result = await response.json();
        logger.info({
          event: 'text_processed',
          message: 'Text processed successfully',
          phoneNumber,
          textLength: text.length
        });
        
        return result;
      } catch (error) {
        logger.error({
          event: 'text_processing_error',
          message: 'Failed to process text',
          phoneNumber,
          error: error.message,
          status: error.status
        });
        throw error;
      }
    });
  }

  async processConsultation({ message, phone_number }) {
    return this.retry(async () => {
      try {
        logger.info({
          event: 'sending_consultation_request',
          phone_number,
          messageLength: message.length
        });

        const response = await fetch(`${this.baseUrl}/api/consult_keuangan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            phone_number
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error({
            event: 'consultation_request_failed',
            status: response.status,
            error: errorText,
            request: {
              message,
              phone_number
            }
          });
          const error = new Error(`HTTP ${response.status}: ${errorText}`);
          error.status = response.status;
          throw error;
        }

        const result = await response.json();
        logger.info({
          event: 'consultation_processed',
          message: 'Consultation processed successfully',
          phone_number,
          messageLength: message.length,
          response: result
        });
        
        return result;
      } catch (error) {
        logger.error({
          event: 'consultation_processing_error',
          message: 'Failed to process consultation',
          phone_number,
          error: error.message,
          status: error.status,
          request: {
            message,
            phone_number
          }
        });
        throw error;
      }
    });
  }

  async processImage(base64Image, caption, phoneNumber) {
    return this.retry(async () => {
      try {
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Create form data
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
        formData.append('phone_number', phoneNumber);
        if (caption) {
          formData.append('caption', caption);
        }

        logger.info({
          event: 'sending_image_to_ai',
          phoneNumber,
          hasCaption: !!caption
        });

        const response = await fetch(`${this.baseUrl}/api/process_image_expense_keuangan`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`AI service error (${response.status}):`, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        logger.info({
          event: 'image_processed',
          message: 'Image processed successfully',
          phoneNumber
        });

        return result;
      } catch (error) {
        logger.error({
          event: 'image_processing_error',
          message: 'Failed to process image',
          phoneNumber,
          error: error.message
        });
        throw error;
      }
    });
  }

  async processVoice(audioUrl, phoneNumber) {
    return this.retry(async () => {
      // Download audio from URL
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
      }
      const audioBuffer = await audioResponse.buffer();

      // Create form data
      const formData = new FormData();
      formData.append('voice', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.append('phone_number', phoneNumber);

      const response = await fetch(`${this.baseUrl}/api/process_voice_expense_keuangan`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`AI service error (${response.status}):`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    });
  }

  getStatus() {
    return {
      baseUrl: this.baseUrl,
      circuitBreaker: this.circuitBreaker.getStatus()
    };
  }
}

export default new ApiClient(); 