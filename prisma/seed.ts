import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data (in proper order due to foreign keys)
  await prisma.track.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.room.deleteMany();
  await prisma.openSpace.deleteMany();

  // Create sample OpenSpace with fixed ID to match frontend
  const openSpace = await prisma.openSpace.create({
    data: {
      id: "default-openspace", // Fixed ID to match frontend hardcoded value
      name: "LA Meetup 2024",
      description: "An exciting OpenSpace meetup in LA",
      startDate: new Date("2024-12-15T09:00:00"),
      endDate: new Date("2024-12-15T17:00:00"),
      isActive: true,
    },
  });

  // Create sample schedules to match the frontend time slots
  const schedules = await Promise.all([
    prisma.schedule.create({
      data: {
        name: "Morning Session 1",
        startTime: "11:00",
        endTime: "11:30",
        date: new Date("2024-12-15"),
        openSpaceId: openSpace.id,
      },
    }),
    prisma.schedule.create({
      data: {
        name: "Morning Session 2",
        startTime: "11:30",
        endTime: "12:00",
        date: new Date("2024-12-15"),
        openSpaceId: openSpace.id,
      },
    }),
    prisma.schedule.create({
      data: {
        name: "Early Afternoon",
        startTime: "12:00",
        endTime: "12:30",
        date: new Date("2024-12-15"),
        openSpaceId: openSpace.id,
      },
    }),
    prisma.schedule.create({
      data: {
        name: "Mid Afternoon",
        startTime: "12:30",
        endTime: "13:00",
        date: new Date("2024-12-15"),
        openSpaceId: openSpace.id,
      },
    }),
    prisma.schedule.create({
      data: {
        name: "Late Afternoon",
        startTime: "13:00",
        endTime: "13:30",
        date: new Date("2024-12-15"),
        openSpaceId: openSpace.id,
      },
    }),
  ]);

  // Create sample rooms with resources
  // TV: cueva, rincón, lobby
  // Whiteboard: centro, ventana
  const rooms = await Promise.all([
    prisma.room.create({
      data: {
        name: "lobby",
        description: "Main lobby area",
        capacity: 50,
        hasTV: true,
        hasWhiteboard: false,
        openSpaceId: openSpace.id,
      },
    }),
    prisma.room.create({
      data: {
        name: "centro",
        description: "Central meeting room",
        capacity: 30,
        hasTV: false,
        hasWhiteboard: true,
        openSpaceId: openSpace.id,
      },
    }),
    prisma.room.create({
      data: {
        name: "cueva",
        description: "Cave room for intimate discussions",
        capacity: 20,
        hasTV: true,
        hasWhiteboard: false,
        openSpaceId: openSpace.id,
      },
    }),
    prisma.room.create({
      data: {
        name: "ventana",
        description: "Window room with natural light",
        capacity: 25,
        hasTV: false,
        hasWhiteboard: true,
        openSpaceId: openSpace.id,
      },
    }),
    prisma.room.create({
      data: {
        name: "rincon",
        description: "Corner space for small groups",
        capacity: 15,
        hasTV: true,
        hasWhiteboard: false,
        openSpaceId: openSpace.id,
      },
    }),
  ]);

  // Create sample tracks organized by topic clusters in rooms
  // Following AI clustering strategy from find-spot.ts:
  // - Resource matching is MANDATORY (TV/Whiteboard must match room)
  // - Topic continuity in room (same category together)
  // - Categories: Technical, Leadership, Soft Skills, Business

  const sampleTracks = [
    // 🎨 LOBBY ROOM (has TV): Frontend/JavaScript Technical cluster - 4 talks
    // Category: Technical (Programming frameworks)
    // Needs: TV for code demos and live coding
    // GAP: 11:00 slot removed for testing
    {
      title: "Next.js 15: Server Components",
      scheduleId: schedules[1].id, // 11:30
      roomId: rooms[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Santiago Cano",
      description: "Guía completa de Server Components",
      needsTV: true, // ✓ Room has TV
      needsWhiteboard: false,
    },
    {
      title: "TypeScript Tips & Tricks",
      scheduleId: schedules[2].id, // 12:00
      roomId: rooms[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Laura Martínez",
      description: "Trucos avanzados de TypeScript",
      needsTV: true, // ✓ Room has TV
      needsWhiteboard: false,
    },
    {
      title: "React Performance Optimization",
      scheduleId: schedules[3].id, // 12:30
      roomId: rooms[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Carlos Ruiz",
      description: "Optimización de aplicaciones React",
      needsTV: true, // ✓ Room has TV
      needsWhiteboard: false,
    },
    {
      title: "State Management 2024",
      scheduleId: schedules[4].id, // 13:00
      roomId: rooms[0].id, // lobby
      openSpaceId: openSpace.id,
      speaker: "Ana Torres",
      description: "Zustand, Jotai y el futuro del state",
      needsTV: true, // ✓ Room has TV
      needsWhiteboard: false,
    },

    // 🔒 CENTRO ROOM (has Whiteboard): DevOps/Architecture Technical cluster - 5 talks
    // Category: Technical (DevOps, Architecture, Infrastructure)
    // Needs: Whiteboard for system diagrams, architecture flows, and infrastructure design
    {
      title: "Clean Architecture en la Práctica",
      scheduleId: schedules[0].id, // 11:00
      roomId: rooms[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Roberto Fernández",
      description: "Arquitectura limpia aplicada con diagramas",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for architecture diagrams
    },
    {
      title: "Microservicios: Pros y Contras",
      scheduleId: schedules[1].id, // 11:30
      roomId: rooms[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Miguel Ángel Díaz",
      description: "Diseñando sistemas distribuidos",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for system design
    },
    // GAP: 12:00 slot removed for testing (Docker)
    {
      title: "Kubernetes para Devs",
      scheduleId: schedules[3].id, // 12:30
      roomId: rooms[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Diego López",
      description: "K8s desde la perspectiva del developer",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for cluster diagrams
    },
    {
      title: "CI/CD Moderno con GitHub Actions",
      scheduleId: schedules[4].id, // 13:00
      roomId: rooms[1].id, // centro
      openSpaceId: openSpace.id,
      speaker: "Sofía Ramírez",
      description: "Pipeline automation workflows",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for pipeline flows
    },

    // 🏗️ CUEVA ROOM (has TV): Backend/Security Technical cluster - 5 talks
    // Category: Technical (Backend, APIs, Security)
    // Needs: TV for code demos, API testing, and security demonstrations
    {
      title: "Node.js: Escalabilidad y Performance",
      scheduleId: schedules[0].id, // 11:00
      roomId: rooms[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Juan Pablo De la torre",
      description: "Optimizando aplicaciones Node.js con profiling",
      needsTV: true, // ✓ Room has TV - for live profiling demos
      needsWhiteboard: false,
    },
    {
      title: "GraphQL vs REST en 2024",
      scheduleId: schedules[1].id, // 11:30
      roomId: rooms[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Isabel Castro",
      description: "Comparativa de APIs con ejemplos prácticos",
      needsTV: true, // ✓ Room has TV - for API demos
      needsWhiteboard: false,
    },
    {
      title: "Introducción al Pentesting",
      scheduleId: schedules[2].id, // 12:00
      roomId: rooms[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Jimena Mújica",
      description: "Fundamentos de pentesting ético con demos",
      needsTV: true, // ✓ Room has TV - for security tool demos
      needsWhiteboard: false,
    },
    {
      title: "Metodología Forense Digital",
      scheduleId: schedules[3].id, // 12:30
      roomId: rooms[2].id, // cueva
      openSpaceId: openSpace.id,
      speaker: "Agustín Tornielli",
      description: "Análisis forense en ciberseguridad",
      needsTV: true, // ✓ Room has TV - for forensic analysis demos
      needsWhiteboard: false,
    },
    // GAP: 13:00 slot removed for testing (Testing de APIs)

    // 🤖 VENTANA ROOM (has Whiteboard): AI/ML/Data Technical cluster - 4 talks
    // Category: Technical (AI, Machine Learning, Data Science)
    // Needs: Whiteboard for algorithms, math formulas, and model architecture
    {
      title: "Intro a Machine Learning",
      scheduleId: schedules[0].id, // 11:00
      roomId: rooms[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Patricia Morales",
      description: "Fundamentos de ML: algoritmos y matemáticas",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for ML algorithms & math
    },
    // GAP: 11:30 slot removed for testing (LLMs y Embeddings)
    {
      title: "RAG: Retrieval Augmented Generation",
      scheduleId: schedules[2].id, // 12:00
      roomId: rooms[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Claudia Herrera",
      description: "Arquitectura de chatbots con RAG",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for RAG architecture
    },
    {
      title: "Data Pipelines con Python",
      scheduleId: schedules[3].id, // 12:30
      roomId: rooms[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Andrés Navarro",
      description: "Diseño de ETL con Pandas y Airflow",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for pipeline architecture
    },
    {
      title: "Neural Networks: Conceptos Básicos",
      scheduleId: schedules[4].id, // 13:00
      roomId: rooms[3].id, // ventana
      openSpaceId: openSpace.id,
      speaker: "Ricardo Méndez",
      description: "Fundamentos de redes neuronales y backpropagation",
      needsTV: false,
      needsWhiteboard: true, // ✓ Room has Whiteboard - for neural net diagrams
    },

    // 💼 RINCÓN ROOM (has TV): Soft Skills & Career cluster - 4 talks
    // Category: Soft Skills (Career growth, communication, work-life balance)
    // Needs: TV for presentations and slide decks (optional, no demos)
    {
      title: "De Junior a Senior: El Camino",
      scheduleId: schedules[0].id, // 11:00
      roomId: rooms[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Gabriela Ortiz",
      description: "Evolución profesional en tech",
      needsTV: false, // Optional - presentation can work without TV
      needsWhiteboard: false,
    },
    {
      title: "Code Review: Mejores Prácticas",
      scheduleId: schedules[1].id, // 11:30
      roomId: rooms[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Javier Mendoza",
      description: "Revisiones de código efectivas y comunicación",
      needsTV: false, // Optional - can show examples on TV but not required
      needsWhiteboard: false,
    },
    {
      title: "Trabajo Remoto: Tips y Tools",
      scheduleId: schedules[2].id, // 12:00
      roomId: rooms[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Valentina Rojas",
      description: "Productividad en remoto y balance",
      needsTV: false, // Optional - mostly discussion-based
      needsWhiteboard: false,
    },
    // GAP: 12:30 slot removed for testing (Liderazgo Técnico)
    {
      title: "Mentoría en Tech: Guía Práctica",
      scheduleId: schedules[4].id, // 13:00
      roomId: rooms[4].id, // rincon
      openSpaceId: openSpace.id,
      speaker: "Elena Rodríguez",
      description: "Cómo ser un buen mentor y ayudar a otros",
      needsTV: false, // Optional - mostly discussion-based
      needsWhiteboard: false,
    },
  ];

  for (const track of sampleTracks) {
    await prisma.track.create({
      data: track,
    });
  }

  console.log("✅ Database seeded successfully!");
  console.log(`Created OpenSpace: ${openSpace.name}`);
  console.log(`Created ${schedules.length} schedules`);
  console.log(`Created ${rooms.length} rooms`);
  console.log(`Created ${sampleTracks.length} tracks (with 5 strategic gaps for testing)`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
