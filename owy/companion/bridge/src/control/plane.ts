import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import type { BridgeConfig } from "../config";
import type { DeviceSession } from "../index";
import type { Logger } from "../log";
import type { SharedRuntime } from "../runtime";
import { sleep, withTimeout } from "../timings";
import {
  COMPANION_CHANNEL,
  CommandEnvelopeSchema,
  ReportReplySchema,
  SettingRowSchema,
  type BridgeStatus,
  type CommandEnvelope,
  type CommandResult,
  type CompanionCommand,
  type Report,
  type SettingRow,
} from "../web/contract";
import {
  BRIDGE_KEYS,
  BRIDGE_TARGET,
  checkSetting,
  isSettingKey,
  settingSpec,
  targetScope,
  type SettingCheck,
  type SettingKey,
} from "../web/registry";

/**
 * The bridge's half of the control plane: the site (/admin/companion → Control)
 * keeps every setting; this follows them — onto the boards (through their
 * entities, or held here when a board can't) and into the bridge itself (at
 * once, from the next turn, or with a restart in a quiet moment) — reports
 * what is in effect every 15 s (the reply is every row: a full sync), tells
 * the site about changes made on a board, by voice or on the local page, and
 * runs the panel's commands. The last settings it got are cached on disk, so
 * a restart with the site out of reach still runs on them.
 */

/** Where the bridge keeps the last settings it was given (gitignored, next to web-bridge.json). */
export const STATE_PATH = path.resolve(import.meta.dirname, "../../../.eve/companion-state.json");

const REPORT_EVERY_MS = 15_000;
/** A board's first values after its link comes up are its own boot values, not changes. */
const RECONCILE_MS = 3_000;

