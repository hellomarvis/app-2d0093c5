import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Maps Prisma runtime errors to the correct HTTP status + user-readable message.
 * Use this in every async API handler's catch block instead of returning 500.
 *
 * Common codes:
 *   P2002 — unique constraint (duplicate value)     → 409 Conflict
 *   P2003 — foreign key violation (relation missing) → 422 Unprocessable Entity
 *   P2025 — record not found (update/delete target)  → 404 Not Found
 *   P2011 — null constraint violation                → 400 Bad Request
 *   P2007 — data validation error (wrong type)       → 400 Bad Request
 *   PrismaClientValidationError — missing required field or wrong JS type → 400
 */
export function handlePrismaError(err: unknown, res: Response): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        res.status(409).json({ message: 'A record with this value already exists' });
        return;
      case 'P2003':
        res.status(422).json({ message: 'A required related record was not found' });
        return;
      case 'P2025':
        res.status(404).json({ message: 'Record not found' });
        return;
      case 'P2011':
        res.status(400).json({ message: 'A required field is missing' });
        return;
      case 'P2007':
      case 'P2006':
        res.status(400).json({ message: 'Invalid value for one or more fields' });
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    // Wrong JS type passed to Prisma (e.g. string where Int expected)
    res.status(400).json({ message: 'Invalid data: check field types and required fields' });
    return;
  }

  console.error('[handlePrismaError] Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
}
