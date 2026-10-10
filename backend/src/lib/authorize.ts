import { Request, Response, NextFunction } from 'express';

// Minimal role guard for domain routes that should be admin-only.
// Compose after middleware.jwtCheck:
//   router.delete('/:id', jwtCheck, requireAdmin, handler);
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
}

export default { requireAdmin };
