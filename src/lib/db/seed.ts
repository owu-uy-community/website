import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { openSpaces, rooms, schedules, tracks } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set");
}

const pool = new Pool({ connectionString });
const db = drizzle({ client: pool });

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data (in proper order due to foreign keys)
  await db.delete(tracks);
  await db.delete(schedules);
  await db.delete(rooms);
  await db.delete(openSpaces);

  // Create sample OpenSpace with fixed ID to match frontend
  const [openSpace] = await db
    .insert(openSpaces)
    .values({
      id: "default-openspace", // Fixed ID to match frontend hardcoded value
      name: "LA Meetup 2024",
      description: "An exciting OpenSpace meetup in LA",
      startDate: new Date("2024-12-15T09:00:00"),
      endDate: new Date("2024-12-15T17:00:00"),
      isActive: true,
    })
    .returning();

  // Create sample schedules to match the frontend time slots
  // (RETURNING preserves VALUES order, so indexes line up with the tracks below)
  const scheduleRows = await db
    .insert(schedules)
    .values([
      { name: "Morning Session 1", startTime: "11:00", endTime: "11:30", date: new Date("2024-12-15"), openSpaceId: openSpace.id },
      { name: "Morning Session 2", startTime: "11:30", endTime: "12:00", date: new Date("2024-12-15"), openSpaceId: openSpace.id },
      { name: "Early Afternoon", startTime: "12:00", endTime: "12:30", date: new Date("2024-12-15"), openSpaceId: openSpace.id },
      { name: "Mid Afternoon", startTime: "12:30", endTime: "13:00", date: new Date("2024-12-15"), openSpaceId: openSpace.id },
      { name: "Late Afternoon", startTime: "13:00", endTime: "13:30", date: new Date("2024-12-15"), openSpaceId: openSpace.id },
    ])
    .returning();

  // Create sample rooms with resources
  // TV: cueva, rincón, lobby
  // Whiteboard: centro, ventana
  const roomRows = await db
    .insert(rooms)
    .values([
      { name: "lobby", description: "Main lobby area", capacity: 50, hasTV: true, hasWhiteboard: false, openSpaceId: openSpace.id },
      { name: "centro", description: "Central meeting room", capacity: 30, hasTV: false, hasWhiteboard: true, openSpaceId: openSpace.id },
      { name: "cueva", description: "Cave room for intimate discussions", capacity: 20, hasTV: true, hasWhiteboard: false, openSpaceId: openSpace.id },
      { name: "ventana", description: "Window room with natural light", capacity: 25, hasTV: false, hasWhiteboard: true, openSpaceId: openSpace.id },
      { name: "rincon", description: "Corner space for small groups", capacity: 15, hasTV: true, hasWhiteboard: false, openSpaceId: openSpace.id },
    ])
    .returning();

  // Create sample tracks organized by topic clusters in rooms (5 strategic gaps left for testing)
  const sampleTracks = [
    // 🎨 LOBBY ROOM (has TV): Frontend/JavaScript Technical cluster (GAP: 11:00)
    {
      title: "Next.js 15: Server Components",
      scheduleId: scheduleRows[1].id, // 11:30
      roomId: roomRows[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Santiago Cano",
      description: "Guía completa de Server Components",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "TypeScript Tips & Tricks",
      scheduleId: scheduleRows[2].id, // 12:00
      roomId: roomRows[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Laura Martínez",
      description: "Trucos avanzados de TypeScript",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "React Performance Optimization",
      scheduleId: scheduleRows[3].id, // 12:30
      roomId: roomRows[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Carlos Ruiz",
      description: "Optimización de aplicaciones React",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "State Management 2024",
      scheduleId: scheduleRows[4].id, // 13:00
      roomId: roomRows[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Ana Torres",
      description: "Zustand, Jotai y el futuro del state",
      needsTV: true,
      needsWhiteboard: false,
    },

    // 🔒 CENTRO ROOM (has Whiteboard): DevOps/Architecture cluster (GAP: 12:00)
    {
      title: "Clean Architecture en la Práctica",
      scheduleId: scheduleRows[0].id, // 11:00
      roomId: roomRows[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Roberto Fernández",
      description: "Arquitectura limpia aplicada con diagramas",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "Microservicios: Pros y Contras",
      scheduleId: scheduleRows[1].id, // 11:30
      roomId: roomRows[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Miguel Ángel Díaz",
      description: "Diseñando sistemas distribuidos",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "Kubernetes para Devs",
      scheduleId: scheduleRows[3].id, // 12:30
      roomId: roomRows[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Diego López",
      description: "K8s desde la perspectiva del developer",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "CI/CD Moderno con GitHub Actions",
      scheduleId: scheduleRows[4].id, // 13:00
      roomId: roomRows[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Sofía Ramírez",
      description: "Pipeline automation workflows",
      needsTV: false,
      needsWhiteboard: true,
    },

    // 🏗️ CUEVA ROOM (has TV): Backend/Security cluster (GAP: 13:00)
    {
      title: "Node.js: Escalabilidad y Performance",
      scheduleId: scheduleRows[0].id, // 11:00
      roomId: roomRows[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Juan Pablo De la torre",
      description: "Optimizando aplicaciones Node.js con profiling",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "GraphQL vs REST en 2024",
      scheduleId: scheduleRows[1].id, // 11:30
      roomId: roomRows[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Isabel Castro",
      description: "Comparativa de APIs con ejemplos prácticos",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "Introducción al Pentesting",
      scheduleId: scheduleRows[2].id, // 12:00
      roomId: roomRows[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Jimena Mújica",
      description: "Fundamentos de pentesting ético con demos",
      needsTV: true,
      needsWhiteboard: false,
    },
    {
      title: "Metodología Forense Digital",
      scheduleId: scheduleRows[3].id, // 12:30
      roomId: roomRows[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Agustín Tornielli",
      description: "Análisis forense en ciberseguridad",
      needsTV: true,
      needsWhiteboard: false,
    },

    // 🤖 VENTANA ROOM (has Whiteboard): AI/ML/Data cluster (GAP: 11:30)
    {
      title: "Intro a Machine Learning",
      scheduleId: scheduleRows[0].id, // 11:00
      roomId: roomRows[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Patricia Morales",
      description: "Fundamentos de ML: algoritmos y matemáticas",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "RAG: Retrieval Augmented Generation",
      scheduleId: scheduleRows[2].id, // 12:00
      roomId: roomRows[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Claudia Herrera",
      description: "Arquitectura de chatbots con RAG",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "Data Pipelines con Python",
      scheduleId: scheduleRows[3].id, // 12:30
      roomId: roomRows[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Andrés Navarro",
      description: "Diseño de ETL con Pandas y Airflow",
      needsTV: false,
      needsWhiteboard: true,
    },
    {
      title: "Neural Networks: Conceptos Básicos",
      scheduleId: scheduleRows[4].id, // 13:00
      roomId: roomRows[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Ricardo Méndez",
      description: "Fundamentos de redes neuronales y backpropagation",
      needsTV: false,
      needsWhiteboard: true,
    },

    // 💼 RINCÓN ROOM (has TV): Soft Skills & Career cluster (GAP: 12:30)
    {
      title: "De Junior a Senior: El Camino",
      scheduleId: scheduleRows[0].id, // 11:00
      roomId: roomRows[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Gabriela Ortiz",
      description: "Evolución profesional en tech",
      needsTV: false,
      needsWhiteboard: false,
    },
    {
      title: "Code Review: Mejores Prácticas",
      scheduleId: scheduleRows[1].id, // 11:30
      roomId: roomRows[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Javier Mendoza",
      description: "Revisiones de código efectivas y comunicación",
      needsTV: false,
      needsWhiteboard: false,
    },
    {
      title: "Trabajo Remoto: Tips y Tools",
      scheduleId: scheduleRows[2].id, // 12:00
      roomId: roomRows[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Valentina Rojas",
      description: "Productividad en remoto y balance",
      needsTV: false,
      needsWhiteboard: false,
    },
    {
      title: "Mentoría en Tech: Guía Práctica",
      scheduleId: scheduleRows[4].id, // 13:00
      roomId: roomRows[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Elena Rodríguez",
      description: "Cómo ser un buen mentor y ayudar a otros",
      needsTV: false,
      needsWhiteboard: false,
    },
  ];

  await db.insert(tracks).values(sampleTracks);

  console.log("✅ Database seeded successfully!");
  console.log(`Created OpenSpace: ${openSpace.name}`);
  console.log(`Created ${scheduleRows.length} schedules`);
  console.log(`Created ${roomRows.length} rooms`);
  console.log(`Created ${sampleTracks.length} tracks (with 5 strategic gaps for testing)`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
