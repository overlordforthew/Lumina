/**
 * Simple in-memory rate limiter middleware factory.
 * @param {object} opts
 * @param {number} opts.windowMs  - Time window in milliseconds
 * @param {number} opts.max       - Max requests per window per IP
 * @param {string} [opts.message] - Error message to return
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Periodic cleanup to prevent memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now > entry.resetAt) hits.delete(ip);
    }
  }, windowMs);
  cleanupInterval.unref(); // Don't keep process alive for cleanup

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      hits.set(ip, entry);
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Too many requests, please try again later'
      });
    }

    next();
  };
}

module.exports = rateLimit;
