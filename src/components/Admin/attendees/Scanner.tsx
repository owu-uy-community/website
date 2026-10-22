"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BarcodeDetector as Detector } from "barcode-detector/ponyfill";
import {
  ArrowLeft,
  Camera,
  Check,
  CloudOff,
  Keyboard,
  Pencil,
  ScanLine,
  Search,
  TriangleAlert,
  Vibrate,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Meter, MicroLabel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { useWakeLock } from "hooks/useWakeLock";
import { client, orpc } from "lib/orpc";
import type { Attendee, ScanResult } from "lib/orpc/attendees/schemas";
import { eventChannel } from "lib/realtime/channels";

import { doorOf } from "./helpers";
import { enqueue, flush, isTransient, readQueue, type QueuedScan } from "./scan-queue";

type Tone = "ok" | "warn" | "bad" | "queued";
type Shown = { tone: Tone; label: string; title: string; detail: string };

/** Eventbrite tickets carry a QR; some printers use a plain barcode. */
const FORMATS = ["qr_code", "code_128"] as const;
const RESULT_MS = 3000;
const DEVICE_KEY = "owu-scanner:device";

const TONES: Record<Tone, { box: string; icon: string; text: string; Icon: typeof Check }> = {
  ok: {
    box: "border-success/40 bg-success-surface",
    icon: "bg-success text-black",
    text: "text-success-foreground",
    Icon: Check,
  },
  warn: {
    box: "border-warning/40 bg-warning-surface",
    icon: "bg-warning text-black",
    text: "text-warning-foreground",
    Icon: TriangleAlert,
  },
  bad: { box: "border-live/40 bg-live-surface", icon: "bg-live text-white", text: "text-live-foreground", Icon: X },
  queued: {
    box: "border-info/40 bg-info-surface",
    icon: "bg-info text-white",
    text: "text-info-foreground",
    Icon: CloudOff,
  },
};

function describe(result: ScanResult, timezone: string): Shown {
  const person = result.attendee;
  const clock = (at: string | null | undefined) => (at ? formatClock(new Date(at), timezone) : "");
  switch (result.result) {
    case "ok":
      return {
        tone: "ok",
        label: `Adelante · ${clock(result.scannedAt)}`,
        title: person?.name ?? "Adelante",
        detail: person?.ticketClass || "Entrada válida",
      };
    case "repeat":
      return {
        tone: "warn",
        label: "Ya entró",
        title: person?.name ?? "Ya entró",
        detail: person?.checkedInAt
          ? `Entró a las ${clock(person.checkedInAt)} · ${doorOf(person)}`
          : "Esta entrada ya se usó",
      };
    case "cancelled":
      return {
        tone: "bad",
        label: person?.status === "refunded" ? "Entrada reembolsada" : "Entrada cancelada",
        title: person?.name ?? "Entrada cancelada",
        detail: "No sirve para entrar: que pase por la mesa de ayuda.",
      };
    case "unknown":
      return {
        tone: "bad",
        label: "Entrada no válida",
        title: "No es una entrada de este evento",
        detail: "Que pase por la mesa de ayuda con su email.",
      };
  }
}

const QUEUED: Shown = {
  tone: "queued",
  label: "Sin señal",
  title: "Guardado para mandar después",
  detail: "Mirá la entrada a ojo: se registra cuando vuelva la conexión.",
};

type CameraState = "off" | "starting" | "on" | "denied" | "unavailable" | "unsupported" | "reader";

/** Why there's no camera, and whether trying again can help. Buscar and Código work either way. */
const CAMERA_PROBLEMS: Partial<Record<CameraState, { title: string; detail: string; retry: boolean }>> = {
  denied: {
    title: "Sin permiso para la cámara",
    detail: "Habilitala en los ajustes del navegador, o acreditá con Buscar o Código.",
    retry: true,
  },
  unavailable: {
    title: "La cámara no está disponible",
    detail: "Si otra app la está usando, cerrala y probá de nuevo. Mientras, acreditá con Buscar o Código.",
    retry: true,
  },
  reader: {
    title: "No se pudo preparar el lector de QR",
    detail: "La primera vez necesita señal. Probá de nuevo, o acreditá con Buscar o Código.",
    retry: true,
  },
  unsupported: {
    title: "Este navegador no deja usar la cámara",
    detail: "Acreditá con Buscar o Código.",
    retry: false,
  },
};

/** A short sound and a buzz per result, so the door doesn't have to look at the screen. */
function useFeedback() {
  const audio = useRef<AudioContext | null>(null);

  // Sound and buzz are a nicety: a device that can't make them must never lose the scan that asked.
  const unlock = useCallback(() => {
    // Browsers only allow sound after a tap; the first tap on the scanner opens it.
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      audio.current = null;
    }
  }, []);

  const play = useCallback((tone: Tone) => {
    try {
      navigator.vibrate?.(tone === "ok" ? 80 : [140, 80, 140]);
      const context = audio.current;
      if (!context) return;
      const notes = tone === "ok" ? [880, 1320] : tone === "warn" ? [620, 620] : tone === "bad" ? [240, 190] : [520];
      notes.forEach((frequency, index) => {
        const start = context.currentTime + index * 0.16;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone === "bad" ? "square" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.15);
      });
    } catch {
      // No sound this time; the answer is on screen.
    }
  }, []);

  return { unlock, play };
}

