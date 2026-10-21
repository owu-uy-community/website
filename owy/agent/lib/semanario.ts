/**
 * What goes into a Semanario issue, collected the same way every time:
 *
 * - threads: top-level messages from the last 7 days, in the PUBLIC channels Owy
 *   was invited to, that someone marked with the nomination reaction
 *   (OWY_SEMANARIO_EMOJI). Owy only ever sees a one-line excerpt of each, to
 *   write its own one-line title; the message itself is never stored or published.
 * - jobs: how many new top-level posts the jobs channel (OWY_JOBS_CHANNEL_ID) got.
 * - events: the week's events from the meetup-bot feed (the site's agenda source).
 *
 * Slack scopes: channels:read, channels:history (see owy/README.md).
 */

const SLACK_API = "https://slack.com/api";
const FEED_URL = "https://meetup-bot.marpo60.xyz/json";
const DAY_MS = 86_400_000;
const MAX_THREADS = 10;
const MAX_EVENTS = 15;

export const nominationEmoji = () => (process.env.OWY_SEMANARIO_EMOJI ?? "semanario").replace(/:/g, "").trim();

/** Monday (Montevideo, UTC-3 all year) of the week `now` falls in, as YYYY-MM-DD */
export function mondayOf(now: Date): string {
  const local = new Date(now.getTime() - 3 * 3_600_000);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;

  return new Date(local.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

type SlackMessage = {
  ts: string;
  text?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  bot_id?: string;
  reactions?: { name: string; count: number }[];
};

async function slack<T>(method: string, params: Record<string, string>): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN no está configurada: no puedo leer el Slack.");

  const response = await fetch(`${SLACK_API}/${method}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!body.ok) throw new Error(`Slack ${method} falló: ${body.error ?? response.status}`);

  return body;
}

/** Every page of a cursor-paginated Slack list (bounded, so a huge channel can't stall the run) */
async function paginate<T>(method: string, params: Record<string, string>, key: string, maxPages = 5): Promise<T[]> {
  const items: T[] = [];
  let cursor = "";
  for (let page = 0; page < maxPages; page += 1) {
    const body = await slack<Record<string, unknown> & { response_metadata?: { next_cursor?: string } }>(method, {
      ...params,
      limit: "200",
      ...(cursor ? { cursor } : {}),
    });
    items.push(...((body[key] as T[] | undefined) ?? []));
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }

  return items;
}

/** Slack markup to plain text: mentions become "@alguien" (no names), links keep their label */
function plainText(text: string) {
  return text
    .replace(/<@[A-Z0-9]+(\|[^>]+)?>/g, "@alguien")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<!([a-z]+)[^>]*>/g, "@$1")
    .replace(/\s+/g, " ")
    .trim();
}

const isTopLevel = (message: SlackMessage) =>
  !message.subtype && !message.bot_id && (!message.thread_ts || message.thread_ts === message.ts);

export type NominatedThread = {
  channel: string;
  permalink: string;
  replies: number;
  marks: number;
  /** For Owy to title the thread; never published */
  excerpt: string;
};

export type SemanarioEvent = { title: string; group: string; start: string; venue: string | null; url: string };

export type SemanarioInputs = {
  weekStart: string;
  emoji: string;
  threads: NominatedThread[];
  jobs: { count: number; channelUrl: string | null } | null;
  events: SemanarioEvent[];
};

async function collectThreads(oldest: number, emoji: string) {
  const channels = await paginate<{ id: string; name: string; is_member?: boolean; is_private?: boolean }>(
    "conversations.list",
    { types: "public_channel", exclude_archived: "true" },
    "channels"
  );
  const readable = channels.filter((channel) => channel.is_member && !channel.is_private);

  const threads: NominatedThread[] = [];
  for (const channel of readable) {
    const messages = await paginate<SlackMessage>(
      "conversations.history",
      { channel: channel.id, oldest: String(oldest / 1000) },
      "messages",
      3
    );
    for (const message of messages) {
      const marks = message.reactions?.find((reaction) => reaction.name === emoji)?.count ?? 0;
      if (!marks || !isTopLevel(message)) continue;
      const { permalink } = await slack<{ permalink: string }>("chat.getPermalink", {
        channel: channel.id,
        message_ts: message.ts,
      });
      threads.push({
        channel: channel.name,
        permalink,
        replies: message.reply_count ?? 0,
        marks,
        excerpt: plainText(message.text ?? "").slice(0, 200),
      });
    }
  }

  // Most marked first, then the liveliest
  return threads.sort((a, b) => b.marks - a.marks || b.replies - a.replies).slice(0, MAX_THREADS);
}

async function collectJobs(oldest: number) {
  const channel = process.env.OWY_JOBS_CHANNEL_ID;
  if (!channel) return null;

  const [messages, { url }] = await Promise.all([
    paginate<SlackMessage>("conversations.history", { channel, oldest: String(oldest / 1000) }, "messages", 3),
    slack<{ url: string }>("auth.test", {}),
  ]);

  return {
    count: messages.filter(isTopLevel).length,
    channelUrl: `${url.replace(/\/$/, "")}/archives/${channel}`,
  };
}

/** The week's events from the meetup-bot feed; anything malformed or with a non-web link is dropped */
async function collectEvents(weekStart: string): Promise<SemanarioEvent[]> {
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) return [];
    const body = (await response.json()) as { meetups?: unknown };
    if (!Array.isArray(body.meetups)) return [];

    const from = Date.parse(`${weekStart}T00:00:00-03:00`);
    const to = from + 7 * DAY_MS;

    return body.meetups
      .flatMap((entry): SemanarioEvent[] => {
        const meetup = entry as Record<string, unknown>;
        const { name, title, datetime, event_url: url, venue } = meetup;
        if (typeof title !== "string" || typeof name !== "string" || typeof datetime !== "string") return [];
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) return [];
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(datetime)) return [];
        const start = `${datetime.length === 16 ? `${datetime}:00` : datetime}-03:00`;
        const at = Date.parse(start);
        if (at < from || at >= to) return [];

        return [
          {
            title: title.slice(0, 300),
            group: name.slice(0, 200),
            start,
            venue: typeof venue === "string" && venue.trim() ? venue.trim().slice(0, 200) : null,
            url,
          },
        ];
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, MAX_EVENTS);
  } catch {
    // The feed is a community-run bot: an issue without events beats no issue
    return [];
  }
}

/** Everything a draft needs, for the week `now` falls in */
export async function collectSemanarioInputs(now = new Date()): Promise<SemanarioInputs> {
  const weekStart = mondayOf(now);
  const oldest = now.getTime() - 7 * DAY_MS;
  const emoji = nominationEmoji();
  const [threads, jobs, events] = await Promise.all([
    collectThreads(oldest, emoji),
    collectJobs(oldest),
    collectEvents(weekStart),
  ]);

  return { weekStart, emoji, threads, jobs, events };
}
