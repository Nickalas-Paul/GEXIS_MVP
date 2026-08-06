import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFields, validateBody } from '../middleware/validate';
import {
  AuthError,
  getClientAuthCallbackUrl,
  getCurrentUser,
  getGoogleAuthUrl,
  handleGoogleCallback,
  login,
  logout,
  refresh,
  register,
} from '../services/auth.service';

const router = Router();

function handleAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[auth] Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

router.post(
  '/register',
  validateBody(requireFields('email', 'password')),
  async (req: Request, res: Response) => {
    try {
      const user = await register(String(req.body.email), String(req.body.password));
      res.status(201).json({ user });
    } catch (err) {
      handleAuthError(res, err);
    }
  }
);

router.post(
  '/login',
  validateBody(requireFields('email', 'password')),
  async (req: Request, res: Response) => {
    try {
      const result = await login(String(req.body.email), String(req.body.password));
      res.json(result);
    } catch (err) {
      handleAuthError(res, err);
    }
  }
);

router.post(
  '/refresh',
  validateBody(requireFields('refreshToken')),
  async (req: Request, res: Response) => {
    try {
      const result = await refresh(String(req.body.refreshToken));
      res.json(result);
    } catch (err) {
      handleAuthError(res, err);
    }
  }
);

router.post(
  '/logout',
  validateBody(requireFields('refreshToken')),
  async (req: Request, res: Response) => {
    try {
      await logout(String(req.body.refreshToken));
      res.json({ success: true });
    } catch (err) {
      handleAuthError(res, err);
    }
  }
);

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req.user!.id);
    res.json({ user });
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/google', (_req: Request, res: Response) => {
  try {
    const url = getGoogleAuthUrl();
    res.redirect(302, url);
  } catch (err) {
    handleAuthError(res, err);
  }
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const result = await handleGoogleCallback(code);
    res.redirect(302, getClientAuthCallbackUrl(result));
  } catch (err) {
    handleAuthError(res, err);
  }
});

export default router;
