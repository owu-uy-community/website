// Owy's voice under bad networks. Shapes the bridge container's internet leg with
// tc netem (the compose.netem.yaml sidecar), runs real voice turns through the web
// transport (web-turn.mts) and prints which road answered each one and how fast.
//
//   docker compose -f owy/companion/bridge/compose.yaml -f owy/companion/bridge/compose.netem.yaml up -d --build
//   pnpm -C owy companion:netem /path/q1.wav [/path/q2.wav …]
//
// Use recorded human questions (16 kHz mono WAV): gateway transcription of `say`
// voices is flaky and would fail turns the network did not. NETEM_TURNS (default 3)
// turns per profile, NETEM_PROFILES=baseline,bad to run a subset.
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const owy = path.resolve(import.meta.dirname, "../..");
const compose = ["compose", "-f", "companion/bridge/compose.yaml", "-f", "companion/bridge/compose.netem.yaml"];
const run = promisify(execFile);
const docker = async (...args: string[]) => (await run("docker", [...compose, ...args], { cwd: owy })).stdout;

interface Profile {
  name: string;
  /** netem arguments for the internet leg; null = no shaping. */
  netem: string | null;
  /** Cut the internet for 15 s every 40 s while turns run. */
  flap?: boolean;
  /** What a pass means for one turn. */
  pass: (turn: TurnResult) => boolean;
}

interface TurnResult {
  ended: boolean;
  error: boolean;
  path: string;
  ttfa: number | null;
  total: number | null;
  wallMs: number;
}

const answered = (t: TurnResult) => t.ended && !t.error;
const PROFILES: Profile[] = [
  { name: "baseline", netem: null, pass: (t) => answered(t) && t.path === "realtime" },
  { name: "congested", netem: "delay 150ms 50ms distribution normal loss 1%", pass: answered },
  { name: "bad", netem: "delay 400ms 150ms distribution normal loss 5% rate 512kbit", pass: (t) => answered(t) && t.wallMs < 35_000 },
  { name: "terrible", netem: "delay 800ms 200ms loss 10% rate 128kbit", pass: (t) => answered(t) && t.wallMs < 45_000 },
  { name: "blackhole", netem: "loss 100%", pass: (t) => t.ended && !t.error && t.path === "offline" },
  { name: "flap", netem: null, flap: true, pass: answered },
];

/** prio qdisc: private ranges → band 1 (untouched), everything else → band 3 with netem. */
function shapeScript(netem: string | null): string {
  const reset = "tc qdisc del dev eth0 root 2>/dev/null; true";
  if (!netem) return reset;
  return [
    reset,
    "tc qdisc add dev eth0 root handle 1: prio bands 3 priomap 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2",
    `tc qdisc add dev eth0 parent 1:3 handle 30: netem ${netem}`,
    ...["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map(
      (net) => `tc filter add dev eth0 parent 1: protocol ip prio 1 u32 match ip dst ${net} flowid 1:1`
    ),
  ].join(" && ");
}

const shape = (netem: string | null) => docker("exec", "-T", "netem", "sh", "-c", shapeScript(netem));

function webTurn(wav: string): Promise<{ stdout: string; wallMs: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "companion/scripts/web-turn.mts", wav], {
      cwd: owy,
      env: { ...process.env, WEB_TURN_ONCE: "1", WEB_TURN_SECONDS: "75" },
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stdout += chunk));
    child.on("close", () => resolve({ stdout, wallMs: Date.now() - started }));
  });
}

async function turn(wav: string): Promise<TurnResult> {
  const since = new Date(Date.now() - 1000).toISOString();
  const { stdout, wallMs } = await webTurn(wav);
  const logs = await docker("logs", "--no-log-prefix", "--since", since, "bridge").catch(() => "");
  const line = [...logs.matchAll(/turn path=(\S+) ttfa=(\S+) total=(\S+)/g)].at(-1);
  const seconds = (value: string | undefined) => (value && value !== "-" ? Number.parseFloat(value) : null);
  return {
    ended: /event RUN_END/.test(stdout),
    error: /event ERROR/.test(stdout),
    path: line?.[1] ?? "?",
    ttfa: seconds(line?.[2]),
    total: seconds(line?.[3]),
    wallMs,
  };
}

const wavs = process.argv.slice(2);
if (wavs.length === 0) {
  console.error("uso: netem-matrix.mts <pregunta.wav> [más.wav …]  (16 kHz mono, voces humanas)");
  process.exit(1);
}
const turnsPerProfile = Number(process.env.NETEM_TURNS ?? 3);
const only = process.env.NETEM_PROFILES?.split(",");
const rows: string[] = [];

for (const profile of PROFILES.filter((p) => !only || only.includes(p.name))) {
  await shape(profile.netem);
  let flapTimer: NodeJS.Timeout | null = null;
  if (profile.flap) {
    let down = false;
    const toggle = async () => {
      down = !down;
      await shape(down ? "loss 100%" : null).catch(() => {});
      flapTimer = setTimeout(toggle, down ? 15_000 : 25_000);
    };
    flapTimer = setTimeout(toggle, 5_000);
  }
  const results: TurnResult[] = [];
  for (let i = 0; i < turnsPerProfile; i++) {
    const result = await turn(wavs[i % wavs.length]);
    results.push(result);
    console.log(
      `${profile.name} #${i + 1}: ${profile.pass(result) ? "PASS" : "FAIL"} path=${result.path} ttfa=${result.ttfa ?? "-"}s total=${result.total ?? "-"}s wall=${(result.wallMs / 1000).toFixed(1)}s${result.error ? " ERROR" : ""}${result.ended ? "" : " (sin RUN_END)"}`
    );
    // Let the bridge settle (keep-warm, cooldowns) like visitors spaced out at a booth.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (flapTimer) clearTimeout(flapTimer);
  await shape(null);
  const passed = results.filter(profile.pass).length;
  const ttfas = results.map((r) => r.ttfa).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const paths = Object.entries(
    results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.path]: (acc[r.path] ?? 0) + 1 }), {})
  )
    .map(([name, count]) => `${name}×${count}`)
    .join(" ");
  rows.push(
    `${profile.name.padEnd(10)} ${`${passed}/${results.length}`.padEnd(6)} ttfa p50 ${ttfas.length ? `${ttfas[Math.floor(ttfas.length / 2)]}s` : "-"}`.padEnd(40) +
      ` ${paths}`
  );
  // A blackhole leaves every tier cooling down: give the bridge a minute to come back before the next profile.
  if (profile.netem === "loss 100%" || profile.flap) await new Promise((resolve) => setTimeout(resolve, 60_000));
}

console.log(`\nperfil     pasan  latencia                           caminos\n${rows.join("\n")}`);
