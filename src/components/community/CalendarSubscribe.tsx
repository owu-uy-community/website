import { Apple, CalendarDays, CalendarSync, Mail } from "lucide-react";

import { cn } from "app/lib/utils";
import { ICS_URL } from "lib/community/site";

import { CopyButton } from "./CopyField";
import { buttonClassName } from "./ui";

const WEBCAL_URL = ICS_URL.replace(/^https:/, "webcal:");

const PROVIDERS = [
  {
    label: "Google",
    app: "Google Calendar",
    icon: CalendarDays,
    href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`,
  },
  { label: "Apple", app: "Apple Calendar", icon: Apple, href: WEBCAL_URL },
  {
    label: "Outlook",
    app: "Outlook",
    icon: Mail,
    href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(ICS_URL)}&name=${encodeURIComponent("OWU · Eventos")}`,
  },
];

const button = buttonClassName("secondary", "sm", "w-full");

/** Subscribe once and every new event shows up in your calendar. `wide` puts the title beside the buttons */
export default function CalendarSubscribe({ wide = false }: { wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-5", wide && "lg:flex-row lg:items-center lg:justify-between lg:gap-10")}>
      <div className="flex items-center gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
          <CalendarSync aria-hidden className="size-5" />
        </span>
        <div>
          <h3 className="font-title text-base leading-snug font-semibold text-white">Suscribite al calendario</h3>
          <p className="mt-0.5 text-[13px] text-zinc-400">Los eventos nuevos aparecen solos.</p>
        </div>
      </div>
      <div className={cn("grid grid-cols-2 gap-2", wide && "sm:grid-cols-4 lg:w-[34rem] lg:shrink-0")}>
        {PROVIDERS.map(({ label, app, icon: Icon, href }) => (
          <a
            key={label}
            aria-label={`Suscribirse en ${app}`}
            className={button}
            href={href}
            rel="noopener"
            target={href.startsWith("http") ? "_blank" : undefined}
            title={app}
          >
            <Icon aria-hidden className="size-4 shrink-0 text-zinc-400 transition-colors group-hover/button:text-white" />
            {label}
          </a>
        ))}
        <CopyButton className={button} value={ICS_URL}>
          Copiar link
        </CopyButton>
      </div>
    </div>
  );
}
