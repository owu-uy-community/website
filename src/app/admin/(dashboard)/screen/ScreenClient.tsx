"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Keyboard } from "lucide-react";

import { OBS_CONFIG } from "app/lib/constants";
import { AudioStrip } from "components/Admin/screen/AudioStrip";
import { ConnectionSheet } from "components/Admin/screen/ConnectionSheet";
import { HistoryPanel } from "components/Admin/screen/HistoryPanel";
import { LoopPanel } from "components/Admin/screen/LoopPanel";
import { Monitors } from "components/Admin/screen/Monitors";
import { Rundown } from "components/Admin/screen/Rundown";
import { SceneBus } from "components/Admin/screen/SceneBus";
import { ScreenHeader } from "components/Admin/screen/ScreenHeader";
import { StreamDeckPanel } from "components/Admin/screen/StreamDeckPanel";
import { TransitionBar } from "components/Admin/screen/TransitionBar";
import { SHORTCUTS, useObsHotkeys } from "components/Admin/screen/useObsHotkeys";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { useObsQueue } from "hooks/useObsQueue";
import { useObsActions, useObsView } from "lib/obs/actions";
import { getObsClient, loadSettings, saveSettings } from "lib/obs/client";
import { useObsExecutor, useObsLoop } from "lib/obs/executor";
import { orpc } from "lib/orpc/client";

const INSTANCE_ID = 1; // 1 = this admin screen, 2 = the standalone app

/** Keeps a tablet awake while it is the desk. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          lock = sentinel;
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener("visibilitychange", request);

    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [active]);
}

export default function ScreenClient() {
  const { obs, status, view } = useObsView(INSTANCE_ID);
  const actions = useObsActions(INSTANCE_ID);
  const queue = useObsQueue(INSTANCE_ID);
  const { isExecutor, busOpen, takeControl } = useObsExecutor(INSTANCE_ID);
  const { data: cues = [] } = useQuery(orpc.obsCue.list.queryOptions({ input: { instanceId: INSTANCE_ID } }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const connected = obs.connection === "connected";

  const remaining = useObsLoop({
    enabled: isExecutor && connected && !queue.state.directMode,
    isPlaying: queue.state.isPlaying,
    items: queue.state.queueItems,
    currentItemIndex: queue.state.currentItemIndex,
    setCurrentItemIndex: queue.setCurrentItemIndex,
  });

  // Scene cards toggle themselves in the loop queue (the old page's quickest way to build one).
  const queued = Object.fromEntries(queue.state.queueItems.map((item, index) => [item.sceneName, index + 1]));
  const toggleQueued = (sceneName: string) => {
    const items = queue.state.queueItems;
    queue.setQueueItems(
      items.some((item) => item.sceneName === sceneName)
        ? items.filter((item) => item.sceneName !== sceneName)
        : [...items, { id: `queue-${Date.now()}-${sceneName}`, sceneName, delay: OBS_CONFIG.delays.default }]
    );
  };

  useObsHotkeys({
    instanceId: INSTANCE_ID,
    cues,
    view,
    actions,
    onHelp: useCallback(() => setHelpOpen((open) => !open), []),
  });
  useWakeLock(connected);

  // Auto-connect with the remembered settings (or ?connect=host:port, handy
  // for a bookmark on the OBS machine); open the sheet if that fails.
  useEffect(() => {
    const client = getObsClient();
    if (client.getSnapshot().connection !== "disconnected") return;
    const settings = loadSettings();
    const deepLink = new URLSearchParams(window.location.search).get("connect");
    if (deepLink) {
      const [address, port] = deepLink.split(":");
      if (address) settings.address = address;
      if (port && Number(port)) settings.port = Number(port);
      saveSettings(settings);
    }
    client.connect(settings).catch(() => setConnectFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Could not reach OBS: offer the settings, unless another tab already drives it (this one is a remote).
  useEffect(() => {
    if (connectFailed && status && !status.executorOnline) {
      setConnectFailed(false);
      setSettingsOpen(true);
    }
  }, [connectFailed, status]);

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 p-4 md:p-6">
      <ScreenHeader
        actions={actions}
        busOpen={busOpen}
        isExecutor={isExecutor}
        obs={obs}
        openSettings={() => setSettingsOpen(true)}
        status={status}
        takeControl={takeControl}
        view={view}
      />

      {view.source === "remote" && (
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Esta pestaña no llega a OBS: ves lo que reporta el puesto de control y cada botón le manda el comando a él.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <Monitors view={view} />
          <TransitionBar actions={actions} view={view} />
          <SceneBus actions={actions} queued={queued} toggleQueued={toggleQueued} view={view} />
          <section className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Loop automático</h2>
            {queue.isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : (
              <LoopPanel isExecutor={isExecutor} queue={queue} remaining={remaining} view={view} />
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-4">
          <section className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Guion</h2>
              <span className="text-xs text-muted-foreground">{cues.length} cues</span>
            </div>
            <Rundown instanceId={INSTANCE_ID} status={status} view={view} />
          </section>
          <section className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Audio</h2>
            <AudioStrip actions={actions} view={view} />
          </section>
        </div>
      </div>

      <Tabs defaultValue="history">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="deck">Stream Deck</TabsTrigger>
          </TabsList>
          <Button
            className="hidden text-muted-foreground sm:inline-flex"
            size="sm"
            variant="ghost"
            onClick={() => setHelpOpen(true)}
          >
            <Keyboard className="h-4 w-4" /> Atajos <Kbd>?</Kbd>
          </Button>
        </div>
        <TabsContent className="rounded-lg border border-border bg-card/50 p-3" value="history">
          <HistoryPanel instanceId={INSTANCE_ID} />
        </TabsContent>
        <TabsContent className="rounded-lg border border-border bg-card/50 p-3" value="deck">
          <StreamDeckPanel />
        </TabsContent>
      </Tabs>

      <ConnectionSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
          </DialogHeader>
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map(([keys, description]) => (
                <tr key={keys} className="border-b border-border/60">
                  <td className="py-1.5 pr-3">
                    <Kbd>{keys}</Kbd>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
