import axios from 'axios';
import { logger } from './logger.js';
import { CONFIG } from '../../gateway/config.js';

const aiServiceClient = axios.create({
  baseURL: CONFIG.AI_SERVICE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.AI_SERVICE_API_KEY}`
  }
});

export default {
  async classifyMessage(text, phoneNumber) {
    try {
      const response = await aiServiceClient.post('/api/v1/classify', {
        text,
        phone_number: phoneNumber
      });
      return response.data;
    } catch (error) {
      logger.error({
        event: 'ai_classify_error',
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  },

  async processConsultation(data) {
    try {
      const response = await aiServiceClient.post('/api/v1/consultation', data);
      return response.data;
    } catch (error) {
      logger.error({
        event: 'ai_consultation_error',
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  },

  async processImage(imageData, caption, phoneNumber) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([imageData]), 'receipt.jpg');
      formData.append('phone_number', phoneNumber);
      if (caption) {
        formData.append('caption', caption);
      }

      const response = await aiServiceClient.post('/process_image_expense_keuangan', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      logger.error({
        event: 'ai_image_error',
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  },

  async processVoice(audioData, phoneNumber) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioData]), 'voice.wav');
      formData.append('phone_number', phoneNumber);

      const response = await aiServiceClient.post('/process_voice_expense_keuangan', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      logger.error({
        event: 'ai_voice_error',
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  },

  async getStatus() {
    try {
      const response = await aiServiceClient.get('/health');
      return response.data;
    } catch (error) {
      logger.error({
        event: 'ai_health_check_error',
        error: error.message
      });
      return { status: 'error', error: error.message };
    }
  }
}; 