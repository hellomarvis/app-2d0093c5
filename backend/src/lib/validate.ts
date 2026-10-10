import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

// Request validation middleware factory used by all generated routes.
// Parses and coerces body/params/query with Zod; returns a consistent
// { message, issues } error shape on failure.
function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Validation failed', issues: error.issues });
        return;
      }
      next(error);
    }
  };
}

export default validate;
