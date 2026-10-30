"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, Keyboard, ListVideo, Repeat } from "lucide-react";

import { OBS_CONFIG } from "app/lib/constants";
import { Notice } from "components/Admin/panel";
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
import { useObsHotkeys } from "components/Admin/screen/useObsHotkeys";
import { HeaderActions } from "components/Admin/shell/HeaderActions";
import { openShortcutSheet } from "components/Admin/shell/shortcuts";
import { PageContainer, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { useObsQueue } from "hooks/useObsQueue";
import { useWakeLock } from "hooks/useWakeLock";
import { useObsActions, useObsView } from "lib/obs/actions";
import { getObsClient, loadSettings, saveSettings } from "lib/obs/client";
import { useObsExecutor, useObsLoop } from "lib/obs/executor";
import { orpc } from "lib/orpc/client";

const INSTANCE_ID = 1; // 1 = this admin screen, 2 = the standalone app

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function ScreenClient() {
  const { obs, status, view } = useObsView(INSTANCE_ID);
  const actions = useObsActions(INSTANCE_ID);
  const queue = useObsQueue(INSTANCE_ID);
  const { isExecutor, busOpen, takeControl } = useObsExecutor(INSTANCE_ID);
  const { data: cues = [] } = useQuery(orpc.obsCue.list.queryOptions({ input: { instanceId: INSTANCE_ID } }));
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useObsHotkeys({ instanceId: INSTANCE_ID, cues, view, actions });
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

  const loopItems = queue.state.queueItems;
  const loopSeconds = loopItems.reduce((total, item) => total + item.delay, 0);

  return (
    <>
      <HeaderActions>
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
      </HeaderActions>
      <h1 className="sr-only">OBS</h1>

      <PageContainer className="space-y-4 pt-4" size="large">
        {view.source === "remote" && (
          <Notice tone="info">
            Esta pestaña no llega a OBS: ves lo que reporta el puesto de control y cada botón le manda el comando a él.
          </Notice>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <div className="min-w-0 space-y-4">
            <Monitors view={view} />
            <TransitionBar actions={actions} view={view} />
            <SceneBus actions={actions} queued={queued} toggleQueued={toggleQueued} view={view} />
            <Panel>
              <PanelHead
                icon={Repeat}
                meta={
                  loopItems.length
                    ? `${plural(loopItems.length, "escena", "escenas")} · ${loopSeconds} s la vuelta`
                    : undefined
                }
                title="Loop automático"
              />
              <div className="p-3.5">
                {queue.isLoading ? (
                  <Skeleton className="h-24" />
                ) : (
                  <LoopPanel isExecutor={isExecutor} queue={queue} remaining={remaining} view={view} />
                )}
              </div>
            </Panel>
          </div>
          <div className="min-w-0 space-y-4">
            <Panel>
              <PanelHead icon={ListVideo} meta={plural(cues.length, "cue", "cues")} title="Guion" />
              <div className="p-3">
                <Rundown instanceId={INSTANCE_ID} status={status} view={view} />
              </div>
            </Panel>
            <Panel>
              <PanelHead
                icon={AudioLines}
                meta={view.connected ? plural(view.inputs.length, "fuente", "fuentes") : undefined}
                title="Audio"
              />
              <div className="p-3.5">
                <AudioStrip actions={actions} view={view} />
              </div>
            </Panel>
          </div>
        </div>

        <Panel>
          <Tabs defaultValue="history">
            <div className="flex h-11 items-center gap-2 border-b border-border px-3">
              <TabsList>
                <TabsTrigger value="history">Historial</TabsTrigger>
                <TabsTrigger value="deck">Stream Deck</TabsTrigger>
              </TabsList>
              <Button className="ml-auto max-sm:hidden" size="sm" variant="ghost" onClick={openShortcutSheet}>
                <Keyboard /> Atajos <Kbd>?</Kbd>
              </Button>
            </div>
            <TabsContent className="mt-0 p-3.5" value="history">
              <HistoryPanel instanceId={INSTANCE_ID} />
            </TabsContent>
            <TabsContent className="mt-0 p-3.5" value="deck">
              <StreamDeckPanel />
            </TabsContent>
          </Tabs>
        </Panel>
      </PageContainer>

      <ConnectionSheet
        open={settingsOpen}
        seat={{ isExecutor, executorOnline: Boolean(status?.executorOnline), takeControl }}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}
