import { logger } from './logger.js';

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failures = 0;
    this.lastFailureTime = null;
    this.isOpen = false;
    this.serviceName = options.serviceName || 'unknown';
  }

  async execute(fn) {
    if (this.isOpen) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        logger.info(`Circuit breaker for ${this.serviceName} is resetting`);
        this.isOpen = false;
        this.failures = 0;
      } else {
        throw new Error(`Circuit breaker for ${this.serviceName} is open`);
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.failureThreshold) {
        this.isOpen = true;
        logger.error(`Circuit breaker for ${this.serviceName} opened due to ${this.failures} failures`);
      }
      
      throw error;
    }
  }

  getStatus() {
    return {
      isOpen: this.isOpen,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      serviceName: this.serviceName
    };
  }
}

export default CircuitBreaker; 