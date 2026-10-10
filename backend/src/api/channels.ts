import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { handlePrismaError } from '../lib/handleError';
import { IntegrationNotConfiguredError, handleSeamError } from '../lib/integrationSeam';
import { generateText, TextGenError } from '../custom/capabilities/textGen';

async function membership(channelId: number, userId: number) {
  return prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId } } });
}

async function loadChannel(req: Request, res: Response): Promise<any | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: 'Invalid channel id' });
    return null;
  }
  const channel = await prisma.channel.findFirst({ where: { id, tenantId: req.user!.tenantId } });
  if (!channel) {
    res.status(404).json({ message: 'Channel not found' });
    return null;
  }
  return channel;
}

// GET /api/channels — channels the user belongs to (admin sees every channel)
async function listChannels(req: Request, res: Response): Promise<any> {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const base = req.user!.isAdmin
      ? { tenantId: req.user!.tenantId }
      : { tenantId: req.user!.tenantId, members: { some: { userId: req.user!.id } } };
    const where = includeArchived ? base : { ...base, isArchived: false };
    const channels = await prisma.channel.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: { lastMessageAt: 'desc' },
    });
    return res.json(
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        purpose: c.purpose,
        type: c.type,
        isArchived: c.isArchived,
        memberCount: c._count.members,
        lastMessageAt: c.lastMessageAt,
        createdByName: c.createdByName,
      })),
    );
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// POST /api/channels { name, purpose }
async function createChannel(req: Request, res: Response): Promise<any> {
  const { name, purpose } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 40) {
    return res.status(400).json({ message: 'Channel name must be 2-40 characters' });
  }
  if (purpose !== undefined && (typeof purpose !== 'string' || purpose.length > 200)) {
    return res.status(400).json({ message: 'Purpose must be 200 characters or fewer' });
  }

  try {
    const existing = await prisma.channel.findFirst({
      where: { tenantId: req.user!.tenantId, isArchived: false, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) return res.status(409).json({ message: 'A channel with that name already exists.' });

    const channel = await prisma.channel.create({
      data: {
        tenantId: req.user!.tenantId,
        name: name.trim(),
        purpose: purpose?.trim() ?? '',
        createdById: req.user!.id,
        createdByName: req.user!.email,
        members: { create: { userId: req.user!.id, memberDisplayName: req.user!.email, isOwner: true } },
      },
    });
    return res.status(201).json(channel);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

async function getChannel(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  if (!req.user!.isAdmin) {
    const member = await membership(channel.id, req.user!.id);
    if (!member) return res.status(403).json({ message: "You don't have access to this channel." });
  }
  const members = await prisma.channelMember.findMany({ where: { channelId: channel.id }, orderBy: { joinedAt: 'asc' } });
  const attachments = await prisma.attachment.findMany({ where: { channelId: channel.id }, orderBy: { sharedAt: 'desc' } });
  const creator = await prisma.user.findUnique({ where: { id: channel.createdById } });
  return res.json({ ...channel, members, attachments, creatorDisplayName: creator?.displayName ?? channel.createdByName });
}

// POST /api/channels/direct/:userId — get-or-create a 1:1 direct channel
// between the signed-in user and the given member.
async function openDirectChannel(req: Request, res: Response): Promise<any> {
  const otherId = Number(req.params.userId);
  if (!Number.isInteger(otherId)) return res.status(400).json({ message: 'Invalid user id' });
  if (otherId === req.user!.id) return res.status(400).json({ message: 'Cannot message yourself' });

  const other = await prisma.user.findFirst({ where: { id: otherId, tenantId: req.user!.tenantId } });
  if (!other) return res.status(404).json({ message: 'User not found' });

  const existing = await prisma.channel.findFirst({
    where: {
      tenantId: req.user!.tenantId,
      type: 'direct',
      members: { some: { userId: req.user!.id } },
      AND: [{ members: { some: { userId: otherId } } }],
    },
    include: { members: true },
  });
  if (existing) return res.json(existing);

  const actor = await prisma.user.findUnique({ where: { id: req.user!.id } });
  const created = await prisma.channel.create({
    data: {
      tenantId: req.user!.tenantId,
      type: 'direct',
      name: other.displayName,
      purpose: '',
      createdById: req.user!.id,
      createdByName: actor?.displayName ?? req.user!.email,
      members: {
        create: [
          { userId: req.user!.id, memberDisplayName: actor?.displayName ?? req.user!.email, isOwner: true },
          { userId: other.id, memberDisplayName: other.displayName },
        ],
      },
    },
    include: { members: true },
  });
  return res.status(201).json(created);
}

// PATCH /api/channels/:id { name?, purpose? } — owner or admin only
async function updateChannel(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member?.isOwner) return res.status(403).json({ message: 'Only the channel owner can do that.' });
  if (channel.isArchived) return res.status(409).json({ message: 'This channel is archived.' });

  const { name, purpose } = req.body;
  try {
    if (name !== undefined) {
      const duplicate = await prisma.channel.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          isArchived: false,
          id: { not: channel.id },
          name: { equals: String(name).trim(), mode: 'insensitive' },
        },
      });
      if (duplicate) return res.status(409).json({ message: 'A channel with that name already exists.' });
    }
    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(purpose !== undefined ? { purpose: String(purpose) } : {}) },
    });
    return res.json(updated);
  } catch (error) {
    return handlePrismaError(error, res);
  }
}

