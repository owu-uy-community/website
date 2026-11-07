"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MonitorOff, Play } from "lucide-react";

import { cn } from "app/lib/utils";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { useWakeLock } from "hooks/useWakeLock";
import { orpc } from "lib/orpc";
import {
  INTRO_SLIDES,
  clickerAction,
  introAfter,
  introAt,
  introStep,
  type IntroPosition,
  type IntroSlideId,
} from "lib/owy-stage/openspace-intro";
import {
  MONITOR_READY,
  MONITOR_SHOW,
  OWY_STAGE_CHANNEL,
  SCENES,
  parseSceneParams,
  type SceneParams,
  type StageState,
} from "lib/owy-stage/scenes";

const SCENE = "openspace-intro";
type IntroParams = SceneParams<typeof SCENE>;
const stateKey = () => orpc.owyStage.getState.queryKey();

/** What to say on each build, from the «Intro Open Spaces» deck's notes. */
const NOTES: Record<IntroSlideId, string[]> = {
  portada: [
    "Esta es mi parte favorita del día: el open space.",
    "¿Quién ya participó de un open space antes? Que levante la mano.",
  ],
  "que-es": [
    "¿En qué consiste un open space?",
    "La idea es tener un espacio donde alguien propone un tema y se abre un intercambio alrededor de ese tema.",
    "El formato es intencionalmente bastante abierto. Hay gente que tira un tema o una pregunta y ya arranca el intercambio; otra viene con algo más formato charla, se extiende más y después lo abre.",
  ],
  dinamica: [
    "¿Cómo es la dinámica?",
    "Vamos a tener 5 bloques de 25 minutos cada uno.",
    "En cada uno de estos bloques se dan, en simultáneo, 5 open spaces.",
    "Cada uno en un espacio distinto: Ventana, Centro, Rincón, Lobby y Cueva.",
    "Cada 25 minutos, en cada espacio, viene una persona a presentar un tema nuevo. Al terminar un bloque, mirás la grilla y decidís a dónde ir.",
  ],
  principios: [
    "Cuatro principios. Uno: estamos quienes tenemos que estar. Quienes vinieron son las personas indicadas para esa conversación.",
    "Dos: empieza cuando tiene que empezar.",
    "Tres: termina cuando tiene que terminar.",
    "Cuatro: pasa lo que tiene que pasar.",
  ],
  "dos-pies": [
    "Todos unidos cantando kumbaya. Y tenemos una ley: la de los dos pies, o de la movilidad.",
    "Si en algún momento no estás ni aprendiendo ni aportando, tenés la libertad y la responsabilidad de moverte a otro lugar donde sí puedas aportar o recibir valor.",
  ],
  proponer: [
    "¿Cómo propongo un tema?",
    "Ahora mismo vamos a tener un ratito para armar un «mercado de ideas»: cualquiera puede presentar un tema del que quiere hablar, o una pregunta que le inquieta, y armar un intercambio alrededor.",
    "Quienes quieran proponer un open space agarran una hoja e indican: nombre, tema y si necesitan televisión o pizarra.",
    "No hace falta preparar nada ni ser experto: alcanza con una pregunta que te dé curiosidad o algo que te esté costando en el trabajo.",
  ],
  owy: ["Este año vamos a contar con la ayuda extra de un nuevo personaje. ¡Les presento a Owy!"],
};

/**
 * The intro as the wall shows it: its position lives in the scene's params, so every presenter
 * (a laptop, a phone) drives the same slide. Moves are optimistic, the way the talk's console does
 * them (`useTalkStage`): a fast clicker never waits on the network, and the broadcasts of moves
 * still on their way never rewind it.
 */
function useIntro() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(orpc.owyStage.getState.queryOptions());
  const live = data ?? null;
  const liveRef = useRef(live);
  liveRef.current = live;
  const inflight = useRef(0);
  const latest = useRef(0);

  useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene" && inflight.current === 0) queryClient.setQueryData(stateKey(), payload as StageState);
  });

  const setScene = useMutation(orpc.owyStage.setScene.mutationOptions());
  const mutate = useRef(setScene.mutateAsync);
  mutate.current = setScene.mutateAsync;

  const put = useCallback(
    (next: Partial<IntroParams>) => {
      const current = liveRef.current;
      if (current?.scene !== SCENE) return;
      const params = { ...parseSceneParams(SCENE, current.params), ...next };
      const optimistic: StageState = { ...current, params };
      liveRef.current = optimistic;
      queryClient.setQueryData(stateKey(), optimistic);
      const mine = ++latest.current;
      inflight.current += 1;
      mutate
        .current({ scene: SCENE, params })
        .then((state) => {
          if (mine === latest.current) queryClient.setQueryData(stateKey(), state);
        })
        .catch((error: Error) => {
          toast.error("No se pudo mover la intro", error.message);
          void queryClient.invalidateQueries({ queryKey: stateKey() });
        })
        .finally(() => {
          inflight.current -= 1;
        });
    },
    [queryClient]
  );

  /** From whatever the wall shows to the cover: a take, so the wall wipes in. */
  const start = useCallback(() => {
    void mutate
      .current({ scene: SCENE, params: {} })
      .then((state) => queryClient.setQueryData(stateKey(), state))
      .catch((error: Error) => toast.error("No se pudo poner la intro", error.message));
  }, [queryClient]);

  const params = live?.scene === SCENE ? parseSceneParams(SCENE, live.params) : null;

  return { live, loading: isPending, params, put, start };
}

/** Typing, or inside a dialog or menu: the keys belong to it. */
const busy = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.isContentEditable ||
    el.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null);
