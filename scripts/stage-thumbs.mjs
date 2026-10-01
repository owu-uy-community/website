// Screenshots every Owy Stage scene at 640×360 for the admin grid, so the
// director page shows instant thumbnails instead of 190+ live iframes.
//
//   PLAYWRIGHT=$HOME/.owy-shot/node_modules/playwright/index.mjs \
//   pnpm stage:thumbs [http://127.0.0.1:3005] [scene-id …]
//
// `PLAYWRIGHT` points at any playwright install (it is not a repo dependency);
// the dev server must be running with a seeded event so data scenes have content.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const [base = "http://127.0.0.1:3005", ...only] = process.argv.slice(2);
const out = resolve("public/owy-stage/thumbs");
await mkdir(out, { recursive: true });

// Scene ids from the registry, without importing TS: the ids are the keys of SCENES.
const source = await (await import("node:fs/promises")).readFile("src/lib/owy-stage/scenes.ts", "utf8");
const body = source.slice(source.indexOf("export const SCENES = {"), source.indexOf("} as const;"));
const ids = [...body.matchAll(/^  (?:"([a-z0-9-]+)"|([a-z0-9-]+)): \{/gm)].map((m) => m[1] ?? m[2]);
const targets = only.length ? ids.filter((id) => only.includes(id)) : ids;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const queue = [...targets];
let done = 0;
const worker = async () => {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  for (let id = queue.shift(); id; id = queue.shift()) {
    try {
      await page.goto(`${base}/owy/stage/${id}?preview=1`, { waitUntil: "networkidle", timeout: 30_000 });
      // Dev-only overlays (Next badge, TanStack devtools) must not end up in the thumbnails.
      await page.addStyleTag({ content: "nextjs-portal, .tsqd-parent-container { display: none !important }" });
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${out}/${id}.jpg`, type: "jpeg", quality: 62 });
      done++;
      console.log(`${String(done).padStart(3)}/${targets.length}  ${id}`);
    } catch (error) {
      console.error(`FAILED ${id}: ${error.message.split("\n")[0]}`);
    }
  }
  await page.close();
};
await Promise.all(Array.from({ length: 4 }, worker));
await browser.close();
