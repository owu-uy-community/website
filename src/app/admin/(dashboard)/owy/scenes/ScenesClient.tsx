"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDefaultLayout } from "react-resizable-panels";

import { HeaderActions } from "components/Admin/shell/HeaderActions";
import { useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { Inspector } from "components/Admin/stage/Inspector";
import { Monitors } from "components/Admin/stage/Monitors";
import { Queue } from "components/Admin/stage/Queue";
import { RundownPanel, useRundown } from "components/Admin/stage/Rundown";
import { SceneLibrary, type LibraryActions, type LibraryTally } from "components/Admin/stage/SceneLibrary";
import { ScenePalette } from "components/Admin/stage/ScenePalette";
import {
  StageSettingsSheet,
  copyText,
  useSpotifyReturn,
  type OutputSettings,
} from "components/Admin/stage/StageSettingsSheet";
import { StageToolbar } from "components/Admin/stage/StageToolbar";
import { useDesk } from "components/Admin/stage/useDesk";
import { SHORTCUTS, releaseFocus, useStageHotkeys } from "components/Admin/stage/useStageHotkeys";
import { useStoredState } from "components/Admin/stage/useStoredState";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "components/shared/ui/resizable";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { useWakeLock } from "hooks/useWakeLock";
import { orpc } from "lib/orpc";
import { CANVAS_PRESETS, DEFAULT_CANVAS } from "lib/owy-stage/canvas";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  SCENE_IDS,
  isSceneId,
  parseSceneParams,
  type DeskStep,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

type Target = "preview" | "program";
type Params = Record<string, unknown>;

const isOutput = (value: unknown): value is OutputSettings =>
  Boolean(value) &&
  typeof (value as OutputSettings).transparent === "boolean" &&
  ["", "ucu", "fit"].includes((value as OutputSettings).canvas);
const isSceneList = (value: unknown): value is SceneId[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string" && isSceneId(id));

const noop = () => () => undefined;
/** True once on the client: the desk reads localStorage while it renders (layout, filters, settings). */
const useMounted = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false
  );

const WIDE = "(min-width: 1024px)";
/** Landscape tablets and laptops get the desk; anything narrower, stacked tabs. */
const useWide = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);

      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  );

export default function ScenesClient() {
  const mounted = useMounted();

  if (!mounted)
    return (
      <div className="h-[calc(100dvh-3.5rem)] p-2">
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    );

  return <Desk />;
}

/**
 * The wall's control desk: PREVIEW → TAKE → AL AIRE, with the queue feeding
 * the preview, the library to pick from, the guion for unattended loops and
 * the params of whatever is being prepared. Shared state lives on the server
 * (the wall, the desk, the guion), so the laptop and the tablet run the same
 * show; layout and filters are per device.
 */
