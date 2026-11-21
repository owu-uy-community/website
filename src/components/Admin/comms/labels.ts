import { AtSign, Hash, Mail, Send, type LucideIcon } from "lucide-react";

import type { BadgeProps } from "components/shared/ui/badge";
import { zonedInstant } from "lib/orpc/comms/cadence";
import type { OutboundMessage } from "lib/orpc/comms/schemas";
import { wallClock } from "lib/slot-day";

export const CHANNELS: Record<OutboundMessage["channel"], { label: string; hint: string; icon: LucideIcon }> = {
  telegram: { label: "Telegram", hint: "Canal de asistentes", icon: Send },
  slack: { label: "Slack", hint: "Canal de la comunidad", icon: Hash },
  staff_dm: { label: "DM al staff", hint: "Mensajes directos de Owy", icon: AtSign },
  email: { label: "Email", hint: "Desde Eventbrite", icon: Mail },
};

export const STATUS: Record<OutboundMessage["status"], { label: string; variant: NonNullable<BadgeProps["variant"]> }> =
  {
    scheduled: { label: "programado", variant: "info" },
    sending: { label: "saliendo…", variant: "info" },
    sent: { label: "enviado", variant: "success" },
    failed: { label: "falló", variant: "destructive" },
  };

/** `<input type="datetime-local">` speaks the event's wall clock, whatever the browser's zone. */
export const toLocalInput = (at: Date | string, timeZone: string) => wallClock(new Date(at), timeZone);
export const fromLocalInput = (value: string, timeZone: string) =>
  zonedInstant(value.slice(0, 10), value.slice(11, 16), timeZone).toISOString();
