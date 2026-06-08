/**
 * @fileoverview Unified application error handling.
 * Provides a consistent error hierarchy for API routes, ensuring
 * uniform HTTP status codes, error codes, and user-facing messages.
 *
 * @typedef {'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
 *   | 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'INTERNAL'} ErrorCode
 */

const STATUS_MAP = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {string} message
   * @param {object} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_MAP[code] || 500;
    this.extra = extra;
  }

  toJSON() {
    return { success: false, code: this.code, message: this.message, ...this.extra };
  }
}

export function badRequest(message, extra) {
  return new AppError('BAD_REQUEST', message, extra);
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError('UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return new AppError('FORBIDDEN', message);
}

export function notFound(message = 'Not found') {
  return new AppError('NOT_FOUND', message);
}

export function conflict(message, extra) {
  return new AppError('CONFLICT', message, extra);
}

export function payloadTooLarge(message = 'Payload too large', extra) {
  return new AppError('PAYLOAD_TOO_LARGE', message, extra);
}

export function rateLimited(message = 'Rate limit exceeded') {
  return new AppError('RATE_LIMITED', message);
}

export function internalError(message = 'Internal server error') {
  return new AppError('INTERNAL', message);
}

/**
 * Wraps a route handler to catch AppError and normalise responses.
 * @param {(req: Request, env: object, ctx: object) => Promise<Response>} handler
 * @returns {(req: Request, env: object, ctx: object) => Promise<Response>}
 */
export function withErrorHandling(handler) {
  return async (req, env, ctx) => {
    try {
      return await handler(req, env, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return Response.json(err.toJSON(), { status: err.status });
      }
      console.error('Unhandled route error:', err);
      return Response.json(
        { success: false, code: 'INTERNAL', message: 'Internal server error' },
        { status: 500 },
      );
    }
  };
}
