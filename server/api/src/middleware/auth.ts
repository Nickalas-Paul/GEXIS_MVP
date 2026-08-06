import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  id: string;
  email: string;
  subscriptionTier: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'JWT_ACCESS_SECRET is not configured' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as AccessTokenPayload;
    if (!decoded?.id || !decoded?.email) {
      res.status(401).json({ error: 'Invalid access token payload' });
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      subscriptionTier: decoded.subscriptionTier,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