const rowId = (target: string, key: string) => `${target}\n${key}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A bridge setting as the running config has it (null = unset). */
export function bridgeValue(key: SettingKey, config: BridgeConfig): unknown {
  const spec = settingSpec(key);
  if (spec.scope !== "bridge") return null;
  return (config as unknown as Record<string, unknown>)[spec.env] ?? null;
}

/** The last settings the bridge was given, newest per setting; local changes wait in `pending` until reported. */
export class SettingsStore {
  private readonly rows = new Map<string, SettingRow>();
  private readonly pending = new Map<string, SettingRow>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly file: string,
    private readonly log?: Logger
  ) {
    let cached: { rows?: unknown[]; pending?: unknown[] } = {};
    try {
      cached = JSON.parse(readFileSync(file, "utf8")) as typeof cached;
    } catch {
      // first run, or nothing cached yet
    }
    for (const [list, into] of [
      [cached.rows, this.rows],
      [cached.pending, this.pending],
    ] as const)
      for (const raw of list ?? []) {
        const row = SettingRowSchema.safeParse(raw);
        if (row.success) into.set(rowId(row.data.target, row.data.key), row.data);
      }
  }

  /** The value wanted for a setting: the newer of the site's row and a change made here. */
  desired(target: string, key: string): SettingRow | undefined {
    const site = this.rows.get(rowId(target, key));
    const local = this.pending.get(rowId(target, key));
    if (!local) return site;
    if (!site) return local;
    return Date.parse(local.setAt) >= Date.parse(site.setAt) ? local : site;
  }

  all(): SettingRow[] {
    const ids = new Set([...this.rows.keys(), ...this.pending.keys()]);
    return [...ids].map((id) => {
      const [target, key] = id.split("\n");
      return this.desired(target, key)!;
    });
  }

  /** Rows from the site (a broadcast, a report's reply): the ones that changed what is wanted. */
  merge(incoming: SettingRow[]): SettingRow[] {
    const changed: SettingRow[] = [];
    for (const row of incoming) {
      const id = rowId(row.target, row.key);
      const before = this.desired(row.target, row.key);
      const local = this.pending.get(id);
      // A newer change made here is on its way to the site: it wins there too.
      if (local && Date.parse(local.setAt) > Date.parse(row.setAt)) continue;
      if (local) this.pending.delete(id);
      this.rows.set(id, row);
      if (!before || !same(before.value, row.value)) changed.push(row);
    }
    if (changed.length) this.save();
    return changed;
  }

  /** A change made here (a board, Owy's voice, the local page), to report. */
  record(target: string, key: string, value: unknown, setBy: string): SettingRow {
    const row: SettingRow = { target, key, value: value as SettingRow["value"], setBy, setAt: new Date().toISOString() };
    this.pending.set(rowId(target, key), row);
    this.save();
    return row;
  }

  takePending(): SettingRow[] {
    return [...this.pending.values()];
  }

  /** The site has these: forget them, unless a newer change replaced them meanwhile. */
  acknowledge(sent: SettingRow[]): void {
    for (const row of sent) {
      const id = rowId(row.target, row.key);
      if (this.pending.get(id)?.setAt === row.setAt) {
        this.pending.delete(id);
        this.rows.set(id, row);
      }
    }
    this.save();
  }

  /** The bridge's own rows as env (they win over the shell's at boot; null = unset). */
  envOverrides(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {};
    for (const row of this.all()) {
      if (row.target !== BRIDGE_TARGET || !isSettingKey(row.key)) continue;
      const spec = settingSpec(row.key);
      if (spec.scope !== "bridge" || !checkSetting(row.key, row.value).ok) continue;
      env[spec.env] = row.value === null ? undefined : String(row.value);
    }
    return env;
  }

  /** Written soon (atomic: a temp file, then a rename), or now. */
  save(now = false): Promise<void> | void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const write = async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(tmp, JSON.stringify({ rows: [...this.rows.values()], pending: [...this.pending.values()] }), { mode: 0o600 });
      await rename(tmp, this.file);
    };
    if (now) return write().catch((error) => this.log?.warn("control: no pude guardar los ajustes", error));
    this.saveTimer = setTimeout(() => void write().catch((error) => this.log?.warn("control: no pude guardar los ajustes", error)), 200);
    this.saveTimer.unref?.();
  }
}

export interface ControlPlaneOptions {
  config: BridgeConfig;
  shared: SharedRuntime;
  sessions: DeviceSession[];
  store: SettingsStore;
  logger: Logger;
  /** The site's `companion.report`; absent without OWY_API_KEY (the bridge then runs on its cache and env). */
  report?: (input: Report) => Promise<unknown>;
  version: string;
  /** Rows the boot could not apply (a bad override): reported until a new value replaces them. */
  rejected?: BridgeStatus["rejected"];
  /** Exits so the supervisor starts the bridge again (companion:serve, Docker). */
  restart: () => void;
}

export class ControlPlane {
  private readonly startedAt = new Date().toISOString();
  private readonly pendingRestart = new Set<string>();
  private readonly rejected: BridgeStatus["rejected"];
  private results: CommandResult[] = [];
  private found: BridgeStatus["found"];
  private micInputs: string[] = [];
  private speakerOutputs: string[] = [];
  private reportTimer: NodeJS.Timeout | null = null;
  private soonTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private reporting = false;
  private failing = false;
  private readonly quietUntil = new Map<string, number>();
  private readonly log: Logger;

  constructor(private readonly options: ControlPlaneOptions) {
    this.log = options.logger.child("control");
    this.rejected = [...(options.rejected ?? [])];
  }

  start(): void {
    for (const row of this.options.store.all()) this.apply(row);
    this.reportTimer = setInterval(() => void this.report(), REPORT_EVERY_MS);
    this.reportTimer.unref?.();
    this.reportSoon(0);
  }

  stop(): void {
    for (const timer of [this.reportTimer, this.soonTimer, this.restartTimer]) if (timer) clearTimeout(timer);
    void this.options.store.save(true);
  }

  /** A frame on the site's companion channel. */
  onEvent(channel: string, event: string, payload: unknown): void {
    if (channel !== COMPANION_CHANNEL) return;
    if (event === "rows") {
      const rows = (payload as { rows?: unknown[] })?.rows ?? [];
      const valid = rows.flatMap((raw) => {
        const row = SettingRowSchema.safeParse(raw);
        return row.success ? [row.data] : [];
      });
      for (const row of this.options.store.merge(valid)) this.apply(row);
    } else if (event === "command") {
      const envelope = CommandEnvelopeSchema.safeParse(payload);
      if (envelope.success) void this.run(envelope.data);
    }
  }

  /**
   * A board's link came up. Its first values are its boot values, not changes, and its states
   * arrive a moment after the link: the wanted settings go back on once they are in.
   */
  linkUp(session: DeviceSession): void {
    this.quietUntil.set(session.id, Date.now() + RECONCILE_MS);
    setTimeout(() => {
      for (const row of this.options.store.all()) if (row.target === session.id) this.apply(row);
      this.reportSoon();
    }, RECONCILE_MS).unref?.();
  }

  /** A device setting moved: on the board itself (or our write echoing), or through the bridge's own APIs. */
  deviceSetting(session: DeviceSession, key: SettingKey, value: unknown, setBy: "dispositivo" | "local"): void {
    if (setBy === "dispositivo" && Date.now() < (this.quietUntil.get(session.id) ?? 0)) return;
    // Our own write echoing back (or a value already wanted): nothing new to tell the site.
    const desired = this.options.store.desired(session.id, key);
    if (desired && same(desired.value, value)) return;
    this.options.store.record(session.id, key, value, setBy);
    this.reportSoon();
  }

  /** A change made here: Owy asked out loud (`voz`) or the bridge's local page (`local`). */
  change(target: string, key: string, value: unknown, setBy: "voz" | "local"): SettingCheck {
    const checked = checkSetting(key, value);
    if (!checked.ok) return checked;
    const spec = settingSpec(key as SettingKey);
    if (targetScope(target) !== spec.scope) return { ok: false, error: `${spec.label} es un ajuste ${spec.scope === "bridge" ? "del bridge" : "de cada dispositivo"}` };
    if (spec.scope === "device" && !this.session(target)) return { ok: false, error: `no conozco el dispositivo «${target}»` };
    const row = this.options.store.record(target, key, checked.value, setBy);
    this.apply(row);
    this.reportSoon();
    return checked;
  }

  /** A setting in effect, wherever it lives (the voice tool reads these). */
  value(target: string, key: SettingKey): unknown {
    return target === BRIDGE_TARGET ? bridgeValue(key, this.options.config) : this.session(target)?.setting(key);
  }

  status(): BridgeStatus {
    const { hostMic, hostSpeaker } = this.options.shared;
    return {
      version: this.options.version,
      startedAt: this.startedAt,
      machine: hostname().slice(0, 80),
      values: Object.fromEntries(BRIDGE_KEYS.map((key) => [key, bridgeValue(key, this.options.config)])) as BridgeStatus["values"],
      pending: [...this.pendingRestart],
      rejected: this.rejected.slice(-20),
      devices: this.options.sessions.map((session) => session.deviceStatus()),
      ...(hostMic ? { hostMic: { ...hostMic.status(), available: this.micInputs } } : {}),
      ...(hostSpeaker ? { hostSpeaker: hostSpeaker.status(this.speakerOutputs) } : {}),
      ...(this.found ? { found: this.found } : {}),
    };
  }

  /** The heartbeat: what is in effect, changes made here, command results; the reply is every row. */
  async report(): Promise<void> {
    const send = this.options.report;
    if (!send || this.reporting) return;
    this.reporting = true;
    const changes = this.options.store.takePending();
    const results = this.results.splice(0);
    try {
      const { hostMic, hostSpeaker } = this.options.shared;
      [this.micInputs, this.speakerOutputs] = await Promise.all([
        hostMic?.devices().catch(() => []) ?? [],
        hostSpeaker?.devices().catch(() => []) ?? [],
      ]);
      const reply = ReportReplySchema.parse(await send({ status: this.status(), changes, results }));
      this.options.store.acknowledge(changes);
      for (const row of this.options.store.merge(reply.rows)) this.apply(row);
      if (this.failing) this.log.info("control: el sitio responde de nuevo");
      this.failing = false;
    } catch (error) {
      this.results.unshift(...results);
      if (!this.failing) this.log.warn(`control: no pude reportar al sitio (${message(error)}); sigo con los últimos ajustes`);
      this.failing = true;
    } finally {
      this.reporting = false;
    }
  }

  reportSoon(ms = 300): void {
    if (this.soonTimer) return;
    this.soonTimer = setTimeout(() => {
      this.soonTimer = null;
      void this.report();
    }, ms);
    this.soonTimer.unref?.();
  }

  private session(id: string): DeviceSession | undefined {
    return this.options.sessions.find((session) => session.id === id);
  }

  private apply(row: SettingRow): void {
    if (!isSettingKey(row.key)) return;
    const key = row.key;
    const checked = checkSetting(key, row.value);
    if (!checked.ok) return this.reject(row, checked.error);
    if (row.target === BRIDGE_TARGET) return this.applyBridge(key, checked.value);
    this.session(row.target)?.applySetting(key, checked.value);
  }

  private reject(row: SettingRow, error: string): void {
    this.log.warn(`control: ${row.target}/${row.key} no se aplica: ${error}`);
    this.rejected.push({ target: row.target, key: row.key, error: error.slice(0, 400) });
  }

  private applyBridge(key: SettingKey, value: unknown): void {
    const spec = settingSpec(key);
    if (spec.scope !== "bridge") return;
    const config = this.options.config as unknown as Record<string, unknown>;
    if (same(config[spec.env] ?? null, value)) {
      this.pendingRestart.delete(key);
      return;
    }
    if (spec.apply === "restart") {
      // Kept for the next start (envOverrides); everything else keeps running on the old value until then.
      this.pendingRestart.add(key);
      this.log.info(`control: ${spec.label} cambia al reiniciar; espero un momento sin turnos`);
      return this.restartWhenQuiet();
    }
    config[spec.env] = value === null ? undefined : value;
    const { hostMic, hostSpeaker } = this.options.shared;
    const c = this.options.config;
    if (key === "host_mic" || key === "host_mic_channel") hostMic?.select(c.COMPANION_HOST_MIC ?? null, c.COMPANION_HOST_MIC_CHANNEL);
    if (key === "host_mic_gain_db") hostMic?.setGain(c.COMPANION_HOST_MIC_GAIN_DB);
    if (key === "host_speaker") hostSpeaker?.select(c.COMPANION_HOST_SPEAKER ?? null);
    if (key === "host_speaker_latency_ms" && hostSpeaker) hostSpeaker.latencyMs = c.COMPANION_HOST_SPEAKER_LATENCY_MS;
    if (key === "host_speaker_tail_ms" && hostSpeaker) hostSpeaker.tailMs = c.COMPANION_HOST_SPEAKER_TAIL_MS;
    this.log.info(`control: ${spec.label} → ${JSON.stringify(value)}`);
  }

  /** A restart waits for a moment with no turn on any board; the supervisor starts the bridge again. */
  private restartWhenQuiet(): void {
    if (this.restartTimer || this.pendingRestart.size === 0) return;
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      if (this.options.sessions.some((session) => session.busy)) return this.restartWhenQuiet();
      this.log.warn(`control: reinicio para aplicar ${[...this.pendingRestart].join(", ")}`);
      await this.options.store.save(true);
      this.options.restart();
    }, 2_000);
    this.restartTimer.unref?.();
  }

  private async run({ id, command }: CommandEnvelope): Promise<void> {
    let result: CommandResult;
    try {
      const data = await this.execute(command);
      result = { id, ok: true, ...(data !== undefined ? { data: data as CommandResult["data"] } : {}) };
    } catch (error) {
      result = { id, ok: false, error: message(error).slice(0, 400) };
    }
    this.results.push(result);
    this.reportSoon(0);
  }

  private async execute(command: CompanionCommand): Promise<unknown> {
    const device = (id: string) => {
      const session = this.session(id);
      if (!session) throw new Error(`no conozco el dispositivo «${id}»`);
      return session;
    };
    switch (command.type) {
      case "tone": {
        if (command.target !== "mac") return device(command.target).testTone();
        const speaker = this.options.shared.hostSpeaker;
        speaker?.ensureOpen();
        if (speaker && !speaker.ready) await sleep(500);
        if (!speaker?.ready) throw new Error(`la salida de la Mac no está abierta (${speaker?.status().detail ?? "no disponible"})`);
        speaker.write(testTone());
        return undefined;
      }
      case "say":
        await device(command.deviceId).say(command.text);
        return undefined;
      case "hush":
        device(command.deviceId).hush();
        return undefined;
      case "staff":
        device(command.deviceId).setStaff(command.on);
        return undefined;
      case "probe-mic": {
        const mic = this.options.shared.hostMic;
        if (!mic) throw new Error("este bridge no tiene el micrófono de la Mac");
        const { peak, rms, seconds, health } = await mic.probe(command.ms);
        return { peak, rms, seconds, health };
      }
      case "discover":
        this.found = await discover();
        return this.found;
      case "restart":
        this.pendingRestart.add("restart");
        this.restartWhenQuiet();
        return undefined;
    }
  }
}

/** 300 ms at 880 Hz with soft edges, 16 kHz PCM16: the Mac's output test. */
function testTone(): Buffer {
  const samples = 16_000 * 0.3;
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const edge = Math.min(1, i / 400, (samples - i) / 400);
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 880 * i) / 16_000) * 9000 * edge), i * 2);
  }
  return pcm;
}

/** ESPHome boards announced on the LAN (`dns-sd`, macOS), with their IPv4 when it resolves. */
export async function discover(browseMs = 3_000): Promise<{ name: string; host: string }[]> {
  if (process.platform !== "darwin") throw new Error("buscar en la red funciona con el bridge en macOS (dns-sd), no en Docker");
  const names = await new Promise<string[]>((resolve, reject) => {
    const found = new Set<string>();
    const child = spawn("dns-sd", ["-B", "_esphomelib._tcp", "local."], { stdio: ["ignore", "pipe", "ignore"] });
    child.on("error", reject);
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        const match = /\sAdd\s+\d+\s+\d+\s+\S+\s+\S+\s+(.+?)\s*$/.exec(line);
        if (match) found.add(match[1]);
      }
    });
    setTimeout(() => {
      child.kill();
      resolve([...found].sort());
    }, browseMs);
  });
  return Promise.all(
    names.map(async (name) => ({
      name,
      host: await withTimeout(lookup(`${name}.local`, { family: 4 }), 2_000)
        .then((result) => result.address)
        .catch(() => `${name}.local`),
    }))
  );
}
