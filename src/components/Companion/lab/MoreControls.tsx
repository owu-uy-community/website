"use client";

import { Activity, ChevronDown, Gauge, Move3D, Settings2, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";

import { MicroLabel, Panel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/shared/ui/collapsible";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";

import { Segmented, type Options } from "../control/ui";
import type { Input } from "./Device";
import type { Manifest, Snapshot } from "./emulator";
import { WhyState } from "./panels";

/** What the page set by hand (the emulator only keeps the result): reset with the session. */
export type Controls = {
  angles: number[];
  faults: number[];
  transport: number[];
  connected: boolean;
  imu: boolean;
  battery: number;
  charging: boolean;
  usb: boolean;
};
export const FRESH_CONTROLS: Controls = {
  angles: [0, 0, 0],
  faults: [0, 0, 0],
  transport: [0, 0],
  connected: true,
  imu: true,
  battery: 100,
  charging: false,
  usb: true,
};

const TOGGLES: [string, string][] = [
  ["privacy", "Privacidad del micrófono"],
  ["continuous", "Conversación continua"],
  ["chime", "Tono de escucha"],
  ["sounds", "Sonidos de interacción"],
  ["motion", "Seguir el movimiento"],
  ["reduced", "Animaciones mínimas"],
  ["invert_x", "Invertir horizontal"],
  ["invert_y", "Invertir vertical"],
  ["wake", "Palabra de activación"],
  ["quiet", "Modo silencioso"],
  ["pitch", "Modo pitch"],
];
/** What Owy says back after a pitch (select.pitch_voice), cycled on the device by «Owy responde». */
const PITCH_VOICES: Options<string> = [
  ["0", "Callado"],
  ["1", "Confirma"],
  ["2", "Confirma y comenta"],
];
const FAULTS = [
  "Driver demorado más allá del timeout",
  "El parlante nunca termina de drenar",
  "El bridge pierde el timeout de silencio",
];
const TRANSPORT_FAULTS = ["Ráfaga de 700 ms en el transporte", "Nunca confirmar que el audio está listo"];

function RangeRow({
  label,
  value,
  unit = "",
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-ui">{label}</span>
      <Slider
        aria-label={label}
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <span className="w-12 shrink-0 text-right font-terminal text-meta text-muted-foreground tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-ui">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/**
 * Everything else the simulation takes, folded away: motion, cues and envelopes, the device's
 * own settings, injected faults and power, and the parity notes.
 */
export function MoreControls({
  ready,
  state,
  manifest,
  controls,
  setControls,
  input,
  pose,
  sound,
  onSound,
}: {
  ready: boolean;
  state: Snapshot | null;
  manifest: Manifest | null;
  controls: Controls;
  setControls: (change: (controls: Controls) => Controls) => void;
  input: Input;
  pose: (angles: number[]) => void;
  sound: boolean;
  onSound: () => void;
}) {
  const set = (patch: Partial<Controls>) => setControls((current) => ({ ...current, ...patch }));
  const power = (battery: number, usb: boolean, charging: boolean) =>
    input("powerTelemetry", [0x08 | (usb ? 0x20 : 0), charging ? 0x20 : 0x40, battery, 31]);

  return (
    <Collapsible>
      <Panel>
        <CollapsibleTrigger className="group flex h-11 w-full items-center gap-2 px-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
          <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-ui font-semibold">Más controles</span>
          <span className="truncate text-meta text-muted-foreground">movimiento, ajustes, fallas, energía</span>
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border p-4">
          <Tabs defaultValue="inputs">
            <TabsList className="w-fit">
              <TabsTrigger value="inputs">
                <Move3D /> Entradas
              </TabsTrigger>
              <TabsTrigger value="state">
                <Activity /> Estado
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 /> Ajustes
              </TabsTrigger>
              <TabsTrigger value="faults">
                <Gauge /> Fallas
              </TabsTrigger>
            </TabsList>

            <TabsContent className="grid gap-8 pt-4 md:grid-cols-2" value="inputs">
              <div className="space-y-4">
                <MicroLabel>Movimiento · g y °/s</MicroLabel>
                {["Lateral", "Frontal", "Giro"].map((axis, i) => (
                  <RangeRow
                    key={axis}
                    disabled={!ready}
                    label={axis}
                    max={70}
                    min={-70}
                    unit="°"
                    value={controls.angles[i]}
                    onChange={(value) => {
                      const angles = [...controls.angles];
                      angles[i] = value;
                      pose(angles);
                    }}
                  />
                ))}
                <p className="text-meta text-muted-foreground">
                  La pose produce gravedad y velocidad angular juntas. El giro es relativo, no una brújula.
                </p>
              </div>
              <div className="space-y-4">
                <MicroLabel>Cues y envolventes</MicroLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={sound ? "secondary" : "outline"} onClick={onSound}>
                    {sound ? <Volume2 /> : <VolumeX />}
                    {sound ? "Sonido activado" : "Activar sonido"}
                  </Button>
                  {["Escucha", "Juguetón", "Diagnóstico"].map((name, i) => (
                    <Button
                      key={name}
                      disabled={!sound || !ready}
                      size="sm"
                      variant="ghost"
                      onClick={() => input("cue", [i])}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
                {["Envolvente del mic", "Envolvente de voz"].map((name, i) => (
                  <RangeRow
                    key={name}
                    disabled={!ready}
                    label={name}
                    max={100}
                    min={0}
                    unit="%"
                    value={Math.round((state?.envelope[i] ?? 0) * (i === 0 ? 100 : 1))}
                    onChange={(value) => {
                      const values = [...(state?.envelope ?? [0, 0])];
                      values[i] = value / (i === 0 ? 100 : 1);
                      input("envelope", values);
                    }}
                  />
                ))}
                <p className="text-meta text-muted-foreground">
                  Cues PCM a 16 kHz del mismo C++. Las envolventes son niveles sintéticos para la escucha y la boca; no
                  generan voz.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 pt-4 md:grid-cols-2" value="state">
              <WhyState state={state} />
              <div className="space-y-3 text-meta text-muted-foreground">
                <MicroLabel>Límite de paridad</MicroLabel>
                <p>C++ compartido: fusión de IMU, calibración, gestos, cara, PCM.</p>
                <p>Generado del firmware: las escenas LVGL y las fuentes.</p>
                <p>Bridge compartido: VoiceTurn y PacedSpeaker de producción con timers virtuales.</p>
                <p>Simulados: driver de audio, red, energía y staff (PIN de prueba 1234).</p>
                <p className="font-terminal">
                  LVGL {manifest?.lvgl} · ESPHome {manifest?.esphome} · {manifest?.version}
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 pt-4 md:grid-cols-2" value="settings">
              <div className="divide-y">
                {TOGGLES.map(([key, name]) => (
                  <SwitchRow
                    key={key}
                    checked={!!state?.settings[key]}
                    disabled={!ready}
                    label={name}
                    onChange={(value) => input("setting", [Number(value)], key)}
                  />
                ))}
                <div className="flex items-center justify-between gap-3 py-1 text-ui">
                  <span>Owy responde</span>
                  <Segmented
                    disabled={!ready}
                    label="Owy responde"
                    options={PITCH_VOICES}
                    value={String(state?.settings.pitch_voice ?? 1)}
                    onChange={(value) => input("setting", [Number(value)], "pitch_voice")}
                  />
                </div>
              </div>
              <div className="space-y-4">
                {(
                  [
                    ["volume", "Volumen", 0, 80],
                    ["brightness", "Brillo", 10, 100],
                  ] as const
                ).map(([key, name, min, max]) => (
                  <RangeRow
                    key={key}
                    disabled={!ready}
                    label={name}
                    max={max}
                    min={min}
                    step={5}
                    unit="%"
                    value={state?.settings[key] ?? 80}
                    onChange={(value) => input("setting", [value], key)}
                  />
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!ready}
                    size="sm"
                    variant="outline"
                    onClick={() => input("page", [], "calibration")}
                  >
                    <Move3D /> Calibración
                  </Button>
                  <Button
                    disabled={!ready}
                    size="sm"
                    variant="outline"
                    onClick={() => input("card", [], "Ideas que nos conectan")}
                  >
                    Mostrar tarjeta
                  </Button>
                  <Button
                    disabled={!ready}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      input("text", [], "Nos vemos en la próxima charla. Compartir ideas nos hace crecer.")
                    }
                  >
                    Mostrar texto
                  </Button>
                </div>
                <p className="text-meta text-muted-foreground">
                  También desde los ajustes rápidos en pantalla (mantené). Nada de esto toca un Owy físico.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 pt-4 md:grid-cols-2" value="faults">
              <div className="divide-y">
                {FAULTS.map((name, i) => (
                  <SwitchRow
                    key={name}
                    checked={!!controls.faults[i]}
                    disabled={!ready}
                    label={name}
                    onChange={(value) => {
                      const faults = [...controls.faults];
                      faults[i] = Number(value);
                      set({ faults });
                      input("fault", faults);
                    }}
                  />
                ))}
                {TRANSPORT_FAULTS.map((name, i) => (
                  <SwitchRow
                    key={name}
                    checked={!!controls.transport[i]}
                    disabled={!ready}
                    label={name}
                    onChange={(value) => {
                      const transport = [...controls.transport];
                      transport[i] = value ? (i === 0 ? 700 : 1) : 0;
                      set({ transport });
                      input("transport", transport);
                    }}
                  />
                ))}
                <SwitchRow
                  checked={controls.connected}
                  disabled={!ready}
                  label="Bridge conectado"
                  onChange={(connected) => {
                    set({ connected });
                    input("connection", [Number(connected)]);
                  }}
                />
                <SwitchRow
                  checked={controls.imu}
                  disabled={!ready}
                  label="La IMU entrega muestras"
                  onChange={(imu) => {
                    set({ imu });
                    input("imuAvailable", [Number(imu)]);
                  }}
                />
              </div>
              <div className="space-y-4">
                <RangeRow
                  disabled={!ready}
                  label="Batería"
                  max={100}
                  min={0}
                  unit="%"
                  value={controls.battery}
                  onChange={(battery) => {
                    set({ battery });
                    power(battery, controls.usb, controls.charging);
                  }}
                />
                <div className="divide-y">
                  <SwitchRow
                    checked={controls.usb}
                    disabled={!ready}
                    label="USB conectado"
                    onChange={(usb) => {
                      set({ usb });
                      power(controls.battery, usb, controls.charging);
                    }}
                  />
                  <SwitchRow
                    checked={controls.charging}
                    disabled={!ready}
                    label="Cargando"
                    onChange={(charging) => {
                      set({ charging });
                      power(controls.battery, controls.usb, charging);
                    }}
                  />
                </div>
                <Button
                  disabled={!ready}
                  size="sm"
                  variant="outline"
                  onClick={() => input("power", [state?.powered ? 0 : 1])}
                >
                  PWR · {state?.powered ? "Apagar" : "Encender"}
                </Button>
                <p className="text-meta text-muted-foreground">La energía es una entrada simulada, no el PMIC.</p>
              </div>
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Panel>
    </Collapsible>
  );
}