function Desk() {
  const queryClient = useQueryClient();
  const { events, selected } = useSelectedEvent();
  const stateKey = orpc.owyStage.getState.queryKey();
  const { data } = useQuery(orpc.owyStage.getState.queryOptions());
  const live: StageState = data ?? DEFAULT_STAGE_STATE;
  const liveRef = useRef(live);
  liveRef.current = live;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const wide = useWide();

  const [target, setTarget] = useState<Target>("preview");
  const [tab, setTab] = useState<"library" | "guion">("library");
  const [replay, setReplay] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [output, setOutput] = useStoredState<OutputSettings>(
    "owy-stage-output",
    { transparent: false, canvas: "" },
    isOutput
  );
  const [recent, setRecent] = useStoredState<SceneId[]>("owy-stage-recent", [], isSceneList);

  useWakeLock(true);
  useSpotifyReturn();

  // Server publishes carry no sender id, so our own takes echo back too: the cache is the truth.
  const { isConnected } = useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene") queryClient.setQueryData(stateKey, payload as StageState);
  });

  const setScene = useMutation(
    orpc.owyStage.setScene.mutationOptions({
      onSuccess: (state) => queryClient.setQueryData(stateKey, state),
      onError: (error) => toast.error("No se pudo cambiar la escena", error.message),
    })
  );
  const setSceneRef = useRef(setScene.mutate);
  setSceneRef.current = setScene.mutate;

  const markRecent = useCallback(
    (id: SceneId) => setRecent((previous) => [id, ...previous.filter((other) => other !== id)].slice(0, 12)),
    [setRecent]
  );

  /**
   * Straight to the wall: the guion, «Al aire ya», live edits. `restart` puts
   * the scene on air from scratch (new round); an edit keeps it. Empty params
   * mean the scene's defaults — or what is already up, for the scene on air.
   */
  const put = useCallback(
    (scene: SceneId, params: Params | undefined, restart: boolean) => {
      const current = liveRef.current;
      setSceneRef.current({
        scene,
        params: params && Object.keys(params).length ? params : current.scene === scene ? current.params : {},
        eventId: current.eventId ?? selectedRef.current?.id ?? null,
        restart,
      });
      if (restart) markRecent(scene);
    },
    [markRecent]
  );

  const rundown = useRundown(put, live.scene);
  const rundownRef = useRef(rundown);
  rundownRef.current = rundown;

  const onAir = useCallback(
    (state: StageState) => {
      queryClient.setQueryData(orpc.owyStage.getState.queryKey(), state);
      markRecent(state.scene);
    },
    [queryClient, markRecent]
  );
  const { desk, taking, actions } = useDesk(live, onAir);
  const deskRef = useRef(desk);
  deskRef.current = desk;

  const stageUrl = useCallback(
    (path: string) => {
      const query = new URLSearchParams();
      if (output.transparent) query.set("bg", "transparent");
      if (output.canvas) query.set("canvas", output.canvas);
      const search = query.toString();

      return `${window.location.origin}${path}${search ? `?${search}` : ""}`;
    },
    [output]
  );
  const stageUrlRef = useRef(stageUrl);
  stageUrlRef.current = stageUrl;
  const canvas = output.canvas === "ucu" ? CANVAS_PRESETS.ucu : DEFAULT_CANVAS;

  const libraryActions = useMemo<LibraryActions>(
    () => ({
      pick: (id) => {
        actions.pick(id);
        setTarget("preview");
      },
      queue: (id) => actions.enqueue(id),
      airNow: (id) => put(id, {}, true),
      guion: (id) => rundownRef.current.add(id),
      toggleFavorite: actions.toggleFavorite,
      copyUrl: (id) => copyText(stageUrlRef.current(`/owy/stage/${id}`)),
    }),
    [actions, put]
  );
  const queueActions = useMemo(
    () => ({
      ...actions,
      cueQueued: (id: string) => {
        actions.cueQueued(id);
        setTarget("preview");
      },
      airNow: (step: DeskStep) => {
        put(step.scene, step.params, true);
        actions.remove(step.id);
      },
    }),
    [actions, put]
  );

  const tally = useMemo<LibraryTally>(() => {
    const queued = new Map<SceneId, number>();
    desk.queue.forEach((step, index) => {
      if (!queued.has(step.scene)) queued.set(step.scene, index + 1);
    });

    return { live: live.scene, preview: desk.preview?.scene ?? null, queued };
  }, [live.scene, desk.preview?.scene, desk.queue]);

  const take = useCallback(() => void actions.take(), [actions]);
  const clearPreview = actions.clearPreview;
  const copyLive = useCallback(() => {
    actions.copyLive();
    setTarget("preview");
  }, [actions]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const replayPreview = useCallback(() => setReplay((value) => value + 1), []);
  const onLiveParams = useCallback((params: Params) => put(liveRef.current.scene, params, false), [put]);
  // No success toasts on the desk: they'd sit on the inspector mid-show, and the queue shows the change.
  const choose = useCallback(
    (id: SceneId, intent: "preview" | "queue" | "air") => {
      if (intent === "queue") actions.enqueue(id);
      else if (intent === "air") put(id, {}, true);
      else libraryActions.pick(id);
    },
    [actions, put, libraryActions]
  );

  useStageHotkeys({
    take,
    search: openPalette,
    queue: actions.enqueuePreview,
    favorite: (index, air) => {
      const id = deskRef.current.favorites[index];
      if (!id) return;
      if (air) put(id, {}, true);
      else libraryActions.pick(id);
    },
    guionToggle: rundown.toggle,
    guionStep: rundown.skip,
    help: () => setHelpOpen((open) => !open),
  });

  const liveParams = useMemo(() => parseSceneParams(live.scene, live.params) as Params, [live.scene, live.params]);
  const mainLayout = useDefaultLayout({ id: "owy-desk", storage: localStorage });
  const stageLayout = useDefaultLayout({ id: "owy-desk-stage", storage: localStorage });
  const listsLayout = useDefaultLayout({ id: "owy-desk-lists", storage: localStorage });

  const monitors = (
    <Monitors
      canvas={canvas}
      live={live}
      next={desk.queue[0] ?? null}
      preview={desk.preview}
      replay={replay}
      taking={taking}
      target={target}
      onClearPreview={clearPreview}
      onCopyLive={copyLive}
      onReplay={replayPreview}
      onSearch={openPalette}
      onTake={take}
      onTarget={setTarget}
    />
  );
  const inspector = (
    <Inspector
      live={live}
      pending={setScene.isPending}
      preview={desk.preview}
      target={target}
      onCopyLive={copyLive}
      onEnqueuePreview={actions.enqueuePreview}
      onLiveParams={onLiveParams}
      onPreviewParams={actions.editPreview}
      onTarget={setTarget}
    />
  );
  const queue = <Queue actions={queueActions} queue={desk.queue} />;
  const library = <SceneLibrary actions={libraryActions} favorites={desk.favorites} recent={recent} tally={tally} />;
  const guion = <RundownPanel liveParams={liveParams} liveScene={live.scene} rundown={rundown} />;
  const searchButton = (
    <Button
      className="ml-auto h-9 w-full max-w-60 justify-start gap-2 px-3 font-normal text-muted-foreground"
      variant="outline"
      onClick={(event) => {
        openPalette();
        releaseFocus(event);
      }}
    >
      <Search className="h-4 w-4" />
      Buscar escena…
      <Kbd className="ml-auto pointer-coarse:hidden">/</Kbd>
    </Button>
  );

  return (
    <>
      <HeaderActions>
        <StageToolbar
          connected={isConnected}
          rundown={rundown}
          onGuion={() => setTab("guion")}
          onHelp={() => setHelpOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      </HeaderActions>

      {wide ? (
        <div className="h-[calc(100dvh-3.5rem)] min-h-[540px] p-2">
          <ResizablePanelGroup
            defaultLayout={mainLayout.defaultLayout}
            id="owy-desk"
            orientation="horizontal"
            resizeTargetMinimumSize={{ coarse: 32, fine: 12 }}
            onLayoutChanged={mainLayout.onLayoutChanged}
          >
            <ResizablePanel id="stage" minSize="50%">
              <ResizablePanelGroup
                defaultLayout={stageLayout.defaultLayout}
                id="owy-desk-stage"
                orientation="vertical"
                resizeTargetMinimumSize={{ coarse: 32, fine: 12 }}
                onLayoutChanged={stageLayout.onLayoutChanged}
              >
                <ResizablePanel defaultSize="42%" id="monitors" maxSize="72%" minSize="24%">
                  <div className="h-full overflow-hidden rounded-xl border bg-card">{monitors}</div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="lists" minSize="24%">
                  <ResizablePanelGroup
                    defaultLayout={listsLayout.defaultLayout}
                    id="owy-desk-lists"
                    orientation="horizontal"
                    resizeTargetMinimumSize={{ coarse: 32, fine: 12 }}
                    onLayoutChanged={listsLayout.onLayoutChanged}
                  >
                    <ResizablePanel defaultSize="32%" id="queue" maxSize="55%" minSize="20%">
                      <div className="h-full overflow-hidden rounded-xl border bg-card">{queue}</div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel id="library" minSize="35%">
                      <Tabs
                        className="flex h-full flex-col overflow-hidden rounded-xl border bg-card"
                        value={tab}
                        onValueChange={(value) => setTab(value as "library" | "guion")}
                      >
                        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
                          <TabsList className="h-9">
                            <TabsTrigger className="gap-1.5" value="library">
                              Biblioteca <span className="text-xs text-muted-foreground">{SCENE_IDS.length}</span>
                            </TabsTrigger>
                            <TabsTrigger className="gap-1.5" value="guion">
                              Guion <span className="text-xs text-muted-foreground">{rundown.steps.length}</span>
                            </TabsTrigger>
                          </TabsList>
                          {searchButton}
                        </div>
                        <TabsContent className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden" value="library">
                          {library}
                        </TabsContent>
                        <TabsContent className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden" value="guion">
                          {guion}
                        </TabsContent>
                      </Tabs>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              defaultSize={340}
              groupResizeBehavior="preserve-pixel-size"
              id="inspector"
              maxSize="42%"
              minSize={290}
            >
              <div className="h-full overflow-hidden rounded-xl border bg-card">{inspector}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        // Phones and portrait tablets: the same pieces, stacked.
        <div className="space-y-3 p-3">
          <div className="h-[clamp(200px,31vw,420px)] overflow-hidden rounded-xl border bg-card">{monitors}</div>
          <Tabs defaultValue="params">
            <TabsList className="grid h-auto w-full grid-cols-4">
              <TabsTrigger value="params">Parámetros</TabsTrigger>
              <TabsTrigger value="queue">Cola · {desk.queue.length}</TabsTrigger>
              <TabsTrigger value="library">Biblioteca</TabsTrigger>
              <TabsTrigger value="guion">Guion</TabsTrigger>
            </TabsList>
            {(
              [
                ["params", inspector],
                ["queue", queue],
                ["library", library],
                ["guion", guion],
              ] as const
            ).map(([value, content]) => (
              <TabsContent key={value} className="h-[70dvh] overflow-hidden rounded-xl border bg-card" value={value}>
                {value === "library" ? (
                  <div className="flex h-full flex-col">
                    <div className="flex h-12 shrink-0 items-center border-b px-2">{searchButton}</div>
                    <div className="min-h-0 flex-1">{content}</div>
                  </div>
                ) : (
                  content
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      <ScenePalette
        favorites={desk.favorites}
        open={paletteOpen}
        recent={recent}
        onChoose={choose}
        onOpenChange={setPaletteOpen}
      />
      <StageSettingsSheet
        events={events}
        live={live}
        open={settingsOpen}
        output={output}
        stageUrl={stageUrl}
        onEvent={(eventId) => setScene.mutate({ scene: live.scene, params: live.params, eventId })}
        onOpenChange={setSettingsOpen}
        onOutput={setOutput}
      />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
            <DialogDescription>Funcionan mientras no estés escribiendo en un campo.</DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map(([keys, description]) => (
                <tr key={keys} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <Kbd>{keys}</Kbd>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </>
  );
}
