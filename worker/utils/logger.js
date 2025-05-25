import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  },
  serializers: {
    err: (err) => {
      if (err instanceof Error) {
        return {
          type: err.constructor.name,
          message: err.message,
          stack: err.stack,
          ...(err.status && { status: err.status })
        };
      }
      return err;
    }
  }
});

export { logger }; 