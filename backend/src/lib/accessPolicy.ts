// Deterministic access-policy helper for domain resources.
//
// scope: 'owner'  → filter by userId + tenantId  (private to the creating user)
//        'tenant' → filter by tenantId            (shared within the org/tenant)
//        'public' → no scoping                    (read-only shared data)
//
// Domain route handlers spread scopeWhere() into every Prisma query so
// ownership rules are enforced consistently without per-route code.

export type AccessScope = 'owner' | 'tenant' | 'public';

export interface AccessContext {
  userId: number;
  tenantId: string;
}

export interface ScopeFilter {
  userId?: number;
  tenantId?: string;
}

export function scopeWhere(scope: AccessScope, ctx: AccessContext): ScopeFilter {
  switch (scope) {
    case 'owner':
      return { userId: ctx.userId, tenantId: ctx.tenantId };
    case 'tenant':
      return { tenantId: ctx.tenantId };
    case 'public':
      return {};
  }
}

export default { scopeWhere };