// POST /api/channels/:id/archive — owner or admin
async function archiveChannel(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member?.isOwner) return res.status(403).json({ message: 'Only the channel owner can do that.' });

  const updated = await prisma.channel.update({ where: { id: channel.id }, data: { isArchived: true, archivedAt: new Date() } });
  await prisma.moderationAction.create({
    data: {
      tenantId: req.user!.tenantId,
      actionType: 'channel_archived',
      targetLabel: `#${channel.name}`,
      reason: 'Channel archived',
      actedById: req.user!.id,
      actedByName: req.user!.email,
    },
  });
  return res.json(updated);
}

// POST /api/channels/:id/leave
async function leaveChannel(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!member) return res.status(404).json({ message: 'You are not a member of this channel' });
  await prisma.channelMember.delete({ where: { channelId_userId: { channelId: channel.id, userId: req.user!.id } } });
  return res.status(200).json({ message: 'Left channel' });
}

// POST /api/channels/:id/members { userId }
async function inviteMember(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member?.isOwner) return res.status(403).json({ message: 'Only the channel owner can do that.' });

  const userId = Number(req.body.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ message: 'A valid userId is required' });

  const target = await prisma.user.findFirst({ where: { id: userId, tenantId: req.user!.tenantId } });
  if (!target || target.status === 'suspended') return res.status(404).json({ message: 'User not found or unavailable' });

  try {
    const created = await prisma.channelMember.create({
      data: { channelId: channel.id, userId, memberDisplayName: target.displayName },
    });
    return res.status(201).json(created);
  } catch (error) {
    return handlePrismaError(error, res); // unique constraint → 409 already a member
  }
}

// DELETE /api/channels/:id/members/:userId
async function removeMember(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member?.isOwner) return res.status(403).json({ message: 'Only the channel owner can do that.' });

  const userId = Number(req.params.userId);
  const existing = await membership(channel.id, userId);
  if (!existing) return res.status(404).json({ message: 'Member not found in this channel' });

  await prisma.channelMember.delete({ where: { channelId_userId: { channelId: channel.id, userId } } });
  if (req.user!.isAdmin) {
    await prisma.moderationAction.create({
      data: {
        tenantId: req.user!.tenantId,
        actionType: 'member_removed',
        targetLabel: `${existing.memberDisplayName} from #${channel.name}`,
        reason: 'Removed by admin',
        actedById: req.user!.id,
        actedByName: req.user!.email,
      },
    });
  }
  return res.status(200).json({ message: 'Member removed' });
}

// GET /api/channels/:id/messages
async function listMessages(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  if (!req.user!.isAdmin) {
    const member = await membership(channel.id, req.user!.id);
    if (!member) return res.status(403).json({ message: "You don't have access to this channel." });
  }
  const messages = await prisma.message.findMany({ where: { channelId: channel.id }, orderBy: { createdAt: 'asc' }, take: 200 });
  return res.json(
    messages.map((m) => (m.isDeleted ? { ...m, body: 'Message removed' } : m)),
  );
}

// POST /api/channels/:id/messages { body }
async function sendMessage(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member) return res.status(403).json({ message: "You don't have access to this channel." });
  if (channel.isArchived) return res.status(409).json({ message: 'This channel is archived.' });

  const { body } = req.body;
  if (typeof body !== 'string' || body.trim().length === 0) return res.status(400).json({ message: 'Message body is required' });
  if (body.length > 4000) return res.status(400).json({ message: 'Message is too long (4000 character limit)' });

  const message = await prisma.message.create({
    data: { channelId: channel.id, authorId: req.user!.id, authorDisplayName: req.user!.email, body: body.trim() },
  });
  await prisma.channel.update({ where: { id: channel.id }, data: { lastMessageAt: new Date() } });
  return res.status(201).json(message);
}

