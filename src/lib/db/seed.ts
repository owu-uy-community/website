/* eslint-disable no-console */
/**
 * Dev-only sample data seed. NON-destructive: refuses to run in production or
 * when communities it does not own exist, unless --force — and even then it
 * only recreates the communities in SEEDED (cascade removes their events/rooms/
 * schedules/tracks — nothing else is touched).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { communities, communityMembers, events, rooms, schedules, tracks, user } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("db:seed is dev-only and must never run against production");
}

const FORCE = process.argv.includes("--force");

/**
 * `--at=HH:MM` lays the blocks out around that time instead of around "now".
 * For demos: seeding at 18:20 for a 19:00 walkthrough otherwise leaves the
 * board finished by the time anyone is watching.
 */
const AT = process.argv.find((arg) => arg.startsWith("--at="))?.slice("--at=".length);

function anchorMinutes(now: Date): number {
  if (!AT) return now.getHours() * 60 + now.getMinutes();

  const match = /^(\d{1,2}):(\d{2})$/.exec(AT);
  if (!match) throw new Error(`--at must look like HH:MM, got "${AT}"`);

  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) throw new Error(`--at is not a valid time: "${AT}"`);

  return hours * 60 + minutes;
}

/**
 * Communities this script owns and may recreate. `owu`/`owu-conf-2026` mirrors
 * what CONF_EVENT points at, so conf.owu.uy/openspace resolves in local dev
 * without hand-building a board first.
 */
const SEEDED = [
  {
    slug: "demo",
    name: "Comunidad Demo",
    description: "Datos de ejemplo para desarrollo",
    eventSlug: "open-space-demo",
    eventName: "Open Space Demo",
    eventDescription: "Un open space de ejemplo para desarrollo",
  },
  {
    slug: "owu",
    name: "OWU — Open Web Uruguay",
    description: "La comunidad de tecnologías abiertas de Uruguay",
    eventSlug: "owu-conf-2026",
    eventName: "OWU CONF 2026",
    eventDescription: "La conferencia de la comunidad tecnológica de Uruguay",
  },
] as const;

const SEEDED_SLUGS = SEEDED.map((entry) => entry.slug) as readonly string[];

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

