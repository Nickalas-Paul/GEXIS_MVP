import { Request, Response, NextFunction } from 'express';

type Validator = (body: Record<string, unknown>) => string | null;

export function validateBody(validator: Validator) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const error = validator((req.body ?? {}) as Record<string, unknown>);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    next();
  };
}

export function requireFields(...fields: string[]): Validator {
  return (body) => {
    for (const field of fields) {
      const value = body[field];
      if (value === undefined || value === null || value === '') {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  };
}
