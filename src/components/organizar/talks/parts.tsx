import type * as React from "react";
import { Download, ExternalLink, GraduationCap, Mic, Video, VideoOff } from "lucide-react";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { topicLabel } from "lib/community/topics";
import { FORMAT_LABEL, LANGUAGE_LABEL, LEVEL_LABEL, type Claim, type InboxProposal } from "lib/orpc/talks/schemas";

/** Pieces the Charlas tabs and the event's Publicaciones share. */

/** Format, level, topics and the speaker's flags, as words with their icon. */
export function TalkFacts({
  talk,
}: {
  talk: Pick<InboxProposal, "format" | "level" | "topics" | "language" | "firstTime" | "recordingOk">;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">{FORMAT_LABEL[talk.format]}</Badge>
      <Badge variant="secondary">{LEVEL_LABEL[talk.level]}</Badge>
      {talk.topics.map((item) => (
        <Badge key={item} variant="outline">
          {topicLabel(item)}
        </Badge>
      ))}
      {talk.language !== "es" ? (
        <Badge variant="outline">{LANGUAGE_LABEL[talk.language as "en"] ?? talk.language}</Badge>
      ) : null}
      {talk.firstTime ? (
        <Badge variant="info">
          <GraduationCap aria-hidden />
          Primera charla: ofrecé un ensayo
        </Badge>
      ) : null}
      <Badge variant="outline">
        {talk.recordingOk ? <Video aria-hidden /> : <VideoOff aria-hidden />}
        {talk.recordingOk ? "Se puede grabar" : "No se graba"}
      </Badge>
    </div>
  );
}

/** What organizers see of the speaker: their profile if they wrote one. */
export function SpeakerBlock({ name, speaker }: { name: string; speaker: Claim["speaker"] }) {
  const links = speaker ? Object.entries(speaker.links).filter(([, url]) => url) : [];

  return (
    <div className="flex flex-col gap-1 text-ui">
      <div className="flex flex-wrap items-center gap-2 text-foreground">
        <Mic aria-hidden className="size-3.5 text-muted-foreground" />
        {name}
        {speaker?.mentor ? <Badge variant="success">Mentorea</Badge> : null}
      </div>
      {speaker?.bio ? <p className="text-muted-foreground">{speaker.bio}</p> : null}
      {links.length > 0 || speaker?.url ? (
        <p className="flex flex-wrap gap-3 text-meta">
          {speaker?.url ? (
            <a className="text-info-foreground hover:underline" href={speaker.url} rel="noreferrer" target="_blank">
              Su página
            </a>
          ) : null}
          {links.map(([kind, url]) => (
            <a
              key={kind}
              className="inline-flex items-center gap-1 text-info-foreground hover:underline"
              href={url}
              rel="noreferrer nofollow"
              target="_blank"
            >
              {kind === "github" ? "GitHub" : kind === "linkedin" ? "LinkedIn" : "Web"}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** A share card's PNG, downloaded with a name that says what it is. */
export function CardLink({
  kind,
  id,
  format,
  label,
}: {
  kind: "evento" | "charla";
  id: string;
  format: "cuadrada" | "historia";
  label: string;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <a download={`${kind}-${format}.png`} href={`/api/tarjetas/${kind}/${id}/${format}`}>
        <Download aria-hidden />
        {label}
      </a>
    </Button>
  );
}

/** A talk card's head: the title wraps (talk titles are long, phones are narrow), its state on the right. */
export function CardHead({ title, meta, badge }: { title: string; meta?: string; badge: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-ui font-semibold text-pretty text-foreground">{title}</h2>
        {meta ? <p className="font-terminal text-meta text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="shrink-0">{badge}</div>
    </div>
  );
}
