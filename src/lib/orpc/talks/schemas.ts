import * as z from "zod";

import { TOPICS, type Topic } from "../../community/topics";
import type { TalkFormat, TalkLevel } from "../../db/schema";

export const TALK_FORMATS = ["relampago", "corta", "larga", "taller"] as const satisfies readonly TalkFormat[];
export const TALK_LEVELS = ["inicial", "intermedio", "avanzado"] as const satisfies readonly TalkLevel[];
export const TALK_LANGUAGES = ["es", "en"] as const;

export const FORMAT_LABEL: Record<TalkFormat, string> = {
  relampago: "Relámpago · 5′",
  corta: "Corta · 20′",
  larga: "Larga · 40′",
  taller: "Taller",
};
export const LEVEL_LABEL: Record<TalkLevel, string> = {
  inicial: "Inicial",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};
export const LANGUAGE_LABEL: Record<(typeof TALK_LANGUAGES)[number], string> = { es: "Español", en: "Inglés" };

const TopicSchema = z.enum(TOPICS.map((topic) => topic.value) as [Topic, ...Topic[]]);
const HttpsUrl = z.url({ protocol: /^https$/, message: "Usá un link https://" }).max(300);
const Id = z.string().min(1);

/** What someone proposes on /dar-una-charla. No communities means any OWU community may take it. */
export const ProposalFieldsSchema = z.object({
  speakerName: z.string().trim().min(2, "Escribí tu nombre como querés que salga en el evento").max(80),
  title: z.string().trim().min(5, "Poné un título de al menos 5 letras").max(120),
  abstract: z.string().trim().min(30, "Contá de qué va en unas líneas (30 letras o más)").max(2000),
  format: z.enum(TALK_FORMATS),
  level: z.enum(TALK_LEVELS),
  topics: z.array(TopicSchema).min(1, "Elegí al menos un tema").max(3, "Elegí hasta 3 temas"),
  language: z.enum(TALK_LANGUAGES),
  firstTime: z.boolean(),
  recordingOk: z.boolean(),
  communityIds: z.array(Id).max(8, "Elegí hasta 8 comunidades, o «cualquiera de OWU»"),
  notes: z.string().trim().max(1000).default(""),
});

export const UpdateProposalSchema = ProposalFieldsSchema.extend({ proposalId: Id });
export const ProposalRefSchema = z.object({ proposalId: Id });

export const ProposalStatusSchema = z.enum(["open", "withdrawn", "archived"]);
export const ClaimStatusSchema = z.enum(["claimed", "scheduled", "given", "released"]);

const ProposalBase = z.object({
  id: z.string(),
  title: z.string(),
  abstract: z.string(),
  format: z.enum(TALK_FORMATS),
  level: z.enum(TALK_LEVELS),
  topics: z.array(z.string()),
  language: z.string(),
  firstTime: z.boolean(),
  recordingOk: z.boolean(),
  speakerName: z.string(),
  createdAt: z.string(),
});

/** An event a talk goes to; `url` only once it's published. */
const TalkEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  status: z.enum(["draft", "published", "cancelled"]),
  url: z.string().nullable(),
});

/** A proposal as its speaker sees it in «Tus propuestas». */
export const MyProposalSchema = ProposalBase.extend({
  communityIds: z.array(z.string()),
  notes: z.string(),
  status: ProposalStatusSchema,
  /** The community that took it (or gave it last), and the event once it's on a date */
  claim: z
    .object({
      status: ClaimStatusSchema,
      community: z.object({ name: z.string(), slug: z.string() }),
      event: TalkEventSchema.nullable(),
    })
    .nullable(),
});

export const SpeakerProfileSchema = z.object({
  bio: z.string().trim().max(600),
  topics: z.array(TopicSchema).max(5),
  languages: z.array(z.enum(TALK_LANGUAGES)).max(2),
  formats: z.array(z.enum(TALK_FORMATS)).max(4),
  links: z.object({ website: HttpsUrl.optional(), github: HttpsUrl.optional(), linkedin: HttpsUrl.optional() }),
  mentor: z.boolean(),
  public: z.boolean(),
});

