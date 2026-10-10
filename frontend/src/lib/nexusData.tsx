import * as React from 'react';

// ─────────────────────────────────────────────────────────────────────────
// NexusAI workspace data layer.
//
// This build step is scoped to the FRONTEND only (no backend domain routes
// exist yet / are off-limits for this pass). The approved design itself has
// no backend either — every screen in design-kit/user-approved-landing.html
// drives its state from a client-side script + localStorage. This module is
// the React equivalent: one typed context, seeded with realistic demo data,
// persisted to localStorage so interactions survive a refresh, exposing a
// small action API every page calls instead of reaching for apiClient.
//
// Pages still own their own toasts (sonner) and busy/disabled states; this
// layer only owns data + mutations.
// ─────────────────────────────────────────────────────────────────────────

export type Role = 'Admin' | 'Developer Collaborator' | 'Connected Professional';
export type UserStatus = 'Active' | 'Suspended';

export interface Person {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  role: Role;
  status: UserStatus;
  joinedDate: string;
}

/** The signed-in demo persona every composer/message in this workspace is authored as. */
export const CURRENT_USER = { id: 'alex', displayName: 'Alex Rivera', initials: 'AR' };

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  time: string;
  body: string;
  attachment?: { service: string; title: string } | null;
  media?: { title: string } | null;
}

export interface Channel {
  id: string;
  name: string;
  purpose: string;
  memberIds: string[];
  createdById: string;
  createdDate: string;
  archived: boolean;
  archivedDate: string | null;
  lastMessageTime: string;
  messages: ChatMessage[];
  summaryText: string;
  summarySourceId: string | null;
  insightText: string;
  insightSourceId: string | null;
  summarySavedToDocs: boolean;
  sharedHistory: { title: string; sharedById: string }[];
}

export interface DirectConversation {
  personId: string;
  messages: ChatMessage[];
  sharedDocument: { title: string; service: string } | null;
  docInsight: { action: string; text: string } | null;
}

export interface InboxMessage {
  id: string;
  time: string;
  sender: string;
  body: string;
  incoming: boolean;
  service: 'Gmail' | 'Slack';
}

export interface InboxThread {
  id: string;
  subject: string;
  counterpart: string;
  lastActivity: string;
  messages: InboxMessage[];
  keyPoints: string;
  requestedActions: string;
  summarisedAt: string | null;
}

export interface Repository {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
}

export interface RepoQA {
  id: string;
  question: string;
  answer: string;
  sourceLabel: 'Dependencies' | 'Potential issue' | 'Code summary' | 'Architecture';
}

export interface RepositoryAnalysis {
  repoId: string;
  status: 'Completed' | 'Running';
  progress: number;
  codeSummary: string;
  architecture: string;
  dependencies: string[];
  issueText: string;
  issueSeverity: 'Low' | 'Medium' | 'High';
  requestedBy: string;
  requestedAt: string;
  completedAt: string;
  qa: RepoQA[];
}

export interface AssistantQuestion {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  time: string;
}

export interface AssistantSource {
  name: string;
  text: string;
  permitted: boolean;
}