const ownsSpace = (el: Element | null) => Boolean(el?.closest("button,a,[role=button],[role=tab]"));
/** After a click, give the focus back so Space keeps meaning "next". */
const press = (action: () => void) => (event: React.MouseEvent<HTMLElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
  action();
};

/** The next build as the wall will show it: a preview monitor, fed by message. */
function NextMonitor({ state }: { state: StageState }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const post = useCallback(
    () =>
      frame.current?.contentWindow?.postMessage(
        { type: MONITOR_SHOW, state: stateRef.current },
        window.location.origin
      ),
    []
  );
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === MONITOR_READY) post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);
  const key = JSON.stringify(state.params);
  useEffect(post, [post, key]);

  return <ScaledFrame frameRef={frame} src="/owy/stage?monitor=preview" title="Siguiente" />;
}

function Monitor({
  label,
  live = false,
  className,
  children,
}: {
  label: string;
  live?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-center gap-1.5 px-0.5">
        {live && <span className="size-1.5 rounded-full bg-live" />}
        <MicroLabel className="truncate">{label}</MicroLabel>
      </div>
      {children}
    </div>
  );
}

/**
 * The open space intro's presenter view: what is on the wall, what comes next, what to say, and
 * the clicker. A USB presenter clicker plugged into this laptop moves the wall (PageDown/PageUp or
 * the arrows; B or . blacks it out).
 */
export function IntroPresenter() {
  const { live, loading, params, put, start } = useIntro();
  useWakeLock(true);
  const at = params ? introAt(params) : null;
  const next = params ? introAfter(params) : null;

  const go = useCallback(
    (to: IntroPosition | null) => to && put({ slide: to.slide, build: to.build, blank: false }),
    [put]
  );

  const keys = useRef({ params, put });
  keys.current = { params, put };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || busy(event.target)) return;
      const action = clickerAction(event.key);
      if (!action || (event.key === " " && ownsSpace(document.activeElement))) return;
      // F5 included: a reload in the middle of the intro would leave the presenter blind.
      event.preventDefault();
      // A held clicker button repeats its key: one press is one build.
      if (event.repeat) return;
      const { params: current, put: move } = keys.current;
      if (!current) return;
      if (action === "blank") return move({ blank: !current.blank });
      const to = introStep(current, action);
      if (to) move({ ...to, blank: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showing = live ? (SCENES[live.scene]?.title ?? live.scene) : "…";
  const upcoming: StageState | null =
    live && params && next ? { ...live, params: { ...params, ...next, blank: false }, transition: undefined } : null;

  return (
    <div className="flex h-(--admin-content-h) flex-col gap-2 overflow-y-auto p-2">
      {!params && (
        <Panel className="flex shrink-0 flex-wrap items-center gap-4 border-primary/40 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-ui font-semibold">La pantalla está en «{showing}».</p>
            <p className="text-meta text-muted-foreground">
              La intro arranca en la portada; después el clicker la pasa build por build.
            </p>
          </div>
          <Button disabled={loading} size="lg" onClick={start}>
            <Play /> Poner la intro al aire
          </Button>
        </Panel>
      )}
      <div className="grid shrink-0 gap-2 md:grid-cols-2">
        <Monitor label="Al aire" live>
          <ScaledFrame src="/owy/stage?monitor=program" title="Al aire" />
        </Monitor>
        <Monitor className="max-md:hidden" label={next ? `Siguiente · ${introAt(next).slide.title}` : "Siguiente"}>
          {upcoming ? (
            <NextMonitor state={upcoming} />
          ) : (
            <div className="grid aspect-video place-items-center rounded-md bg-black text-meta text-muted-foreground">
              {params ? "Fin de la intro" : "—"}
            </div>
          )}
        </Monitor>
      </div>
      <Panel className="flex min-h-[18rem] flex-1 flex-col">
        <PanelHead
          meta={at && at.slide.builds > 1 ? `paso ${at.build + 1} de ${at.slide.builds}` : undefined}
          title={at ? `${at.index + 1}/${INTRO_SLIDES.length} · ${at.slide.title}` : "Intro al open space"}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-2xl leading-snug text-balance">
            {at ? NOTES[at.slide.id][at.build] : "Poné la intro al aire para pasarla desde acá."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INTRO_SLIDES.map((slide, i) => (
              <Button
                key={slide.id}
                disabled={!params}
                size="sm"
                variant={at?.slide.id === slide.id ? "default" : "outline"}
                onClick={press(() => go({ slide: slide.id, build: 0 }))}
              >
                {i + 1}. {slide.title}
              </Button>
            ))}
          </div>
          <p className="mt-auto text-meta text-muted-foreground">
            Sin red o con la laptop conectada directo al proyector: abrí /owy/stage/openspace-intro en pantalla completa
            y el clicker la pasa ahí mismo, sin el admin.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border p-2">
          <Button
            className="flex-1"
            disabled={!params}
            size="lg"
            variant="outline"
            onClick={press(() => go(params && introStep(params, "prev")))}
          >
            <ChevronLeft /> Anterior <Kbd>←</Kbd>
          </Button>
          <Button
            disabled={!params}
            size="lg"
            variant={params?.blank ? "destructive" : "outline"}
            onClick={press(() => params && put({ blank: !params.blank }))}
          >
            <MonitorOff /> {params?.blank ? "Volver" : "Negro"} <Kbd>B</Kbd>
          </Button>
          <Button className="flex-1" disabled={!params || !next} size="lg" onClick={press(() => go(next))}>
            Siguiente <ChevronRight /> <Kbd>→</Kbd>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
