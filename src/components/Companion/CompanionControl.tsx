"use client";

import Link from "next/link";
import { Hand, X } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";

import { BridgeCard } from "./control/BridgeCard";
import { BridgeStrip } from "./control/BridgeStrip";
import { DeviceCard } from "./control/DeviceCard";
import { deviceIds } from "./control/model";
import { useBrowserAudio } from "./control/useBrowserAudio";
import { useCompanionState } from "./control/useCompanionState";

/**
 * /admin/companion, «Ajustes de Owy»: every setting of each physical Owy and of the bridge on the
 * venue Mac, with where each one stands. The day's buttons live on /admin/owy; this is where the
 * knobs are turned.
 */
export default function CompanionControl() {
  const { state, query, online, onSet, error, setError, send } = useCompanionState();
  const audio = useBrowserAudio();
  const ids = state ? deviceIds(state) : [];

  return (
    <PageContainer className="space-y-4 pt-0" size="large">
      <PageHeader
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/owy">
              <Hand aria-hidden /> Botones del día
            </Link>
          </Button>
        }
        className="mb-0"
        description="Cada knob (su cara y su botón) y la Mac que escucha y habla por Owy. El bridge sigue los cambios en vivo."
        title="Ajustes de Owy"
      />

      {/* Sticky: a change far down the page that bounces back says why where it can be seen. */}
      <div className="sticky top-[calc(46px+env(safe-area-inset-top)+0.5rem)] z-30 empty:hidden md:top-2">
        <Notice show={!!error} tone="danger">
          <span className="flex items-start justify-between gap-3">
            <span>No se guardó: {error}</span>
            <Button
              aria-label="Cerrar el aviso"
              className="-my-1"
              size="icon-xs"
              variant="ghost"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </span>
        </Notice>
      </div>

      <Notice show={query.isError} tone="danger">
        No se pudo leer el estado del companion: {query.error?.message}
      </Notice>

      {!state ? (
        query.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : null
      ) : (
        <>
          <BridgeStrip ids={ids} online={online} send={send} state={state} onSet={onSet} />
          {ids.length === 0 ? (
            <p className="text-ui text-muted-foreground">
              Todavía no hay dispositivos: aparecen cuando el bridge reporta (corre en la Mac con COMPANION_DEVICES).
            </p>
          ) : null}
          {/* Cards stack on a phone; side by side on a wide screen, the bridge's after the devices. */}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {ids.map((id) => (
              <DeviceCard key={id} audio={audio} id={id} online={online} send={send} state={state} onSet={onSet} />
            ))}
            <BridgeCard online={online} send={send} state={state} onSet={onSet} />
          </div>
        </>
      )}
    </PageContainer>
  );
}
