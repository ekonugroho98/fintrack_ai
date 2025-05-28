import { logger } from '../utils/logger.js';

class MiddlewareManager {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middlewares.push(middleware);
    return this;
  }

  async processMessage(msg, sock) {
    const context = {
      msg,
      sock,
      state: {},
      next: async () => {},
    };

    // Create middleware chain
    const chain = this.middlewares.reduceRight((next, middleware) => {
      return async () => {
        try {
          await middleware(context, next);
        } catch (error) {
          logger.error({
            event: 'middleware_error',
            error: error.message,
            stack: error.stack
          });
          throw error;
        }
      };
    }, async () => {});

    context.next = chain;
    await chain();
    return context;
  }
}

export const middlewareManager = new MiddlewareManager(); 