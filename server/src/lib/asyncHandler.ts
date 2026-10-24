import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 types widen `req.params` values to `string | string[]` because
 * `*splat` wildcards yield arrays. Our routes only use named `:param`
 * segments, which are always single strings, so handlers see string params.
 */
type RouteRequest = Request<Record<string, string>>;

/** Wrap an async route handler so rejected promises are forwarded to next(). */
export function asyncHandler(
  fn: (req: RouteRequest, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req as RouteRequest, res, next).catch(next);
  };
}
