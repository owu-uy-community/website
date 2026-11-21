"use client";

import { Fragment } from "react";
import Image from "next/image";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { MicroLabel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Input } from "components/shared/ui/input";
import { Textarea } from "components/shared/ui/textarea";
import { MESSAGE_MAX, type Channels } from "lib/orpc/comms/schemas";

import { CHANNELS } from "./labels";

export type OwyChannel = "telegram" | "slack";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** The text as the channel shows it: line breaks kept, links highlighted. */
function Linkified({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-info-foreground underline underline-offset-2">
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}

/** "Así se lee": Owy's bubble in the channel it goes to. */
export function MessagePreview({ channel, body }: { channel: OwyChannel; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <MicroLabel>Así se lee</MicroLabel>
      <div className="mt-2.5 flex gap-2.5">
        <Image
          alt=""
          className="size-8 shrink-0 rounded-full bg-primary/15 object-contain p-0.5 ring-1 ring-primary/20"
          height={64}
          src="/images/logos/carpincho.png"
          width={64}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-ui font-semibold text-foreground">Owy</span>
            <span className="text-2xs text-muted-foreground">{CHANNELS[channel].hint}</span>
          </p>
          <p className="mt-0.5 text-ui break-words whitespace-pre-wrap text-subtle">
            {body.trim() ? (
              <Linkified text={body} />
            ) : (
              <span className="text-muted-foreground">Tu mensaje aparece acá.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Telegram or Slack, each with whether Owy can write there. */
export function ChannelPicker({
  value,
  onChange,
  channels,
  name,
}: {
  value: OwyChannel;
  onChange: (channel: OwyChannel) => void;
  channels: Channels | undefined;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-meta text-muted-foreground">Canal</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-input bg-background p-0.5">
        {(["telegram", "slack"] as const).map((channel) => {
          const { label, hint, icon: Icon } = CHANNELS[channel];
          const ready = channels?.[channel] ?? false;
          return (
            <label key={channel} className="relative cursor-pointer">
              <input
                checked={value === channel}
                className="peer sr-only"
                name={name}
                type="radio"
                value={channel}
                onChange={() => onChange(channel)}
              />
              <span className="flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors peer-checked:bg-raised peer-checked:text-foreground peer-checked:shadow-[inset_0_0_0_1px_hsl(var(--input)),0_1px_2px_rgb(0_0_0/0.5)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 hover:text-foreground">
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 leading-tight">
                  <span className="block text-ui font-medium">{label}</span>
                  <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <StatusDot tone={ready ? "ok" : "idle"} />
                    {ready ? hint : "sin configurar"}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The message's text, with its length against the channel's limit. */
export function BodyField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const over = value.length > MESSAGE_MAX;

  return (
    <div>
      <label className="mb-1.5 block text-meta text-muted-foreground" htmlFor={id}>
        Mensaje
      </label>
      <Textarea
        aria-invalid={over || undefined}
        className="min-h-24 resize-y"
        id={id}
        placeholder="Escribí lo que va a decir Owy…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        className={cn(
          "mt-1 text-right font-terminal text-2xs tabular-nums",
          over ? "text-live-foreground" : "text-muted-foreground"
        )}
      >
        {value.length} / {MESSAGE_MAX}
      </p>
    </div>
  );
}

/** When it goes out, on the event's clock. */
export function WhenField({
  id,
  value,
  onChange,
  timeZone,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  timeZone: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-meta text-muted-foreground" htmlFor={id}>
        Sale el
      </label>
      <Input
        className="[color-scheme:dark]"
        id={id}
        required
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="mt-1 text-2xs text-muted-foreground">Hora del evento ({timeZone.replace("_", " ")}).</p>
    </div>
  );
}

/** A channel Owy can't write to yet: scheduling still works (it may be set up by then), sending doesn't. */
export function UnconfiguredNotice({
  channel,
  channels,
  sendNow,
  editingSent = false,
}: {
  channel: OwyChannel;
  channels: Channels | undefined;
  sendNow: boolean;
  /** Rewriting a message that already went out: it can only be edited where it is. */
  editingSent?: boolean;
}) {
  return (
    <Notice show={channels !== undefined && !channels[channel]} tone="warning">
      Owy todavía no puede escribir en {CHANNELS[channel].label} desde el sitio.{" "}
      {editingSent
        ? "Hasta que se configure, este mensaje no se puede editar."
        : sendNow
          ? "Programalo o elegí otro canal."
          : "Podés programarlo igual: si sigue sin configurar a esa hora, va a fallar y lo vas a ver en el historial."}
    </Notice>
  );
}
