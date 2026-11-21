"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, Copy, ScanLine, ScanQrCode } from "lucide-react";
import { encode } from "uqr";

import { EditorPanel, Notice, PanelSection } from "components/Admin/panel";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import type { CheckinStats, SyncState } from "lib/orpc/attendees/schemas";

/** Eventbrite Organizer in the stores (the links Eventbrite's own page uses). */
const ORGANIZER = {
  ios: "https://apps.apple.com/app/id368260521",
  android: "https://play.google.com/store/apps/details?id=com.eventbrite.organizer",
};

function QrCode({ value, label }: { value: string; label: string }) {
  const qr = useMemo(() => encode(value, { border: 1, ecc: "M" }), [value]);
  const path = useMemo(
    () => qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join(""),
    [qr]
  );

  return (
    <a
      className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
      href={value}
      rel="noreferrer"
      target="_blank"
    >
      <svg
        aria-label={`Código QR para bajar Organizer en ${label}`}
        className="aspect-square w-full max-w-[132px] rounded-sm bg-white"
        role="img"
        shapeRendering="crispEdges"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
      >
        <path d={path} fill="#000" />
      </svg>
      <span className="text-meta font-medium text-subtle group-hover:text-foreground">{label}</span>
    </a>
  );
}

const steps = (eventName: string) => [
  ["Instalá Eventbrite Organizer", "Escaneá el QR de abajo con el teléfono de la puerta."],
  ["Entrá con la cuenta de Eventbrite de OWU", "La que creó el evento, o una con permiso de check-in."],
  [`Elegí «${eventName}» y tocá «Check in»`, "En Android, «Check in» está en el menú."],
  ["Tocá escanear y apuntá al QR de la entrada", "Organizer confirma cada una y avisa si ya se usó."],
];

/**
 * How the door works on the day: Organizer on every door phone (Eventbrite can't be told about
 * a check-in any other way), OWU mirroring it, the webhook that makes the mirror instant, and
 * OWU's own scanner as a beta for when Organizer isn't an option.
 */
export function DoorsPanel({
  open,
  onOpenChange,
  eventName,
  stats,
  sync,
  webhookUrl,
  scannerHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName: string;
  stats: CheckinStats | undefined;
  sync: SyncState | undefined;
  /** Null when the server has no EVENTBRITE_WEBHOOK_SECRET: the webhook is off. */
  webhookUrl: string | null;
  scannerHref: string;
}) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar", "Seleccioná la URL y copiala a mano.");
    }
  };

  return (
    <EditorPanel
      description="La puerta acredita con Eventbrite Organizer y OWU copia cada acreditación al toque."
      icon={ScanQrCode}
      open={open}
      title="Puertas de check-in"
      onOpenChange={onOpenChange}
    >
      <div className="space-y-7">
        <PanelSection title="Organizer en cada teléfono">
          <ol className="space-y-3">
            {steps(eventName).map(([title, detail], index) => (
              <li key={title} className="flex gap-3">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-raised font-terminal text-2xs text-subtle">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-ui font-medium text-foreground">{title}</p>
                  <p className="text-meta text-muted-foreground">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-3">
            <QrCode label="iPhone · App Store" value={ORGANIZER.ios} />
            <QrCode label="Android · Google Play" value={ORGANIZER.android} />
          </div>
        </PanelSection>

        <PanelSection title="Sin señal o sin entrada">
          <ul className="space-y-2 text-ui text-subtle">
            <li className="flex gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-foreground">Sin señal Organizer sigue acreditando</span> y sincroniza cuando
                vuelve la conexión. Abrí el evento con wifi antes de abrir la puerta.
              </span>
            </li>
            <li className="flex gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-foreground">¿No encuentra su entrada?</span> Buscalo por nombre o email en la
                lista de Organizer y deslizá a la derecha (o tocá «Check in»).
              </span>
            </li>
          </ul>
        </PanelSection>

        <PanelSection title="Hoy por puerta">
          {stats && stats.doors.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {stats.doors.map((door) => (
                <li key={`${door.source}:${door.device}`} className="flex h-10 items-center gap-2 px-3 text-ui">
                  <span className="min-w-0 flex-1 truncate text-foreground">{door.device}</span>
                  <Badge variant={door.source === "owu" ? "outline" : "secondary"}>
                    {door.source === "owu" ? "Escáner OWU" : "Organizer"}
                  </Badge>
                  <span className="w-10 text-right font-terminal text-meta text-subtle tabular-nums">{door.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui text-muted-foreground">Todavía nadie acreditó a nadie.</p>
          )}
        </PanelSection>

        <PanelSection title="Aviso al instante (webhook)">
          <p className="text-ui text-subtle">
            Sin esto OWU igual lee Eventbrite cada 30 s. Con el webhook, cada acreditación llega en segundos. En
            Eventbrite: Configuración de la cuenta → Enlaces para desarrolladores → Webhooks → Agregar webhook, pegá
            esta URL y elegí <span className="font-terminal text-meta">attendee.checked_in</span>,{" "}
            <span className="font-terminal text-meta">attendee.updated</span> y{" "}
            <span className="font-terminal text-meta">order.placed</span>.
          </p>
          {webhookUrl ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-input bg-background py-1.5 pr-1.5 pl-3">
                <code className="min-w-0 flex-1 truncate font-terminal text-meta text-foreground">{webhookUrl}</code>
                <Button
                  aria-label="Copiar la URL del webhook"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void copy(webhookUrl)}
                >
                  <Copy />
                </Button>
              </div>
              <p className="text-meta text-muted-foreground">
                La URL lleva el secreto: compartila solo con quien configura Eventbrite.{" "}
                {sync?.webhookAt ? (
                  <>
                    Último aviso <RelativeTime date={sync.webhookAt} />.
                  </>
                ) : (
                  "Todavía no llegó ningún aviso."
                )}
              </p>
            </>
          ) : (
            <Notice tone="warning">
              El webhook está apagado: falta <span className="font-terminal text-meta">EVENTBRITE_WEBHOOK_SECRET</span>{" "}
              en el servidor.
            </Notice>
          )}
        </PanelSection>

        <PanelSection title="Escáner propio · beta">
          <p className="text-ui text-subtle">
            Para cuando Organizer no sea opción: un escáner en el navegador del teléfono, que también funciona sin
            señal. Lo que acredita queda solo en OWU y <span className="text-foreground">no llega a Eventbrite</span>.
          </p>
          <Button asChild className="w-full" variant="outline">
            <Link href={scannerHref}>
              <ScanLine />
              Abrir el escáner
            </Link>
          </Button>
        </PanelSection>
      </div>
    </EditorPanel>
  );
}
