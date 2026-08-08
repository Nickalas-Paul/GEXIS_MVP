import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  id: string;
  email: string;
  subscriptionTier: string;
}

/**
 * Soft auth: attach req.user when a valid Bearer token is present.
 * Missing or invalid tokens leave req.user undefined and still call next().
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = undefined;
    next();
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    req.user = undefined;
    next();
    return;
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    req.user = undefined;
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as AccessTokenPayload;
    if (!decoded?.id || !decoded?.email) {
      req.user = undefined;
      next();
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      subscriptionTier: decoded.subscriptionTier,
    };
    next();
  } catch {
    req.user = undefined;
    next();
  }
}