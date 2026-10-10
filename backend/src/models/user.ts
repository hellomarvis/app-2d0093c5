import { prisma } from '../lib/prisma';

async function createUser(data: { email: string; password: string; tenantId: string; displayName?: string; role?: string }) {
  return prisma.user.create({ data });
}

async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

async function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

async function updatePassword(id: number, password: string) {
  return prisma.user.update({ where: { id }, data: { password } });
}

/** Tenant-scoped list of users (password never selected). */
async function listByTenant(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      tenantId: true,
      isAdmin: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function updateRole(id: number, role: 'admin' | 'professional' | 'developer') {
  return prisma.user.update({ where: { id }, data: { role, isAdmin: role === 'admin' } });
}

async function updateStatus(id: number, status: 'active' | 'suspended') {
  return prisma.user.update({ where: { id }, data: { status } });
}

/** Store a fresh reset token hash; replaces (and so invalidates) any earlier one. */
async function setPasswordResetToken(id: number, tokenHash: string, expiresAt: Date) {
  return prisma.user.update({
    where: { id },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
  });
}

async function getUserByPasswordResetTokenHash(tokenHash: string) {
  return prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
}

/** Set the new password and burn the reset token in one write. */
async function resetPassword(id: number, password: string) {
  return prisma.user.update({
    where: { id },
    data: { password, passwordResetTokenHash: null, passwordResetExpiresAt: null },
  });
}

export default {
  createUser,
  getUserByEmail,
  getUserById,
  updatePassword,
  listByTenant,
  updateRole,
  updateStatus,
  setPasswordResetToken,
  getUserByPasswordResetTokenHash,
  resetPassword,
};
