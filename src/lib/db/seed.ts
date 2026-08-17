/* eslint-disable no-console */
/**
 * Dev-only sample data seed. NON-destructive: refuses to run in production or
 * when real data exists (communities present) unless --force, and even then it
 * only recreates its own "demo" community (cascade removes its events/rooms/
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
const DEMO_SLUG = "demo";

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

function dateAt(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function main() {
  console.log("🌱 Seeding database (demo community)...");

  const existingCommunities = await db.select({ id: communities.id, slug: communities.slug }).from(communities);
  const demo = existingCommunities.find((community) => community.slug === DEMO_SLUG);
  const others = existingCommunities.filter((community) => community.slug !== DEMO_SLUG);

  if (others.length > 0 && !FORCE) {
    throw new Error(
      `Refusing to seed: ${others.length} non-demo communities exist. Re-run with --force to (re)create only the demo community.`
    );
  }
  if (demo) {
    if (!FORCE) {
      throw new Error('The "demo" community already exists. Re-run with --force to recreate it.');
    }
    await db.delete(communities).where(eq(communities.id, demo.id)); // cascades to its events/rooms/schedules/tracks
    console.log('  ♻️  Removed previous "demo" community');
  }

  const [community] = await db
    .insert(communities)
    .values({ slug: DEMO_SLUG, name: "Comunidad Demo", description: "Datos de ejemplo para desarrollo" })
    .returning();

  // Site admins become owners of the demo community (handy in dev)
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
      name: "Open Space Demo",
      description: "Un open space de ejemplo para desarrollo",
      slug: "open-space-demo",
      communityId: community.id,
      startDate: dateAt("09:00"),
      endDate: dateAt("18:00"),
      isActive: true,
    })
    .returning();

  // Schedules span the current time so the dashboard shows a live/next block in dev
  const scheduleRows = await db
    .insert(schedules)
    .values([
      { name: "Bloque 1", startTime: "11:00", endTime: "11:30", date: today, openSpaceId: event.id },
      { name: "Bloque 2", startTime: "11:30", endTime: "12:00", date: today, openSpaceId: event.id },
      { name: "Bloque 3", startTime: "12:00", endTime: "12:30", date: today, openSpaceId: event.id },
      { name: "Bloque 4", startTime: "12:30", endTime: "13:00", date: today, openSpaceId: event.id },
      { name: "Bloque 5", startTime: "13:00", endTime: "13:30", date: today, openSpaceId: event.id },
    ])
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
        openSpaceId: event.id,
      },
      {
        name: "centro",
        description: "Central meeting room",
        capacity: 30,
        hasTV: false,
        hasWhiteboard: true,
        openSpaceId: event.id,
      },
      {
        name: "cueva",
        description: "Cave room for intimate discussions",
        capacity: 20,
        hasTV: true,
        hasWhiteboard: false,
        openSpaceId: event.id,
      },
      {
        name: "ventana",
        description: "Window room with natural light",
        capacity: 25,
        hasTV: false,
        hasWhiteboard: true,
        openSpaceId: event.id,
      },
      {
        name: "rincon",
        description: "Corner space for small groups",
        capacity: 15,
        hasTV: true,
        hasWhiteboard: false,
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

  console.log("✅ Database seeded successfully!");
  console.log(`Created community: ${community.slug} → event: ${event.slug}`);
  console.log(`Created ${scheduleRows.length} schedules, ${roomRows.length} rooms, ${sampleTracks.length} tracks`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
