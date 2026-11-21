"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, Link2, X } from "lucide-react";

import { authClient, useSession } from "app/lib/auth-client";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";

import { useAccessMe } from "./use-access-me";

const DISMISSED = "owu-slack-notice-dismissed";
const HEIGHT_VAR = "--admin-access-banner-h";

/**
 * Above the page, under the header: the bar that says whose eyes you're borrowing (impersonation),
 * and the notice that a role needs the OWU Slack. Full-height pages subtract them through
 * --admin-access-banner-h, as they do with the urgent banner's.
 */
export function AccessBanners() {
  const { data: session } = useSession();
  const me = useAccessMe().data;
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISSED) === "1"
  );
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const impersonating = Boolean(session?.session.impersonatedBy);
  const needsSlack =
    !impersonating &&
    !dismissed &&
    me !== undefined &&
    !me.owuSlack &&
    // Roles on record (counting or not): after the deadline the ones without the Slack stop counting.
    (me.roles.some((role) => role !== "user" && role !== "service") || me.communities.length > 0);
  const showing = impersonating || needsSlack;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) =>
      root.style.setProperty(
        HEIGHT_VAR,
        `${Math.ceil(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height)}px`
      )
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [showing]);

  if (!showing) return null;

  const stop = async () => {
    setBusy(true);
    const { error } = await authClient.admin.stopImpersonating();
    if (error) {
      setBusy(false);
      toast.error("No se pudo volver a tu cuenta", error.message ?? "Probá de nuevo.");
      return;
    }
    window.location.href = "/admin/acceso";
  };

  const linkSlack = async () => {
    setBusy(true);
    const { error } = await authClient.linkSocial({ provider: "slack", callbackURL: "/admin" });
    if (error) {
      setBusy(false);
      toast.error("No se pudo abrir Slack", error.message ?? "Probá de nuevo.");
    }
  };

  return (
    <div ref={box}>
      {impersonating ? (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning-surface px-4 py-2 md:px-5"
          role="status"
        >
          <Eye aria-hidden className="size-4 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 text-ui text-foreground">
            Estás viendo el sitio como <span className="font-medium">{session?.user.name}</span>
          </p>
          <Button disabled={busy} size="sm" variant="outline" onClick={() => void stop()}>
            {busy ? "Volviendo…" : "Volver a mi cuenta"}
          </Button>
        </div>
      ) : null}
      {needsSlack ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-info/40 bg-info-surface px-4 py-2 md:px-5">
          <Link2 aria-hidden className="size-4 shrink-0 text-info-foreground" />
          <p className="min-w-0 flex-1 text-ui text-foreground">
            Tu rol necesita el Slack de OWU desde el{" "}
            {format(new Date(me.owuSlackRequiredFrom), "d 'de' MMMM", { locale: es })}: entrá una vez con ese Slack.
          </p>
          <div className="flex items-center gap-1.5">
            <Button disabled={busy} size="sm" variant="outline" onClick={() => void linkSlack()}>
              Entrar con Slack
            </Button>
            <Button
              aria-label="Ocultar el aviso"
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                sessionStorage.setItem(DISMISSED, "1");
                setDismissed(true);
              }}
            >
              <X />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
