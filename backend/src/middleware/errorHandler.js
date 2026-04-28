export function errorHandler() {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      console.error('[Error]', err.message);
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal server error';
      return c.json({ error: message }, status);
    }
  };
}
