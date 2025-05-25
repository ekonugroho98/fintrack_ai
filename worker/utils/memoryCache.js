import { logger } from './logger.js';

class MemoryCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.maxSize = options.maxSize || 1000;
  }

  set(key, value, ttl = this.ttl) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry if cache is full
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      logger.warn(`Cache full, removed oldest entry: ${oldestKey}`);
    }

    const expiry = Date.now() + ttl;
    this.cache.set(key, {
      value,
      expiry
    });
    logger.debug(`Cached value for key: ${key}`);
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
    logger.debug(`Deleted cache for key: ${key}`);
  }

  clear() {
    this.cache.clear();
    logger.info('Memory cache cleared');
  }

  getSize() {
    return this.cache.size;
  }
}

export default new MemoryCache(); 