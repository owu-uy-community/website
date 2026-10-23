/* eslint-disable no-console */
/**
 * Dev-only sample data seed. NON-destructive: refuses to run in production or when communities it
 * doesn't own exist (unless --force), and even then it only recreates its own data: the "demo"
 * community, and the OWU CONF board (`owu` / `owu-conf-2026`, what conf.owu.uy/openspace reads).
 * A real `owu` community (a dev database restored from production) keeps everything else.
 *
 *   pnpm db:seed [--force] [--at=HH:MM]
 *
 * `--at` is when the first block starts; by default an hour ago, so a block is on now. Blocks run
 * 25 minutes every half hour, like the conf's, and the mercado de ideas is the 45 minutes before
 * the first one — so `--at` 20 minutes from now lands the live board in the mercado.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { communities, communityMembers, events, outboundMessages, rooms, schedules, tracks, user } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("db:seed is dev-only and must never run against production");
}

const FORCE = process.argv.includes("--force");
const AT = process.argv.find((arg) => arg.startsWith("--at="))?.slice("--at=".length);
const DEMO_SLUG = "demo";
/** Mirrors CONF_EVENT (app/lib/constants) */
const CONF = { communitySlug: "owu", eventSlug: "owu-conf-2026" };

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

function dateAt(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** Minute of the day the first block starts at: `--at`, else the half hour an hour ago. */
function firstBlockMinute(now: Date): number {
  if (!AT) return Math.max(0, Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) * 30 - 60);

  const match = /^(\d{1,2}):(\d{2})$/.exec(AT);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error(`--at must be HH:MM, got "${AT}"`);

  return Number(match[1]) * 60 + Number(match[2]);
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** A slot's day is a date at UTC midnight (what the admin writes): today on the local clock, not UTC's. */
function dayMarker(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Site staff become owners of the seeded communities (handy in dev). */
async function addStaff(communityId: string) {
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`string_to_array(${user.role}, ',') && array['staff', 'superadmin', 'admin']`);
  for (const admin of admins) {
    await db
      .insert(communityMembers)
      .values({ communityId, userId: admin.id, role: "owner" })
      .onConflictDoNothing({ target: [communityMembers.communityId, communityMembers.userId] });
  }
}

const ROOMS = [
  { name: "Lobby", description: "Main lobby area", capacity: 50, hasTV: true, hasWhiteboard: false },
  { name: "Centro", description: "Central meeting room", capacity: 30, hasTV: false, hasWhiteboard: true },
  { name: "Ventana", description: "Window room with natural light", capacity: 25, hasTV: false, hasWhiteboard: true },
  { name: "Cueva", description: "Cave room for intimate discussions", capacity: 20, hasTV: true, hasWhiteboard: false },
  { name: "Rincón", description: "Corner space for small groups", capacity: 15, hasTV: true, hasWhiteboard: false },
];

// (block index, room index, title, speaker, description, needsTV, needsWhiteboard) — every room has one free block
const SAMPLE_TRACKS: [number, number, string, string, string, boolean, boolean][] = [
  // LOBBY (TV): frontend
  [1, 0, "Next.js 15: Server Components", "Santiago Cano", "Guía completa de Server Components", true, false],
  [2, 0, "TypeScript Tips & Tricks", "Laura Martínez", "Trucos avanzados de TypeScript", true, false],
  [3, 0, "React Performance Optimization", "Carlos Ruiz", "Optimización de aplicaciones React", true, false],
  [4, 0, "State Management 2024", "Ana Torres", "Zustand, Jotai y el futuro del state", true, false],
  // CENTRO (pizarra): DevOps
  [0, 1, "Clean Architecture en la Práctica", "Roberto Fernández", "Arquitectura limpia aplicada", false, true],
  [1, 1, "Microservicios: Pros y Contras", "Miguel Ángel Díaz", "Diseñando sistemas distribuidos", false, true],
  [3, 1, "Kubernetes para Devs", "Diego López", "K8s desde la perspectiva del developer", false, true],
  [4, 1, "CI/CD Moderno con GitHub Actions", "Sofía Ramírez", "Pipeline automation workflows", false, true],
  // VENTANA (pizarra): AI/ML
  [0, 2, "Intro a Machine Learning", "Patricia Morales", "Fundamentos de ML", false, true],
  [2, 2, "RAG: Retrieval Augmented Generation", "Claudia Herrera", "Arquitectura de chatbots con RAG", false, true],
  [3, 2, "Data Pipelines con Python", "Andrés Navarro", "ETL con Pandas y Airflow", false, true],
  [4, 2, "Neural Networks: Conceptos Básicos", "Ricardo Méndez", "Redes neuronales y backpropagation", false, true],
  // CUEVA (TV): backend and security
  [0, 3, "Node.js: Escalabilidad y Performance", "Juan Pablo De la torre", "Profiling de Node.js", true, false],
  [1, 3, "GraphQL vs REST en 2024", "Isabel Castro", "Comparativa de APIs", true, false],
  [2, 3, "Introducción al Pentesting", "Jimena Mújica", "Pentesting ético con demos", true, false],
  [3, 3, "Metodología Forense Digital", "Agustín Tornielli", "Análisis forense en ciberseguridad", true, false],
  // RINCÓN (TV): career
  [0, 4, "De Junior a Senior: El Camino", "Gabriela Ortiz", "Evolución profesional en tech", false, false],
  [1, 4, "Code Review: Mejores Prácticas", "Javier Mendoza", "Revisiones de código efectivas", false, false],
  [2, 4, "Trabajo Remoto: Tips y Tools", "Valentina Rojas", "Productividad en remoto", false, false],
  [4, 4, "Mentoría en Tech: Guía Práctica", "Elena Rodríguez", "Cómo ser un buen mentor", false, false],
];

/** An event with five rooms, five 25-minute blocks every half hour and the sample talks. */
async function seedBoard(communityId: string, event: { name: string; description: string; slug: string }, now: Date) {
  const [row] = await db
    .insert(events)
    .values({ ...event, communityId, startDate: dateAt("09:00"), endDate: dateAt("21:00"), isActive: true })
    .returning();

  const first = firstBlockMinute(now);
  const date = dayMarker(now);
  const blocks = await db
    .insert(schedules)
    .values(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Bloque ${index + 1}`,
        startTime: hhmm(Math.min(first + index * 30, 24 * 60 - 25)),
        endTime: hhmm(Math.min(first + index * 30 + 25, 24 * 60 - 1)),
        date,
        openSpaceId: row.id,
      }))
    )
    .returning();

  const roomRows = await db
    .insert(rooms)
    .values(ROOMS.map((room, sortOrder) => ({ ...room, sortOrder, openSpaceId: row.id })))
    .returning();

  await db.insert(tracks).values(
    SAMPLE_TRACKS.map(([block, room, title, speaker, description, needsTV, needsWhiteboard]) => ({
      title,
      speaker,
      description,
      needsTV,
      needsWhiteboard,
      scheduleId: blocks[block].id,
      roomId: roomRows[room].id,
      openSpaceId: row.id,
    }))
  );

  console.log(
    `  🗓️  ${event.slug}: blocks ${blocks[0].startTime}–${blocks.at(-1)?.endTime}, ${SAMPLE_TRACKS.length} talks`
  );

  return row;
}

async function main() {
  console.log("🌱 Seeding database (demo community + the OWU CONF board)...");
  const now = new Date();

  const existing = await db.select({ id: communities.id, slug: communities.slug }).from(communities);
  const demo = existing.find((community) => community.slug === DEMO_SLUG);
  const others = existing.filter((community) => community.slug !== DEMO_SLUG && community.slug !== CONF.communitySlug);

  if (others.length > 0 && !FORCE) {
    throw new Error(
      `Refusing to seed: ${others.length} other communities exist. Re-run with --force to (re)create only the seed's own data.`
    );
  }
  if (demo) {
    if (!FORCE) throw new Error('The "demo" community already exists. Re-run with --force to recreate it.');
    // events.communityId is ON DELETE RESTRICT: events first (each cascades to its board), then the community
    await db.delete(events).where(eq(events.communityId, demo.id));
    await db.delete(communities).where(eq(communities.id, demo.id));
    console.log('  ♻️  Removed previous "demo" community');
  }

  const [community] = await db
    .insert(communities)
    .values({ slug: DEMO_SLUG, name: "Comunidad Demo", description: "Datos de ejemplo para desarrollo" })
    .returning();
  await addStaff(community.id);
  const event = await seedBoard(
    community.id,
    { name: "Open Space Demo", description: "Un open space de ejemplo para desarrollo", slug: "open-space-demo" },
    now
  );

  // The conf's board: the community is kept if it exists, only its own event is recreated
  const [owu] = await db
    .insert(communities)
    .values({ slug: CONF.communitySlug, name: "OWU", description: "La comunidad tecnológica de Uruguay" })
    .onConflictDoUpdate({ target: communities.slug, set: { slug: CONF.communitySlug } })
    .returning();
  await addStaff(owu.id);
  await db.delete(events).where(and(eq(events.communityId, owu.id), eq(events.slug, CONF.eventSlug)));
  const conf = await seedBoard(
    owu.id,
    {
      name: "OWU CONF 2026",
      description: "La conferencia de la comunidad tecnológica de Uruguay",
      slug: CONF.eventSlug,
    },
    now
  );

  // What Owy told attendees (the same text went to both channels) and a staff DM the live board must never show
  await db.insert(outboundMessages).values([
    {
      eventId: conf.id,
      channel: "telegram",
      body: "¡Arrancó el mercado de ideas! Traé tu tema al Lobby.",
      status: "sent",
      sentAt: now,
    },
    {
      eventId: conf.id,
      channel: "slack",
      body: "¡Arrancó el mercado de ideas! Traé tu tema al Lobby.",
      status: "sent",
      sentAt: now,
    },
    {
      eventId: conf.id,
      channel: "staff_dm",
      body: "Staff: reponer cards en la mesa del mercado.",
      status: "sent",
      sentAt: now,
    },
  ]);

  console.log("✅ Database seeded successfully!");
  console.log(`Created community: ${community.slug} → event: ${event.slug}; ${owu.slug} → ${conf.slug}`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
