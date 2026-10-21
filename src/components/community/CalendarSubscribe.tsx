import { CalendarPlus } from "lucide-react";

import { ICS_URL } from "lib/community/site";

import CopyField from "./CopyField";
import { buttonClassName, Eyebrow } from "./ui";

const WEBCAL_URL = ICS_URL.replace(/^https:/, "webcal:");

const PROVIDERS = [
  { label: "Google Calendar", href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}` },
  { label: "Apple / iCal", href: WEBCAL_URL },
  {
    label: "Outlook",
    href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(ICS_URL)}&name=${encodeURIComponent("OWU · Eventos")}`,
  },
];

/** Subscribe once, get every event: one-click providers plus the raw feed URL */
export default function CalendarSubscribe({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {compact ? null : (
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-yellow-400">
            <CalendarPlus aria-hidden className="size-4" />
          </span>
          <div>
            <Eyebrow>Calendario</Eyebrow>
            <p className="mt-1 text-[15px] text-zinc-300">
              Suscribite una vez: los eventos nuevos aparecen solos en tu calendario.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map(({ label, href }) => (
          <a
            key={label}
            className={buttonClassName("secondary", "sm")}
            href={href}
            rel="noopener"
            target={href.startsWith("http") ? "_blank" : undefined}
          >
            {label}
          </a>
        ))}
      </div>
      <CopyField label="la URL del calendario" value={ICS_URL} />
    </div>
  );
}