// DELETE /api/channels/:id/messages/:messageId
async function deleteMessage(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const messageId = Number(req.params.messageId);
  const message = await prisma.message.findFirst({ where: { id: messageId, channelId: channel.id } });
  if (!message) return res.status(404).json({ message: 'Message not found' });
  if (!req.user!.isAdmin && message.authorId !== req.user!.id) {
    return res.status(403).json({ message: 'You can only delete your own messages.' });
  }
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date(), deletedByName: req.user!.email },
  });
  if (req.user!.isAdmin && message.authorId !== req.user!.id) {
    await prisma.moderationAction.create({
      data: {
        tenantId: req.user!.tenantId,
        actionType: 'message_removed',
        targetLabel: `Message in #${channel.name}`,
        reason: 'Removed by admin',
        actedById: req.user!.id,
        actedByName: req.user!.email,
      },
    });
  }
  return res.json({ ...updated, body: 'Message removed' });
}

async function generateSummary(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member) return res.status(403).json({ message: "You don't have access to this channel." });

  const nonDeleted = await prisma.message.count({ where: { channelId: channel.id, isDeleted: false } });
  if (nonDeleted === 0) return res.status(400).json({ message: 'Nothing to summarise yet.' });

  try {
    const messages = await prisma.message.findMany({
      where: { channelId: channel.id, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const transcript = messages
      .map((m) => `${m.authorDisplayName}: ${m.body}`)
      .join('\n');

    const result = await generateText({
      system:
        'You are an expert conversation analyst. Summarize the conversation and respond with a JSON object with exactly these keys: summaryText (string — a concise overall summary), keyInsights (array of strings — key takeaways), keyDecisions (array of strings — decisions made in the conversation). Be concise and accurate.',
      messages: [{ role: 'user', content: `Summarize this conversation from channel #${channel.name}:\n\n${transcript}` }],
      maxTokens: 1500,
    });

    let summaryText = '';
    let keyInsights: string[] = [];
    let keyDecisions: string[] = [];

    try {
      const parsed = JSON.parse(result.content);
      summaryText = typeof parsed.summaryText === 'string' ? parsed.summaryText : result.content;
      keyInsights = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [];
      keyDecisions = Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [];
    } catch {
      summaryText = result.content;
    }

    const actor = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const summary = await prisma.conversationSummary.create({
      data: {
        channelId: channel.id,
        summaryText,
        keyInsights,
        keyDecisions,
        messagesCovered: messages.length,
        generatedById: req.user!.id,
        generatedByName: actor?.displayName ?? req.user!.email,
      },
    });

    await prisma.channel.update({ where: { id: channel.id }, data: { summaryStatus: 'idle' } });

    return res.json(summary);
  } catch (error) {
    if (error instanceof TextGenError) {
      await prisma.channel.update({ where: { id: channel.id }, data: { summaryStatus: 'failed' } });
      return res.status(error.status).json({ message: error.message });
    }
    return handlePrismaError(error, res);
  }
}

// @integration-seam image-gen chat-image
// @integration-seam video-gen chat-video
async function generateMedia(req: Request, res: Response): Promise<any> {
  const channel = await loadChannel(req, res);
  if (!channel) return;
  const member = await membership(channel.id, req.user!.id);
  if (!req.user!.isAdmin && !member) return res.status(403).json({ message: "You don't have access to this channel." });
  if (channel.isArchived) return res.status(409).json({ message: 'This channel is archived.' });

  const { kind, prompt } = req.body;
  if (kind !== 'image' && kind !== 'video') return res.status(400).json({ message: 'kind must be "image" or "video"' });
  if (typeof prompt !== 'string' || prompt.trim().length < 3 || prompt.length > 500) {
    return res.status(400).json({ message: 'Prompt must be 3-500 characters' });
  }

  try {
    throw new IntegrationNotConfiguredError(kind === 'image' ? 'Fal AI' : 'Google AI (Gemini & Veo)');
  } catch (error) {
    if (handleSeamError(error, res)) return;
    return handlePrismaError(error, res);
  }
}

export default {
  listChannels,
  createChannel,
  getChannel,
  openDirectChannel,
  updateChannel,
  archiveChannel,
  leaveChannel,
  inviteMember,
  removeMember,
  listMessages,
  sendMessage,
  deleteMessage,
  generateSummary,
  generateMedia,
};
