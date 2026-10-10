import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import config from '../config';

interface JwtPayload {
  id: number;
  email: string;
  tenantId: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Verifies Bearer token and attaches decoded payload to req.user.
// No database call — all needed data is in the JWT payload.
async function jwtCheck(req: Request, res: Response, next: NextFunction): Promise<any> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      tenantId: decoded.tenantId,
      isAdmin: decoded.isAdmin === true,
    };
    next();
  } catch {
    // 401, not 403: the token is expired or unverifiable, so the client must
    // sign in again. 403 is reserved for a VALID session that lacks permission
    // (see requireAdmin) — the frontend signs the user out on 401 only, so a
    // 403 here would strand them on a dead session.
    return res.status(401).json({ message: 'Session expired — please sign in again' });
  }
}

// Place AFTER jwtCheck on any route that should be admin-only.
// Returns 403 when the JWT did not carry isAdmin=true. The flag is set at
// signup / seed (see backend/prisma/seed.ts) and rides every subsequent
// token issued by the login endpoint.
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<any> {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

export default { jwtCheck, requireAdmin };