export const SERVICE_NAMES = [
  'Gmail',
  'Slack',
  'Google Drive',
  'Google Docs',
  'Google Sheets',
  'GitHub',
  'Instagram',
  'Facebook',
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface ServiceConnection {
  name: ServiceName;
  category: string;
  description: string;
  connected: boolean;
}

export interface IntegrationRow {
  name: ServiceName;
  availability: 'Available' | 'Unavailable' | 'Limited by API permissions';
  lastUpdated: string;
  updatedBy: string;
}

export interface ModerationItem {
  id: string;
  channelName: string;
  actionTime: string;
  status: 'Review requested' | 'Message removed' | 'Channel removed';
  messageBody: string;
  target: string;
  reason: string;
  actorName: string;
}

export interface NexusState {
  people: Person[];
  channels: Channel[];
  directs: DirectConversation[];
  inbox: InboxThread[];
  repositories: Repository[];
  analyses: RepositoryAnalysis[];
  assistantSources: AssistantSource[];
  assistantHistory: AssistantQuestion[];
  connections: ServiceConnection[];
  integrations: IntegrationRow[];
  moderation: ModerationItem[];
}

const STORAGE_KEY = 'nexusai-workspace-v1';

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nowStamp(): string {
  return `Today · ${nowTime()}`;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function seed(): NexusState {
  const people: Person[] = [
    {
      id: 'maya',
      displayName: 'Maya Chen',
      initials: 'MC',
      email: 'maya@example.com',
      role: 'Connected Professional',
      status: 'Active',
      joinedDate: '18 Mar 2025',
    },
    {
      id: 'jordan',
      displayName: 'Jordan Lee',
      initials: 'JL',
      email: 'jordan@example.com',
      role: 'Developer Collaborator',
      status: 'Active',
      joinedDate: '19 Mar 2025',
    },
    {
      id: 'sam',
      displayName: 'Sam Patel',
      initials: 'SP',
      email: 'sam@example.com',
      role: 'Admin',
      status: 'Active',
      joinedDate: '21 Mar 2025',
    },
  ];

  const channels: Channel[] = [
    {
      id: 'launch',
      name: 'product-launch',
      purpose: 'Coordinate launch decisions, assets, and customer communication.',
      memberIds: ['maya', 'jordan', 'alex'],
      createdById: 'maya',
      createdDate: '18 Mar 2025',
      archived: false,
      archivedDate: null,
      lastMessageTime: '09:42',
      messages: [
        {
          id: 'source-message-launch',
          authorId: 'maya',
          authorName: 'Maya Chen',
          time: '09:14',
          body: 'The updated launch brief is in Drive. Please review the rollout sequence and flag any dependency that changes the customer announcement.',
          attachment: { service: 'Google Drive', title: 'Launch rollout brief' },
        },
        {
          id: 'source-message-dependency',
          authorId: 'jordan',
          authorName: 'Jordan Lee',
          time: '09:28',
          body: 'The repository analysis found one release dependency we should resolve before the rollout begins. I linked the architecture notes in the thread.',
        },
        {
          id: uid('msg'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: '09:42',
          body: 'I generated a visual concept from the brief. We can share the final image or video in chat, then publish supported content through Instagram or Facebook when permissions allow.',
          media: { title: 'AI-generated launch concept' },
        },
      ],
      summaryText:
        'The team is aligning the rollout brief with repository readiness before finalizing customer communication and generated campaign media.',
      summarySourceId: 'source-message-launch',
      insightText: 'A release dependency may affect the rollout sequence and should be resolved before publication.',
      insightSourceId: 'source-message-dependency',
      summarySavedToDocs: false,
      sharedHistory: [
        { title: 'Launch rollout brief', sharedById: 'maya' },
        { title: 'Architecture review notes', sharedById: 'jordan' },
      ],
    },
    {
      id: 'platform',
      name: 'platform-engineering',
      purpose: 'Review architecture, repository health, and release readiness.',
      memberIds: ['jordan', 'sam', 'alex'],
      createdById: 'jordan',
      createdDate: '19 Mar 2025',
      archived: false,
      archivedDate: null,
      lastMessageTime: '08:18',
      messages: [
        {
          id: 'source-message-platform',
          authorId: 'jordan',
          authorName: 'Jordan Lee',
          time: '08:18',
          body: 'Repository analysis flagged a dependency bump on integration-core — let’s review before we cut the next release.',
        },
      ],
      summaryText: 'Platform engineering is tracking repository health ahead of the next release window.',
      summarySourceId: 'source-message-platform',
      insightText: 'integration-core has a pending dependency bump that should land before release.',
      insightSourceId: 'source-message-platform',
      summarySavedToDocs: false,
      sharedHistory: [{ title: 'Architecture review notes', sharedById: 'jordan' }],
    },
  ];

  const directs: DirectConversation[] = [
    {
      personId: 'maya',
      messages: [
        {
          id: uid('dm'),
          authorId: 'maya',
          authorName: 'Maya Chen',
          time: '10:03',
          body: 'Can you review the document summary before I send the email response?',
          attachment: { service: 'Google Drive', title: 'Customer response draft' },
        },
        {
          id: uid('dm'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: '10:07',
          body: 'Yes. I’ll compare it with the shared brief and return the key differences here.',
        },
      ],
      sharedDocument: { title: 'Customer response draft', service: 'Google Drive' },
      docInsight: null,
    },
    {
      personId: 'jordan',
      messages: [
        {
          id: uid('dm'),
          authorId: 'jordan',
          authorName: 'Jordan Lee',
          time: '09:05',
          body: 'Can you take a look at the platform-engineering repo notes when you get a chance?',
        },
      ],
      sharedDocument: null,
      docInsight: null,
    },
    {
      personId: 'sam',
      messages: [
        {
          id: uid('dm'),
          authorId: 'sam',
          authorName: 'Sam Patel',
          time: '14:20',
          body: 'Welcome aboard — let me know if you need access to anything.',
        },
      ],
      sharedDocument: null,
      docInsight: null,
    },
  ];

  const inbox: InboxThread[] = [
    {
      id: 'launch-approval',
      subject: 'Launch approval and rollout',
      counterpart: 'Maya Chen',
      lastActivity: '10:12',
      messages: [
        {
          id: 'inbox-source',
          time: '10:12',
          sender: 'Maya Chen',
          body: 'Please confirm sign-off on the rollout plan before the customer announcement goes out this afternoon.',
          incoming: true,
          service: 'Gmail',
        },
      ],
      keyPoints: 'Maya is requesting final sign-off on the launch rollout plan before the customer announcement.',
      requestedActions: 'Confirm the rollout plan and reply with approval or requested changes.',
      summarisedAt: null,
    },
    {
      id: 'repo-release-check',
      subject: 'Repository release check',
      counterpart: 'Jordan Lee',
      lastActivity: '09:48',
      messages: [
        {
          id: uid('inbox'),
          time: '09:48',
          sender: 'Jordan Lee',
          body: 'The repository analysis found a dependency that could affect our release timeline. Let’s confirm before the next deploy window.',
          incoming: true,
          service: 'Slack',
        },
      ],
      keyPoints: 'A repository dependency may affect the release timeline.',
      requestedActions: 'Confirm the dependency fix before the next deploy window.',
      summarisedAt: null,
    },
  ];

  const repositories: Repository[] = [
    { id: 'nexus-web', name: 'nexus-web', description: 'Primary web client for the NexusAI workspace experience.', lastUpdated: '2 hours ago' },
    {
      id: 'integration-core',
      name: 'integration-core',
      description: 'Shared service layer powering third-party integrations and sync jobs.',
      lastUpdated: 'Yesterday',
    },
  ];

  const analyses: RepositoryAnalysis[] = [
    {
      repoId: 'nexus-web',
      status: 'Completed',
      progress: 100,
      codeSummary:
        'nexus-web is a React + TypeScript client implementing the channel, inbox, and AI assistant surfaces on a shared routing and design-token layer.',
      architecture:
        'Feature-folder structure with a shared component layer; realtime updates flow through a central client; routing is declarative and permission-aware.',
      dependencies: ['Routing', 'State layer', 'Realtime client', 'Source adapters'],
      issueText:
        'A release dependency in the realtime client has not been pinned, which could cause version drift between environments.',
      issueSeverity: 'Medium',
      requestedBy: 'Jordan Lee',
      requestedAt: '09:02',
      completedAt: '09:11',
      qa: [],
    },
    {
      repoId: 'integration-core',
      status: 'Completed',
      progress: 100,
      codeSummary:
        'integration-core brokers API calls to Gmail, Slack, Drive, Docs, Sheets, GitHub, and social publishing targets behind a single permission-checked interface.',
      architecture: 'Adapter pattern per provider with a shared outbound queue and a permission gate in front of every call.',
      dependencies: ['Queue worker', 'Auth broker', 'Webhook listener'],
      issueText: 'The GitHub adapter retries without backoff, which can trip provider rate limits during bulk analysis.',
      issueSeverity: 'Low',
      requestedBy: 'Sam Patel',
      requestedAt: 'Yesterday · 16:40',
      completedAt: 'Yesterday · 16:52',
      qa: [],
    },
  ];

  const assistantSources: AssistantSource[] = [
    {
      name: '# product-launch',
      text: 'The team is aligning the rollout brief with repository readiness before finalizing customer communication.',
      permitted: true,
    },
    {
      name: 'Launch rollout brief',
      text: 'The rollout sequence covers staged customer communication, support readiness, and marketing coordination.',
      permitted: true,
    },
    {
      name: 'nexus-web analysis',
      text: 'A release dependency in the realtime client has not been pinned, which could cause version drift.',
      permitted: true,
    },
    {
      name: 'Gmail thread: Launch approval and rollout',
      text: 'Maya requested sign-off on the rollout plan before the customer announcement goes out.',
      permitted: true,
    },
    {
      name: 'Restricted finance plan',
      text: 'Q3 budget allocations across paid acquisition channels.',
      permitted: false,
    },
  ];

  const assistantHistory: AssistantQuestion[] = [
    {
      id: uid('qa'),
      question: 'What could affect the product launch?',
      answer:
        'The team is aligning the rollout brief with repository readiness before finalizing customer communication. A release dependency in the realtime client has not been pinned, which could cause version drift.',
      sources: ['# product-launch', 'nexus-web analysis'],
      time: 'Today · 10:26',
    },
    {
      id: uid('qa'),
      question: 'Summarize the latest architecture decisions.',
      answer:
        'The rollout sequence covers staged customer communication, support readiness, and marketing coordination.',
      sources: ['Launch rollout brief'],
      time: 'Yesterday · 16:08',
    },
  ];

  const connections: ServiceConnection[] = [
    { name: 'Gmail', category: 'Email', description: 'Manage email, receive supported real-time updates, summarize threads, and send replies.', connected: false },
    { name: 'Slack', category: 'Messaging', description: 'Receive supported real-time messages, send direct messages, and extract actions.', connected: false },
    { name: 'Google Drive', category: 'Files', description: 'Select files, share them in chatrooms, and analyze their contents with AI.', connected: false },
    { name: 'Google Docs', category: 'Documents', description: 'Share documents, save summaries, extract key information, and answer questions.', connected: false },
    { name: 'Google Sheets', category: 'Spreadsheets', description: 'Select spreadsheets, share them in chats, summarize them, and discuss their contents.', connected: false },
    { name: 'GitHub', category: 'Code', description: 'Browse repositories and analyze source code, structure, dependencies, architecture, functions, and issues.', connected: false },
    { name: 'Instagram', category: 'Social', description: 'Share supported chat content and AI-generated images or videos, subject to API permissions.', connected: false },
    { name: 'Facebook', category: 'Social', description: 'Turn supported conversations or AI-generated content into posts, subject to API permissions.', connected: false },
  ];

  const integrations: IntegrationRow[] = [
    { name: 'Gmail', availability: 'Available', lastUpdated: 'Today · 08:30', updatedBy: 'Sam Patel' },
    { name: 'Slack', availability: 'Available', lastUpdated: 'Yesterday · 17:12', updatedBy: 'Sam Patel' },
    { name: 'Instagram', availability: 'Limited by API permissions', lastUpdated: 'Yesterday · 14:40', updatedBy: 'Sam Patel' },
    { name: 'Facebook', availability: 'Limited by API permissions', lastUpdated: 'Yesterday · 14:40', updatedBy: 'Sam Patel' },
  ];

  const moderation: ModerationItem[] = [
    {
      id: uid('mod'),
      channelName: 'product-launch',
      actionTime: 'Today · 11:08',
      status: 'Review requested',
      messageBody: 'This message was submitted for moderator review with its surrounding conversation context.',
      target: 'Message',
      reason: 'Reported by a channel participant',
      actorName: 'Sam Patel',
    },
  ];

  return { people, channels, directs, inbox, repositories, analyses, assistantSources, assistantHistory, connections, integrations, moderation };
}

function load(): NexusState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as NexusState;
  } catch {
    // fall through to a fresh seed
  }
  return seed();
}

interface NexusActions {
  // People / channels directory
  getPerson: (id: string) => Person | undefined;

  // Workspace home / channels
  createChannel: (name: string, purpose: string) => Channel;
  sendChannelMessage: (channelId: string, body: string) => void;
  shareChannelAttachment: (channelId: string, service: string, title: string) => void;
  shareGeneratedMedia: (channelId: string, kind: 'image' | 'video') => void;
  summariseChannel: (channelId: string) => void;
  saveSummaryToDocs: (channelId: string) => boolean;
  renameChannel: (channelId: string, name: string, purpose: string) => void;
  archiveChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  inviteMember: (channelId: string, personId: string) => void;
  removeMember: (channelId: string, personId: string) => void;

  // Direct messages
  sendDirectMessage: (personId: string, body: string) => void;
  shareDirectAttachment: (personId: string, service: string, title: string) => void;
  shareDirectMedia: (personId: string, kind: 'image' | 'video') => void;
  runDocAction: (personId: string, action: string) => void;

  // Inbox
  sendGmailReply: (threadId: string, body: string) => boolean;
  sendSlackMessage: (threadId: string, body: string) => boolean;
  summariseThread: (threadId: string) => void;

  // Repositories
  retryAnalysis: (repoId: string, onProgress: (pct: number) => void) => Promise<void>;
  askRepositoryQuestion: (repoId: string, question: string) => RepoQA;

  // AI assistant
  askAssistant: (question: string) => AssistantQuestion;

  // Connections
  setServiceConnected: (name: ServiceName, connected: boolean) => void;

  // Admin
  changeUserRole: (personId: string, role: Role) => void;
  suspendUser: (personId: string) => void;
  restoreUser: (personId: string) => void;
  toggleIntegration: (name: ServiceName) => void;
  removeModerationMessage: (id: string) => void;
  removeModerationChannel: (id: string) => void;
}

const NexusContext = React.createContext<(NexusState & NexusActions) | null>(null);

export function NexusDataProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = React.useState<NexusState>(() => load());

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage can be unavailable (private mode, quota) — state still works in-memory
    }
  }, [state]);

  const updateChannel = React.useCallback((channelId: string, updater: (c: Channel) => Channel) => {
    setState((s) => ({ ...s, channels: s.channels.map((c) => (c.id === channelId ? updater(c) : c)) }));
  }, []);

  const updateDirect = React.useCallback((personId: string, updater: (d: DirectConversation) => DirectConversation) => {
    setState((s) => ({ ...s, directs: s.directs.map((d) => (d.personId === personId ? updater(d) : d)) }));
  }, []);

  const updateThread = React.useCallback((threadId: string, updater: (t: InboxThread) => InboxThread) => {
    setState((s) => ({ ...s, inbox: s.inbox.map((t) => (t.id === threadId ? updater(t) : t)) }));
  }, []);

  const actions: NexusActions = React.useMemo(
    () => ({
      getPerson: (id) => state.people.find((p) => p.id === id),

      createChannel: (name, purpose) => {
        const slug = name.trim().replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-') || uid('channel');
        const channel: Channel = {
          id: slug,
          name: name.trim().replace(/^#/, '').trim(),
          purpose: purpose.trim(),
          memberIds: ['alex'],
          createdById: 'alex',
          createdDate: nowStamp().replace('Today · ', ''),
          archived: false,
          archivedDate: null,
          lastMessageTime: nowTime(),
          messages: [],
          summaryText: 'No conversation yet — summaries appear once the channel has messages.',
          summarySourceId: null,
          insightText: 'No insight yet — insights appear once the channel has messages.',
          insightSourceId: null,
          summarySavedToDocs: false,
          sharedHistory: [],
        };
        setState((s) => ({ ...s, channels: [channel, ...s.channels] }));
        return channel;
      },

      sendChannelMessage: (channelId, body) => {
        const msg: ChatMessage = { id: uid('msg'), authorId: 'alex', authorName: 'Alex Rivera', time: nowTime(), body };
        updateChannel(channelId, (c) => ({ ...c, messages: [...c.messages, msg], lastMessageTime: msg.time }));
      },

      shareChannelAttachment: (channelId, service, title) => {
        const msg: ChatMessage = {
          id: uid('msg'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: nowTime(),
          body: `Shared "${title}" from ${service}.`,
          attachment: { service, title },
        };
        updateChannel(channelId, (c) => ({
          ...c,
          messages: [...c.messages, msg],
          lastMessageTime: msg.time,
          sharedHistory: [...c.sharedHistory, { title, sharedById: 'alex' }],
        }));
      },

      shareGeneratedMedia: (channelId, kind) => {
        const msg: ChatMessage = {
          id: uid('msg'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: nowTime(),
          body: kind === 'image' ? 'Generated a new image for this conversation.' : 'Generated a new video for this conversation.',
          media: { title: kind === 'image' ? 'AI-generated image' : 'AI-generated video' },
        };
        updateChannel(channelId, (c) => ({ ...c, messages: [...c.messages, msg], lastMessageTime: msg.time }));
      },

      summariseChannel: (channelId) => {
        updateChannel(channelId, (c) => {
          const last = c.messages[c.messages.length - 1];
          return {
            ...c,
            summaryText: last
              ? `As of ${last.time}, the conversation has ${c.messages.length} message${c.messages.length === 1 ? '' : 's'}; the latest is from ${last.authorName}.`
              : c.summaryText,
            summarySourceId: last?.id ?? c.summarySourceId,
          };
        });
      },

      saveSummaryToDocs: (channelId) => {
        const connected = state.connections.find((s) => s.name === 'Google Docs')?.connected ?? false;
        if (!connected) return false;
        updateChannel(channelId, (c) => ({ ...c, summarySavedToDocs: true }));
        return true;
      },

      renameChannel: (channelId, name, purpose) => {
        updateChannel(channelId, (c) => ({ ...c, name: name.trim().replace(/^#/, ''), purpose: purpose.trim() }));
      },

      archiveChannel: (channelId) => {
        updateChannel(channelId, (c) => ({ ...c, archived: true, archivedDate: nowStamp().replace('Today · ', 'Today, ') }));
      },

      leaveChannel: (channelId) => {
        updateChannel(channelId, (c) => ({ ...c, memberIds: c.memberIds.filter((id) => id !== 'alex') }));
      },

      inviteMember: (channelId, personId) => {
        updateChannel(channelId, (c) => (c.memberIds.includes(personId) ? c : { ...c, memberIds: [...c.memberIds, personId] }));
      },

      removeMember: (channelId, personId) => {
        updateChannel(channelId, (c) => ({ ...c, memberIds: c.memberIds.filter((id) => id !== personId) }));
      },

      sendDirectMessage: (personId, body) => {
        const msg: ChatMessage = { id: uid('dm'), authorId: 'alex', authorName: 'Alex Rivera', time: nowTime(), body };
        updateDirect(personId, (d) => ({ ...d, messages: [...d.messages, msg] }));
      },

      shareDirectAttachment: (personId, service, title) => {
        const msg: ChatMessage = {
          id: uid('dm'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: nowTime(),
          body: `Shared "${title}" from ${service}.`,
          attachment: { service, title },
        };
        updateDirect(personId, (d) => ({ ...d, messages: [...d.messages, msg] }));
      },

      shareDirectMedia: (personId, kind) => {
        const msg: ChatMessage = {
          id: uid('dm'),
          authorId: 'alex',
          authorName: 'Alex Rivera',
          time: nowTime(),
          body: kind === 'image' ? 'Generated a new image for this conversation.' : 'Generated a new video for this conversation.',
          media: { title: kind === 'image' ? 'AI-generated image' : 'AI-generated video' },
        };
        updateDirect(personId, (d) => ({ ...d, messages: [...d.messages, msg] }));
      },

      runDocAction: (personId, action) => {
        updateDirect(personId, (d) => {
          const title = d.sharedDocument?.title ?? 'the shared document';
          const textByAction: Record<string, string> = {
            Analyze: `Analysis of "${title}": the document is structured, internally consistent, and ready for review.`,
            Summarize: `Summary of "${title}": key points condensed into a short brief for quick reading.`,
            'Extract key information': `Key information extracted from "${title}": names, dates, and action items pulled out for easy reference.`,
            'Ask about document': `Based on "${title}", the most relevant answer is drawn directly from its content.`,
          };
          return { ...d, docInsight: { action, text: textByAction[action] ?? `Processed "${title}".` } };
        });
      },

      sendGmailReply: (threadId, body) => {
        const connected = state.connections.find((s) => s.name === 'Gmail')?.connected ?? false;
        if (!connected) return false;
        const msg: InboxMessage = { id: uid('inbox'), time: nowTime(), sender: 'Alex Rivera', body, incoming: false, service: 'Gmail' };
        updateThread(threadId, (t) => ({ ...t, messages: [...t.messages, msg], lastActivity: msg.time }));
        return true;
      },

      sendSlackMessage: (threadId, body) => {
        const connected = state.connections.find((s) => s.name === 'Slack')?.connected ?? false;
        if (!connected) return false;
        const msg: InboxMessage = { id: uid('inbox'), time: nowTime(), sender: 'Alex Rivera', body, incoming: false, service: 'Slack' };
        updateThread(threadId, (t) => ({ ...t, messages: [...t.messages, msg], lastActivity: msg.time }));
        return true;
      },

      summariseThread: (threadId) => {
        updateThread(threadId, (t) => ({
          ...t,
          summarisedAt: nowStamp(),
          keyPoints: `${t.keyPoints} (resummarised across ${t.messages.length} message${t.messages.length === 1 ? '' : 's'}.)`,
        }));
      },

      retryAnalysis: async (repoId, onProgress) => {
        setState((s) => ({ ...s, analyses: s.analyses.map((a) => (a.repoId === repoId ? { ...a, status: 'Running', progress: 0 } : a)) }));
        for (const pct of [25, 50, 75, 100]) {
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          onProgress(pct);
          setState((s) => ({ ...s, analyses: s.analyses.map((a) => (a.repoId === repoId ? { ...a, progress: pct } : a)) }));
        }
        setState((s) => ({
          ...s,
          analyses: s.analyses.map((a) => (a.repoId === repoId ? { ...a, status: 'Completed', completedAt: nowStamp() } : a)),
        }));
      },

      askRepositoryQuestion: (repoId, question) => {
        const lower = question.toLowerCase();
        let sourceLabel: RepoQA['sourceLabel'] = 'Architecture';
        let answer = '';
        const analysis = state.analyses.find((a) => a.repoId === repoId);
        if (lower.includes('dependency') || lower.includes('dependencies')) {
          sourceLabel = 'Dependencies';
          answer = `This repository's dependencies are: ${analysis?.dependencies.join(', ') ?? 'none recorded'}.`;
        } else if (lower.includes('issue')) {
          sourceLabel = 'Potential issue';
          answer = analysis?.issueText ?? 'No open issue recorded for this repository.';
        } else if (lower.includes('function')) {
          sourceLabel = 'Code summary';
          answer = analysis?.codeSummary ?? 'No code summary recorded for this repository.';
        } else {
          sourceLabel = 'Architecture';
          answer = analysis?.architecture ?? 'No architecture notes recorded for this repository.';
        }
        const qa: RepoQA = { id: uid('qa'), question, answer, sourceLabel };
        setState((s) => ({ ...s, analyses: s.analyses.map((a) => (a.repoId === repoId ? { ...a, qa: [...a.qa, qa] } : a)) }));
        return qa;
      },

      askAssistant: (question) => {
        const permitted = state.assistantSources.filter((s) => s.permitted);
        const words = question
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        let matches = permitted.filter((s) => words.some((w) => `${s.name} ${s.text}`.toLowerCase().includes(w)));
        if (matches.length === 0) matches = permitted.slice(0, 2);
        const entry: AssistantQuestion = {
          id: uid('qa'),
          question,
          answer: matches.map((m) => m.text).join(' '),
          sources: matches.map((m) => m.name),
          time: nowStamp(),
        };
        setState((s) => ({ ...s, assistantHistory: [entry, ...s.assistantHistory] }));
        return entry;
      },

      setServiceConnected: (name, connected) => {
        setState((s) => ({ ...s, connections: s.connections.map((c) => (c.name === name ? { ...c, connected } : c)) }));
      },

      changeUserRole: (personId, role) => {
        setState((s) => ({ ...s, people: s.people.map((p) => (p.id === personId ? { ...p, role } : p)) }));
      },

      suspendUser: (personId) => {
        setState((s) => ({ ...s, people: s.people.map((p) => (p.id === personId ? { ...p, status: 'Suspended' } : p)) }));
      },

      restoreUser: (personId) => {
        setState((s) => ({ ...s, people: s.people.map((p) => (p.id === personId ? { ...p, status: 'Active' } : p)) }));
      },

      toggleIntegration: (name) => {
        setState((s) => ({
          ...s,
          integrations: s.integrations.map((i) =>
            i.name === name
              ? { ...i, availability: i.availability === 'Available' ? 'Unavailable' : 'Available', lastUpdated: nowStamp(), updatedBy: 'Sam Patel' }
              : i,
          ),
        }));
      },

      removeModerationMessage: (id) => {
        setState((s) => ({
          ...s,
          moderation: s.moderation.map((m) =>
            m.id === id ? { ...m, status: 'Message removed', messageBody: 'Message removed by moderator.', actionTime: nowStamp() } : m,
          ),
        }));
      },

      removeModerationChannel: (id) => {
        setState((s) => ({
          ...s,
          moderation: s.moderation.map((m) =>
            m.id === id ? { ...m, status: 'Channel removed', channelName: `${m.channelName} · Removed`, actionTime: nowStamp() } : m,
          ),
        }));
      },
    }),
    [state, updateChannel, updateDirect, updateThread],
  );

  const value = React.useMemo(() => ({ ...state, ...actions }), [state, actions]);

  return <NexusContext.Provider value={value}>{children}</NexusContext.Provider>;
}

export function useNexusData(): NexusState & NexusActions {
  const ctx = React.useContext(NexusContext);
  if (!ctx) throw new Error('useNexusData must be used within <NexusDataProvider>');
  return ctx;
}
