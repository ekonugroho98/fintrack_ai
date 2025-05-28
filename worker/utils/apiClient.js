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

  async retry(fn, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (error.message.includes('404')) {
          // Jika 404, langsung throw karena endpoint memang tidak ada
          throw error;
        }
        // Tunggu sebelum retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw lastError;
  }

  async processText(text, phoneNumber) {
    return this.retry(async () => {
      try {
        const url = `${this.baseUrl}/api/process_text`;
        logger.info({
          event: 'api_request',
          method: 'POST',
          url,
          endpoint: '/api/process_text',
          phoneNumber
        });

        const response = await fetch(url, {
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
        const url = `${this.baseUrl}/api/consult`;
        logger.info({
          event: 'api_request',
          method: 'POST',
          url,
          endpoint: '/api/consult',
          phone_number
        });

        const response = await fetch(url, {
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
        const url = `${this.baseUrl}/api/process_image`;
        logger.info({
          event: 'api_request',
          method: 'POST',
          url,
          endpoint: '/api/process_image',
          phoneNumber,
          hasCaption: !!caption
        });

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Create form data
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg');
        formData.append('phone_number', phoneNumber);
        if (caption) {
          formData.append('caption', caption);
        }

        const response = await fetch(url, {
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
      const url = `${this.baseUrl}/api/process_voice`;
      logger.info({
        event: 'api_request',
        method: 'POST',
        url,
        endpoint: '/api/process_voice',
        phoneNumber
      });

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

      const response = await fetch(url, {
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

  async detectIntent(data) {
    return this.retry(async () => {
      const url = `${this.baseUrl}/api/intent/detect`;
      logger.info({
        event: 'api_request',
        method: 'POST',
        url,
        endpoint: '/api/intent/detect',
        phone_number: data.phone_number,
        text_length: data.text?.length
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          text: data.text,
          phone_number: data.phone_number
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({
          event: 'intent_detection_api_error',
          status: response.status,
          error: errorData
        });
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      logger.info({
        event: 'intent_detection_success',
        result
      });
      return result;
    });
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      logger.error({
        event: 'ai_service_health_check_failed',
        error: error.message
      });
      return false;
    }
  }
}

export default new ApiClient(); 