/**
 * Seed script — runs after every `prisma db push` / `prisma migrate deploy`
 * to guarantee a single admin user exists. Idempotent (upsert keyed on
 * email), safe to run on every deploy.
 *
 * Email defaults to `admin@<APP_SLUG>.app` when APP_SLUG env var is set
 * (build pipeline injects this); otherwise falls back to `admin@app.local`.
 * Password is plain `admin123` (hashed at rest with bcrypt). Override
 * either via env var when needed.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function deriveEmail(): string {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  const slug = (process.env.APP_SLUG ?? 'app')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '') || 'app';
  return `admin@${slug}.app`;
}

async function main() {
  const email = deriveEmail();
  const plainPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  const password = await bcrypt.hash(plainPassword, 10);
  const tenantId = process.env.ADMIN_TENANT_ID ?? 'default';

  const admin = await prisma.user.upsert({
    where: { email },
    update: { isAdmin: true },
    create: { email, password, tenantId, isAdmin: true },
  });

  console.log(`[seed] Admin user ready: ${admin.email} (id=${admin.id})`);

  // Give the seeded admin a real workspace identity (role/displayName default
  // on the User model otherwise), without touching the frozen upsert above.
  await prisma.user.update({ where: { id: admin.id }, data: { displayName: 'Sam Patel', role: 'admin' } });

  // ── Domain demo data (idempotent) ──────────────────────────────────────
  const demoUsers = [
    { email: 'maya.chen@nexusai.app', displayName: 'Maya Chen', role: 'professional' },
    { email: 'jordan.lee@nexusai.app', displayName: 'Jordan Lee', role: 'developer' },
  ];
  const demoPassword = await bcrypt.hash('demo12345', 10);
  const [maya, jordan] = await Promise.all(
    demoUsers.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: { displayName: u.displayName, role: u.role },
        create: { email: u.email, password: demoPassword, tenantId, displayName: u.displayName, role: u.role },
      }),
    ),
  );

  const channelSeeds = [
    {
      name: 'product-launch',
      purpose: 'Coordinate launch decisions, assets, and customer communication.',
      members: [maya, jordan, admin],
      messages: [
        { user: maya, body: 'The updated launch brief is in Drive. Please review the rollout sequence.' },
        { user: jordan, body: 'The repository analysis found one release dependency we should resolve first.' },
      ],
    },
    {
      name: 'platform-engineering',
      purpose: 'Review architecture, repository health, and release readiness.',
      members: [jordan, admin],
      messages: [{ user: jordan, body: 'Repository analysis flagged a dependency bump on integration-core before release.' }],
    },
  ];

  for (const seed of channelSeeds) {
    const existing = await prisma.channel.findFirst({ where: { tenantId, name: seed.name } });
    const channel =
      existing ??
      (await prisma.channel.create({
        data: {
          tenantId,
          name: seed.name,
          purpose: seed.purpose,
          createdById: seed.members[0].id,
          createdByName: seed.members[0].displayName,
          members: {
            create: seed.members.map((m, i) => ({ userId: m.id, memberDisplayName: m.displayName, isOwner: i === 0 })),
          },
          messages: { create: seed.messages.map((m) => ({ authorId: m.user.id, authorDisplayName: m.user.displayName, body: m.body })) },
        },
      }));
    if (existing) {
      for (const [i, m] of seed.members.entries()) {
        await prisma.channelMember
          .create({ data: { channelId: channel.id, userId: m.id, memberDisplayName: m.displayName, isOwner: i === 0 } })
          .catch(() => undefined);
      }
    }
  }

  const repoSeeds = [
    {
      userId: jordan.id,
      repoOwnerName: jordan.displayName,
      repoName: 'nexus-web',
      repoDescription: 'Primary web client for the NexusAI workspace experience.',
      status: 'complete',
      codeSummary: 'React + TypeScript client implementing the channel, inbox, and AI assistant surfaces.',
      architectureText: 'Feature-folder structure with a shared component layer and permission-aware routing.',
      dependenciesText: 'Routing, State layer, Realtime client, Source adapters',
      potentialIssues: [{ title: 'Unpinned realtime client dependency', severity: 'Medium', explanation: 'Could cause version drift between environments.' }],
    },
    {
      userId: jordan.id,
      repoOwnerName: jordan.displayName,
      repoName: 'integration-core',
      repoDescription: 'Shared service layer powering third-party integrations and sync jobs.',
      status: 'complete',
      codeSummary: 'Brokers API calls to connected providers behind a single permission-checked interface.',
      architectureText: 'Adapter pattern per provider with a shared outbound queue.',
      dependenciesText: 'Queue worker, Auth broker, Webhook listener',
      potentialIssues: [{ title: 'GitHub adapter retries without backoff', severity: 'Low', explanation: 'Can trip provider rate limits during bulk analysis.' }],
    },
  ];
  for (const r of repoSeeds) {
    const existing = await prisma.repositoryAnalysis.findFirst({ where: { userId: r.userId, repoName: r.repoName } });
    if (!existing) {
      await prisma.repositoryAnalysis.create({
        data: { ...r, requestedByName: jordan.displayName, completedAt: new Date() },
      });
    }
  }

  const integrationSeeds = ['Gmail', 'Slack', 'Google Drive', 'Google Docs', 'Google Sheets', 'GitHub', 'Instagram', 'Facebook'];
  for (const serviceName of integrationSeeds) {
    await prisma.integrationSetting.upsert({
      where: { tenantId_serviceName: { tenantId, serviceName } },
      update: {},
      create: { tenantId, serviceName, isEnabled: true, updatedByName: 'Sam Patel' },
    });
  }

  console.log('[seed] Domain demo data ready (channels, repositories, integrations).');
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
