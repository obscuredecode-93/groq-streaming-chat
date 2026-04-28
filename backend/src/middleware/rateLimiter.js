import { config } from '../config/index.js';

// ip -> { count: number, resetAt: number }
const requestMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestMap.entries()) {
    if (now > record.resetAt) requestMap.delete(ip);
  }
}, 5 * 60 * 1000);

export function rateLimiter() {
  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const now = Date.now();
    const record = requestMap.get(ip);

    if (!record || now > record.resetAt) {
      requestMap.set(ip, { count: 1, resetAt: now + config.rateLimitWindow });
    } else if (record.count >= config.rateLimitMax) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        { error: `Rate limit exceeded. Max ${config.rateLimitMax} requests per minute.`, retryAfter },
        429
      );
    } else {
      record.count++;
    }

    await next();
  };
}