/** Local calendar day as "YYYY-MM-DD" (not toISOString, which is UTC). */
function toLocalDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateAt(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function main() {
  console.log(`🌱 Seeding database (${SEEDED_SLUGS.join(" + ")})...`);

  const existingCommunities = await db.select({ id: communities.id, slug: communities.slug }).from(communities);
  const mine = existingCommunities.filter((community) => SEEDED_SLUGS.includes(community.slug));
  const others = existingCommunities.filter((community) => !SEEDED_SLUGS.includes(community.slug));

  if (others.length > 0 && !FORCE) {
    throw new Error(
      `Refusing to seed: ${others.length} community(ies) this script does not own exist. Re-run with --force to (re)create only ${SEEDED_SLUGS.join(" + ")}.`
    );
  }
  if (mine.length > 0) {
    if (!FORCE) {
      throw new Error(`Already seeded (${mine.map((c) => c.slug).join(", ")}). Re-run with --force to recreate.`);
    }
    for (const stale of mine) {
      // events.communityId is ON DELETE RESTRICT, so the events go first; each
      // one cascades to its own rooms/schedules/tracks. Members cascade with
      // the community itself.
      await db.delete(events).where(eq(events.communityId, stale.id));
      await db.delete(communities).where(eq(communities.id, stale.id));
      console.log(`  ♻️  Removed previous "${stale.slug}" community`);
    }
  }

  for (const entry of SEEDED) await seedCommunity(entry);

  console.log("✅ Database seeded successfully!");
}

async function seedCommunity(entry: (typeof SEEDED)[number]) {
  const [community] = await db
    .insert(communities)
    .values({ slug: entry.slug, name: entry.name, description: entry.description })
    .returning();

  // Site admins become owners of the seeded communities (handy in dev)
  const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  for (const admin of admins) {
    await db
      .insert(communityMembers)
      .values({ communityId: community.id, userId: admin.id, role: "owner" })
      .onConflictDoNothing({ target: [communityMembers.communityId, communityMembers.userId] });
  }

  const today = new Date();
  const [event] = await db
    .insert(events)
    .values({
      name: entry.eventName,
      description: entry.eventDescription,
      slug: entry.eventSlug,
      communityId: community.id,
      startDate: dateAt("09:00"),
      endDate: dateAt("18:00"),
      isActive: true,
    })
    .returning();

  /*
   * Blocks are laid out around the anchor (`--at`, else "now") so a dev board
   * always has a live block and a next one. Clamped to the day so the last
   * block can never wrap past midnight into a slot that sorts before the first.
   */
  const anchor = anchorMinutes(today);
  const firstBlock = Math.min(Math.max(Math.floor(anchor / 30) * 30 - 60, 0), 24 * 60 - 150);
  const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  // Date is a day marker at UTC midnight — the same shape the admin UI writes.
  const dayMarker = new Date(`${toLocalDay(today)}T00:00:00.000Z`);

  const scheduleRows = await db
    .insert(schedules)
    .values(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Bloque ${index + 1}`,
        startTime: hhmm(firstBlock + index * 30),
        endTime: hhmm(firstBlock + index * 30 + 30),
        date: dayMarker,
        openSpaceId: event.id,
      }))
    )
    .returning();

  const roomRows = await db
    .insert(rooms)
    .values([
      {
        name: "lobby",
        description: "Main lobby area",
        capacity: 50,
        hasTV: true,
        hasWhiteboard: false,
        sortOrder: 0,
        openSpaceId: event.id,
      },
      {
        name: "centro",
        description: "Central meeting room",
        capacity: 30,
        hasTV: false,
        hasWhiteboard: true,
        sortOrder: 1,
        openSpaceId: event.id,
      },
      {
        name: "cueva",
        description: "Cave room for intimate discussions",
        capacity: 20,
        hasTV: true,
        hasWhiteboard: false,
        sortOrder: 3,
        openSpaceId: event.id,
      },
      {
        name: "ventana",
        description: "Window room with natural light",
        capacity: 25,
        hasTV: false,
        hasWhiteboard: true,
        sortOrder: 2,
        openSpaceId: event.id,
      },
      {
        name: "rincon",
        description: "Corner space for small groups",
        capacity: 15,
        hasTV: true,
        hasWhiteboard: false,
        sortOrder: 4,
        openSpaceId: event.id,
      },
    ])
    .returning();

  // (schedule index, room index, title, speaker, description, needsTV, needsWhiteboard)
  const sampleTracks: [number, number, string, string, string, boolean, boolean][] = [
    // 🎨 LOBBY (TV): Frontend cluster — gap at Bloque 1
    [1, 0, "Next.js 15: Server Components", "Santiago Cano", "Guía completa de Server Components", true, false],
    [2, 0, "TypeScript Tips & Tricks", "Laura Martínez", "Trucos avanzados de TypeScript", true, false],
    [3, 0, "React Performance Optimization", "Carlos Ruiz", "Optimización de aplicaciones React", true, false],
    [4, 0, "State Management 2024", "Ana Torres", "Zustand, Jotai y el futuro del state", true, false],
    // 🔒 CENTRO (pizarra): DevOps cluster — gap at Bloque 3
    [0, 1, "Clean Architecture en la Práctica", "Roberto Fernández", "Arquitectura limpia aplicada", false, true],
    [1, 1, "Microservicios: Pros y Contras", "Miguel Ángel Díaz", "Diseñando sistemas distribuidos", false, true],
    [3, 1, "Kubernetes para Devs", "Diego López", "K8s desde la perspectiva del developer", false, true],
    [4, 1, "CI/CD Moderno con GitHub Actions", "Sofía Ramírez", "Pipeline automation workflows", false, true],
    // 🏗️ CUEVA (TV): Backend/Security — gap at Bloque 5
    [0, 2, "Node.js: Escalabilidad y Performance", "Juan Pablo De la torre", "Profiling de Node.js", true, false],
    [1, 2, "GraphQL vs REST en 2024", "Isabel Castro", "Comparativa de APIs", true, false],
    [2, 2, "Introducción al Pentesting", "Jimena Mújica", "Pentesting ético con demos", true, false],
    [3, 2, "Metodología Forense Digital", "Agustín Tornielli", "Análisis forense en ciberseguridad", true, false],
    // 🤖 VENTANA (pizarra): AI/ML — gap at Bloque 2
    [0, 3, "Intro a Machine Learning", "Patricia Morales", "Fundamentos de ML", false, true],
    [2, 3, "RAG: Retrieval Augmented Generation", "Claudia Herrera", "Arquitectura de chatbots con RAG", false, true],
    [3, 3, "Data Pipelines con Python", "Andrés Navarro", "ETL con Pandas y Airflow", false, true],
    [4, 3, "Neural Networks: Conceptos Básicos", "Ricardo Méndez", "Redes neuronales y backpropagation", false, true],
    // 💼 RINCÓN (TV): Carrera — gap at Bloque 4
    [0, 4, "De Junior a Senior: El Camino", "Gabriela Ortiz", "Evolución profesional en tech", false, false],
    [1, 4, "Code Review: Mejores Prácticas", "Javier Mendoza", "Revisiones de código efectivas", false, false],
    [2, 4, "Trabajo Remoto: Tips y Tools", "Valentina Rojas", "Productividad en remoto", false, false],
    [4, 4, "Mentoría en Tech: Guía Práctica", "Elena Rodríguez", "Cómo ser un buen mentor", false, false],
  ];

  await db.insert(tracks).values(
    sampleTracks.map(([scheduleIndex, roomIndex, title, speaker, description, needsTV, needsWhiteboard]) => ({
      title,
      speaker,
      description,
      needsTV,
      needsWhiteboard,
      scheduleId: scheduleRows[scheduleIndex].id,
      roomId: roomRows[roomIndex].id,
      openSpaceId: event.id,
    }))
  );

  console.log(
    `  ✓ ${community.slug} → ${event.slug} (${scheduleRows.length} bloques, ${roomRows.length} salas, ${sampleTracks.length} charlas)`
  );
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
