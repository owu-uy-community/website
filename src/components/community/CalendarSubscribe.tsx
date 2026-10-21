import { CalendarPlus } from "lucide-react";

import { ICS_URL } from "lib/community/site";

import CopyField from "./CopyField";
import { buttonClassName } from "./ui";

const WEBCAL_URL = ICS_URL.replace(/^https:/, "webcal:");

const PROVIDERS = [
  { label: "Google Calendar", href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}` },
  { label: "Apple / iCal", href: WEBCAL_URL },
  {
    label: "Outlook",
    href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(ICS_URL)}&name=${encodeURIComponent("OWU · Eventos")}`,
  },
];

/** Subscribe once, get every event: one-click providers plus the raw feed URL. `wide` puts the pitch beside the actions */
export default function CalendarSubscribe({ compact = false, wide = false }: { compact?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "grid gap-6 md:grid-cols-[1fr_1.15fr] md:items-center md:gap-10" : "flex flex-col gap-5"}>
      {compact ? null : (
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
            <CalendarPlus aria-hidden className="size-5" />
          </span>
          <div>
            <h3 className="font-title text-[17px] font-semibold text-white">Suscribite al calendario</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Una vez. Los eventos nuevos aparecen solos en el tuyo.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-5">
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
    </div>
  );
}