/** What organizers see of the speaker behind a proposal (public or not: they proposed to them). */
const SpeakerCardSchema = z.object({
  bio: z.string(),
  topics: z.array(z.string()),
  languages: z.array(z.string()),
  formats: z.array(z.string()),
  links: z.object({ website: z.string().optional(), github: z.string().optional(), linkedin: z.string().optional() }),
  mentor: z.boolean(),
  /** Their public page, when they opened it */
  url: z.string().nullable(),
});

/** A proposal in a community's inbox: addressed to it or to any of OWU. */
export const InboxProposalSchema = ProposalBase.extend({
  /** What the speaker told organizers (dates that suit, what they need) */
  notes: z.string(),
  /** Addressed to this community by name, not only to the whole pool */
  forUs: z.boolean(),
  /** Another community holds it right now */
  takenBy: z.string().nullable(),
  speaker: SpeakerCardSchema.nullable(),
});

/** A talk this community took: with the speaker's email, to coordinate. */
export const ClaimSchema = ProposalBase.extend({
  id: z.string(),
  proposalId: z.string(),
  status: z.enum(["claimed", "scheduled", "given"]),
  notes: z.string(),
  speakerEmail: z.string(),
  speaker: SpeakerCardSchema.nullable(),
  claimedBy: z.string().nullable(),
  event: TalkEventSchema.nullable(),
});

export const CommunityRefSchema = z.object({ communityId: Id });
export const ClaimProposalSchema = CommunityRefSchema.extend({ proposalId: Id });
export const ClaimRefSchema = CommunityRefSchema.extend({ claimId: Id });
export const AssignSchema = ClaimRefSchema.extend({ eventId: Id });

export const TalkRequestSchema = z.object({
  id: z.string(),
  topic: z.string(),
  details: z.string(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  community: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
});
export const CreateRequestSchema = CommunityRefSchema.extend({
  topic: z.string().trim().min(3, "Contá sobre qué buscan una charla").max(120),
  details: z.string().trim().max(500).default(""),
});
export const SetRequestClosedSchema = CommunityRefSchema.extend({ requestId: Id, closed: z.boolean() });

/** A speaker's public page. */
export const PublicSpeakerSchema = SpeakerCardSchema.omit({ url: true }).extend({
  id: z.string(),
  name: z.string(),
  talks: z.array(
    z.object({
      title: z.string(),
      event: z.object({ name: z.string(), startDate: z.string(), url: z.string() }),
      community: z.object({ name: z.string(), slug: z.string() }),
    })
  ),
});

export const CardRefSchema = z.object({ kind: z.enum(["evento", "charla"]), id: Id });
/** The words on a share card (see lib/og/cover). */
export const CardSchema = z.object({
  communityId: z.string(),
  /** Anyone may see it; otherwise only the community's organizers */
  public: z.boolean(),
  tag: z.string(),
  title: z.string(),
  subtitle: z.string(),
  footerLabel: z.string(),
  footer: z.string(),
  chips: z.array(z.string()),
});

export const TokenSchema = z.object({ token: z.string().min(1).max(400) });
export const MaterialsViewSchema = z.object({
  title: z.string(),
  speakerName: z.string(),
  event: z.object({ name: z.string(), startDate: z.string(), url: z.string().nullable() }),
  /** Already sent once: the link doesn't take more */
  sent: z.boolean(),
});
export const SubmitMaterialsSchema = TokenSchema.extend({
  slides: HttpsUrl.optional(),
  recording: HttpsUrl.optional(),
}).refine((input) => input.slides || input.recording, "Pegá el link de las slides o de la grabación");

export type ProposalFields = z.infer<typeof ProposalFieldsSchema>;
export type MyProposal = z.infer<typeof MyProposalSchema>;
export type InboxProposal = z.infer<typeof InboxProposalSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type TalkRequest = z.infer<typeof TalkRequestSchema>;
export type SpeakerProfile = z.infer<typeof SpeakerProfileSchema>;
export type PublicSpeaker = z.infer<typeof PublicSpeakerSchema>;
export type Card = z.infer<typeof CardSchema>;