/**
 * The native detector when the browser has one that reads QR codes; the WebAssembly one otherwise (iOS Safari).
 * That one downloads its reader first: wait for it here, so a download that fails (no signal) says so instead of
 * leaving a camera that never reads anything.
 */
async function makeDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: typeof Detector }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes("qr_code")) return new Native({ formats: [...FORMATS] });
  const { BarcodeDetector, prepareZXingModule, purgeZXingModule } = await import("barcode-detector/ponyfill");
  try {
    await prepareZXingModule({ fireImmediately: true });
  } catch (error) {
    // A failed download stays cached until it's forgotten: forget it, so the next try downloads it again.
    purgeZXingModule();
    throw error;
  }
  return new BarcodeDetector({ formats: [...FORMATS] });
}

/** Camera errors in the door's words: the person (or a setting) said no, or there's no camera free to use. */
const cameraError = (error: unknown) =>
  error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
    ? "denied"
    : "unavailable";

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const code = (attendee: Pick<Attendee, "barcode" | "eventbriteId">) => attendee.barcode ?? attendee.eventbriteId;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Find someone without their QR (forgot it, phone dead): by name or email, then check them in. */
function ManualSearch({
  eventId,
  timezone,
  online,
  busy,
  onPick,
}: {
  eventId: string;
  timezone: string;
  online: boolean;
  /** A check-in on its way: one at a time. */
  busy: boolean;
  onPick: (code: string) => void;
}) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const found = useQuery(
    orpc.attendees.list.queryOptions({
      input: { eventId, q, pageSize: 10 },
      enabled: online && q.length >= 2,
      // The last results stay while the next letter's arrive.
      placeholderData: keepPreviousData,
    })
  );

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Input
        // The door is looking for someone: the keyboard should already be up.
        autoFocus
        aria-label="Buscar por nombre o email"
        autoComplete="off"
        autoCorrect="off"
        className="h-11 text-base"
        enterKeyHint="search"
        placeholder="Nombre o email…"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!online ? (
          <p className="text-ui text-muted-foreground">
            Sin señal no se puede buscar: escribí el código de la entrada.
          </p>
        ) : q.length < 2 ? (
          <p className="text-ui text-muted-foreground">Escribí al menos dos letras.</p>
        ) : found.isError ? (
          <p className="text-ui text-live-foreground">No se pudo buscar: {found.error.message}</p>
        ) : !found.data ? (
          <p className="text-ui text-muted-foreground">Buscando…</p>
        ) : found.data.rows.length === 0 ? (
          <p className="text-ui text-muted-foreground">Nadie con ese nombre o email.</p>
        ) : (
          <ul className="divide-y divide-border">
            {found.data?.rows.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground">{person.name}</p>
                  <p className="truncate text-meta text-muted-foreground">
                    {person.ticketClass}
                    {person.checkedInAt
                      ? ` · entró ${formatClock(new Date(person.checkedInAt), timezone)}`
                      : person.status !== "attending"
                        ? " · cancelada"
                        : ""}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  size="touch"
                  variant={person.checkedInAt ? "outline" : "default"}
                  onClick={() => onPick(code(person))}
                >
                  Acreditar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ManualCode({ busy, onSubmit }: { busy: boolean; onSubmit: (code: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // A code that wasn't taken (another one still on its way) stays typed, to send again.
    if (text.trim() && (await onSubmit(text.trim()))) setText("");
  };

  return (
    <form className="flex h-full flex-col gap-3 p-4" onSubmit={(event) => void submit(event)}>
      <label className="text-ui text-subtle" htmlFor="scanner-code">
        El número debajo del QR de la entrada
      </label>
      <Input
        autoFocus
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="h-11 font-terminal text-base tracking-wide"
        enterKeyHint="go"
        id="scanner-code"
        inputMode="numeric"
        placeholder="Código de la entrada"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button disabled={!text.trim() || busy} size="touch" type="submit">
        {busy ? "Acreditando…" : "Acreditar"}
      </Button>
    </form>
  );
}

/**
 * OWU's own door scanner (beta), phone first: camera + barcode reading, a big answer with a
 * sound and a buzz, back to the camera in 3 s. Without signal scans wait in a queue and go out
 * when it comes back. What it checks in stays in OWU: Eventbrite can't be told.
 */
export function Scanner({
  eventId,
  eventName,
  timezone,
  backHref,
}: {
  eventId: string;
  eventName: string;
  timezone: string;
  backHref: string;
}) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const loadingRef = useRef<Promise<Detector> | null>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const busyRef = useRef(false);
  const { unlock, play } = useFeedback();
  const [camera, setCamera] = useState<CameraState>("off");
  const [mode, setMode] = useState<"camera" | "search" | "code">("camera");
  const [shown, setShown] = useState<Shown | null>(null);
  const [sending, setSending] = useState(false);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [device, setDevice] = useState("Puerta");
  const [editingDevice, setEditingDevice] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  useWakeLock(true);

  const counts = useQuery(orpc.attendees.list.queryOptions({ input: { eventId, pageSize: 10 } }));
  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "checkins") void queryClient.invalidateQueries({ queryKey: orpc.attendees.list.key() });
  });

  useEffect(() => {
    setQueue(readQueue(eventId, localStorage));
    setDevice(localStorage.getItem(DEVICE_KEY) || "Puerta");
  }, [eventId]);

  /** One detector for the page; a failed load is forgotten, so the next try starts over. */
  const loadDetector = useCallback(() => {
    loadingRef.current ??= makeDetector().then(
      (made) => (detectorRef.current = made),
      (error: unknown) => {
        loadingRef.current = null;
        throw error;
      }
    );
    return loadingRef.current;
  }, []);

  // Get the reader ready while there's signal: the camera may be turned on once it's gone.
  useEffect(() => {
    loadDetector().catch(() => {});
  }, [loadDetector]);

  const show = useCallback(
    (next: Shown) => {
      setShown(next);
      play(next.tone);
    },
    [play]
  );

  // Back to the camera after a moment; a tap gets there sooner.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  const submit = useCallback(
    async (raw: string, from: "camera" | "manual") => {
      const ticket = raw.trim();
      // The camera keeps seeing a QR while it's held up: once is enough, until it's been out of view a while.
      if (!ticket || busyRef.current) return false;
      if (from === "camera" && ticket === lastRef.current.code && Date.now() - lastRef.current.at < 6000) {
        lastRef.current.at = Date.now();
        return false;
      }
      lastRef.current = { code: ticket, at: Date.now() };
      const scan: QueuedScan = {
        nonce: crypto.randomUUID(),
        code: ticket,
        device,
        scannedAt: new Date().toISOString(),
      };
      const keep = () => {
        setQueue(enqueue(eventId, scan, localStorage));
        show(QUEUED);
      };
      if (!navigator.onLine) {
        keep();
        return true;
      }
      busyRef.current = true;
      setSending(true);
      try {
        show(describe(await client.attendees.scan({ eventId, ...scan }), timezone));
      } catch (error) {
        if (isTransient(error)) keep();
        else
          show({
            tone: "bad",
            label: "No se pudo",
            title: "El escaneo no se registró",
            detail: error instanceof Error ? error.message : "Probá de nuevo",
          });
      } finally {
        busyRef.current = false;
        setSending(false);
      }
      return true;
    },
    [device, eventId, show, timezone]
  );

  // Scans made without signal go out as soon as it's back (and every 15 s while some wait).
  useEffect(() => {
    if (!online || queue.length === 0) return;
    let cancelled = false;
    const send = async () => {
      const { sent, left } = await flush(eventId, localStorage, (scan) => client.attendees.scan({ eventId, ...scan }));
      if (cancelled) return;
      setQueue(left);
      if (sent.length > 0) {
        const repeats = sent.filter((result) => result.result !== "ok").length;
        toast.success(
          sent.length === 1 ? "Se mandó 1 escaneo sin señal" : `Se mandaron ${sent.length} escaneos sin señal`,
          repeats ? `${repeats} no eran válidos o ya habían entrado: revisá Llegadas.` : undefined
        );
      }
    };
    void send();
    const timer = setInterval(() => void send(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [online, queue.length, eventId]);

  const stopCamera = () => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  };

  const startCamera = async () => {
    unlock();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      stopCamera();
      setCamera(cameraError(error));
      return;
    }
    try {
      await loadDetector();
      setCamera("on");
    } catch {
      // The camera works but nothing can read its frames: don't keep it on for nothing.
      stopCamera();
      setCamera("reader");
    }
  };

  useEffect(
    () => () => {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    },
    []
  );

  // Read frames while the camera is showing and no answer is on screen.
  useEffect(() => {
    if (camera !== "on" || mode !== "camera" || shown) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (stopped || !video || !detector) return;
      let taken = false;
      try {
        if (video.readyState >= 2) {
          const [found] = await detector.detect(video);
          if (found?.rawValue && !stopped) taken = await submit(found.rawValue, "camera");
        }
      } catch {
        // A frame that couldn't be read: try the next one.
      }
      if (!stopped && !taken) timer = setTimeout(() => void tick(), 200);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera, mode, shown, submit]);

  const saveDevice = (event: FormEvent) => {
    event.preventDefault();
    const name = device.trim() || "Puerta";
    setDevice(name);
    localStorage.setItem(DEVICE_KEY, name);
    setEditingDevice(false);
  };

  const totals = counts.data?.totals;
  const expected = totals ? totals.in + totals.out : 0;
  const tone = shown ? TONES[shown.tone] : null;

  const problem = CAMERA_PROBLEMS[camera];

  return (
    // One screen, controls included. The shell hides its tab bar here, so the bottom clears the home indicator.
    <div className="mx-auto flex min-h-(--admin-content-h) w-full max-w-md flex-col gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start gap-3">
        {/* Phones get the shell's own back link in the header. */}
        <Button asChild aria-label="Volver a Asistentes" className="-ml-2 max-md:hidden" size="icon" variant="ghost">
          <Link href={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[17px] leading-6 font-semibold text-foreground">Check-in</h1>
            <Badge variant="outline">Beta</Badge>
          </div>
          {editingDevice ? (
            <form className="mt-1 flex gap-2" onSubmit={saveDevice}>
              <Input
                autoFocus
                aria-label="Nombre de este teléfono"
                className="h-9"
                maxLength={60}
                value={device}
                onChange={(event) => setDevice(event.target.value)}
              />
              <Button size="sm" type="submit" variant="outline">
                Listo
              </Button>
            </form>
          ) : (
            <button
              className="relative flex max-w-full items-center gap-1.5 text-meta text-subtle hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3.5"
              type="button"
              onClick={() => setEditingDevice(true)}
            >
              <span className="truncate">
                {device} · {eventName}
              </span>
              <Pencil aria-hidden className="size-3 shrink-0" />
              <span className="sr-only">Cambiar el nombre de este teléfono</span>
            </button>
          )}
        </div>
        {queue.length > 0 ? (
          <Badge className="h-7 px-2.5" variant="warning">
            <CloudOff />
            {queue.length} en cola
          </Badge>
        ) : online ? (
          <span className="flex h-7 items-center gap-1.5 text-meta text-success-foreground">
            <StatusDot tone="ok" />
            en línea
          </span>
        ) : (
          <Badge className="h-7 px-2.5" variant="warning">
            <CloudOff />
            Sin señal
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-edge">
        <div className="flex items-baseline gap-1.5">
          <span className="font-terminal text-[22px] leading-none font-semibold text-foreground tabular-nums">
            {totals ? totals.in : "—"}
          </span>
          <span className="text-ui text-subtle tabular-nums">/ {totals ? expected : "—"} acreditados</span>
        </div>
        <Meter className="mt-2.5" label="Acreditados" max={expected} value={totals?.in ?? 0} />
      </div>

      <div className="relative min-h-44 flex-1 overflow-hidden rounded-2xl border border-border bg-black">
        <video
          ref={videoRef}
          aria-hidden
          muted
          playsInline
          className={cn(
            "absolute inset-0 size-full object-cover",
            (camera !== "on" || mode !== "camera") && "invisible"
          )}
        />
        {mode === "camera" ? (
          camera === "on" ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative size-[62%] max-h-[70%] max-w-[260px]">
                {[
                  "top-0 left-0 rounded-tl-[22px] border-t-[3px] border-l-[3px]",
                  "top-0 right-0 rounded-tr-[22px] border-t-[3px] border-r-[3px]",
                  "bottom-0 left-0 rounded-bl-[22px] border-b-[3px] border-l-[3px]",
                  "right-0 bottom-0 rounded-br-[22px] border-r-[3px] border-b-[3px]",
                ].map((corner) => (
                  <span key={corner} className={cn("absolute size-10 border-success", corner)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-input bg-raised">
                <Camera aria-hidden className="size-5 text-subtle" />
              </span>
              {problem ? (
                <>
                  <p className="text-ui font-medium text-foreground">{problem.title}</p>
                  <p className="max-w-64 text-meta text-muted-foreground">{problem.detail}</p>
                  {problem.retry ? (
                    <Button size="touch" variant="outline" onClick={() => void startCamera()}>
                      Probar de nuevo
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="max-w-64 text-ui text-subtle">
                    Apuntá al QR de la entrada y listo: suena y vibra con cada una.
                  </p>
                  <Button disabled={camera === "starting"} size="touch" onClick={() => void startCamera()}>
                    <ScanLine />
                    {camera === "starting" ? "Abriendo la cámara…" : "Activar cámara"}
                  </Button>
                </>
              )}
            </div>
          )
        ) : (
          <div className="absolute inset-0 bg-card">
            {mode === "search" ? (
              <ManualSearch
                busy={sending}
                eventId={eventId}
                online={online}
                timezone={timezone}
                onPick={(ticket) => {
                  unlock();
                  void submit(ticket, "manual");
                }}
              />
            ) : (
              <ManualCode
                busy={sending}
                onSubmit={(ticket) => {
                  unlock();
                  return submit(ticket, "manual");
                }}
              />
            )}
          </div>
        )}

        {shown && tone ? (
          <button
            aria-live="assertive"
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-3 border-2 p-6 text-center",
              tone.box
            )}
            type="button"
            onClick={() => setShown(null)}
          >
            <span className={cn("flex size-16 items-center justify-center rounded-full", tone.icon)}>
              <tone.Icon aria-hidden className="size-9" strokeWidth={3} />
            </span>
            <MicroLabel className={tone.text}>{shown.label}</MicroLabel>
            <span className="max-w-full text-[24px] leading-tight font-semibold text-balance text-foreground">
              {shown.title}
            </span>
            <span className="max-w-72 text-ui text-subtle">{shown.detail}</span>
            <span className="mt-2 flex items-center gap-1.5 text-meta text-muted-foreground">
              <Vibrate aria-hidden className="size-3.5" />
              Tocá para seguir
            </span>
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["camera", ScanLine, "Escanear"],
            ["search", Search, "Buscar"],
            ["code", Keyboard, "Código"],
          ] as const
        ).map(([value, Icon, label]) => (
          <Button
            key={value}
            aria-pressed={mode === value}
            className={cn(mode === value && "border-primary/40 text-foreground [&_svg]:text-primary")}
            size="touch"
            variant="outline"
            onClick={() => {
              unlock();
              setShown(null);
              setMode(value);
            }}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>

      <p className="text-center text-meta text-muted-foreground">
        Beta: lo que acredites acá queda en OWU y no llega a Eventbrite. En la puerta, Organizer es lo principal.
      </p>
    </div>
  );
}
