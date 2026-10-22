import type { CommunityStatements, PlatformStatements } from "./catalog";

/** How roles read in Spanish, in the dashboard and in emails. Custom roles bring their own label. */
export const ROLE_LABELS: Record<string, { label: string; hint: string }> = {
  owner: { label: "Dueño", hint: "Todo, incluido sumar o sacar a otros dueños y admins." },
  admin: { label: "Admin", hint: "Equipo, asistentes, mails, puerta e integraciones de la comunidad." },
  editor: { label: "Editor", hint: "Arma y publica eventos, encuestas, tareas e incidentes." },
  member: { label: "Miembro", hint: "Staff del día: sus tareas, la puerta e incidentes." },
  door: { label: "Puerta", hint: "Solo acreditar gente en la puerta." },
  superadmin: { label: "Superadmin", hint: "Todo el sitio: roles, llaves, auditoría y ver como otra persona." },
  staff: { label: "Staff de OWU", hint: "La operación de todos los eventos: grilla, OBS, pantallas, comunicación." },
  moderator: { label: "Moderación", hint: "Personas y accesos: pedidos, invitaciones, suspensiones." },
  service: { label: "Servicio", hint: "Una máquina (Owy, un Stream Deck): solo con su llave." },
  user: { label: "Persona", hint: "Sin rol: puede anotarse a eventos y pedir acceso." },
};

/** "Editor", a custom role's own label, or the slug itself. */
export const roleLabel = (role: string | null | undefined, custom?: string | null) =>
  custom ?? (role ? (ROLE_LABELS[role]?.label ?? role) : "Sin rol");

type Labels<S extends Record<string, readonly string[]>> = {
  [R in keyof S]: { label: string; actions: { [A in S[R][number]]: string } };
};

/** Every community permission, as the custom-role editor lists them. */
export const COMMUNITY_PERMISSION_LABELS: Labels<CommunityStatements> = {
  organization: { label: "Comunidad", actions: { update: "Editar el perfil y los ajustes" } },
  member: {
    label: "Equipo",
    actions: {
      read: "Ver el equipo",
      create: "Sumar gente",
      update: "Cambiar roles",
      delete: "Sacar gente",
      "manage-admins": "Sumar, cambiar o sacar admins",
      "manage-owners": "Sumar, cambiar o sacar dueños",
      "show-on-profile": "Aparecer en la página pública",
    },
  },
  invitation: { label: "Invitaciones", actions: { create: "Invitar", cancel: "Cancelar invitaciones" } },
  role: {
    label: "Roles",
    actions: { read: "Ver los roles", create: "Crear roles", update: "Editar roles", delete: "Borrar roles" },
  },
  event: {
    label: "Eventos",
    actions: {
      list: "Ver la lista de eventos",
      read: "Abrir un evento",
      create: "Crear borradores",
      update: "Editar",
      publish: "Publicar",
      cancel: "Cancelar",
      delete: "Borrar borradores",
      hold: "Reservar fechas",
      stats: "Ver números",
      cohost: "Co-organizar con otras comunidades",
      message: "Mandar mails a los anotados",
      "door-link": "Abrir la puerta (links y escáner)",
    },
  },
  rsvp: {
    label: "Inscripciones",
    actions: {
      review: "Aprobar inscripciones",
      seat: "Dar lugar",
      cancel: "Cancelar lugares",
      test: "Mandar mails de prueba",
    },
  },
  attendee: {
    label: "Asistentes",
    actions: {
      read: "Ver asistentes (con sus datos)",
      export: "Exportar",
      tag: "Etiquetar",
      sync: "Sincronizar con Eventbrite",
      undo: "Deshacer acreditaciones",
      checkin: "Acreditar",
      checkins: "Ver acreditaciones",
    },
  },
  task: {
    label: "Tareas",
    actions: { read: "Ver tareas", work: "Tomar y completar tareas", manage: "Armar y asignar" },
  },
  announcement: { label: "Avisos al staff", actions: { read: "Leer", ack: "Confirmar", manage: "Publicar" } },
  incident: {
    label: "Incidentes",
    actions: {
      read: "Ver",
      report: "Reportar",
      work: "Atender",
      delete: "Borrar",
      manage: "Gestionar todos",
      confidential: "Ver reportes de conducta",
    },
  },
  integration: {
    label: "Integraciones",
    actions: { read: "Ver", retry: "Reintentar", connect: "Conectar cuentas", disconnect: "Desconectar" },
  },
  venue: { label: "Espacios", actions: { requests: "Ver pedidos", read: "Ver espacios", request: "Pedir espacio" } },
  survey: { label: "Encuestas", actions: { read: "Ver resultados", write: "Armar" } },
  poll: {
    label: "Votaciones de fecha",
    actions: { read: "Ver", create: "Crear", vote: "Votar", choose: "Elegir fecha" },
  },
  room: { label: "Salas", actions: { "set-status": "Cambiar el estado de una sala" } },
  calendar: { label: "Calendario", actions: { read: "Ver el calendario compartido" } },
  activity: { label: "Actividad", actions: { read: "Ver la actividad" } },
  dashboard: { label: "Resumen", actions: { read: "Ver el resumen del día" } },
  assistant: { label: "Asistente", actions: { ask: "Preguntarle al asistente" } },
};

/** The platform-only resources, for the read-only roles matrix. */
export const PLATFORM_RESOURCE_LABELS: Partial<Record<keyof PlatformStatements, string>> = {
  user: "Personas",
  session: "Sesiones",
  claim: "Pedidos y reclamos",
  program: "Grilla",
  raffle: "Sorteos",
  comms: "Comunicación",
  stage: "Escenario y pantallas",
  obs: "OBS",
  runOfShow: "Guion",
  semanario: "Semanario",
  salarySurvey: "Encuesta de sueldos",
  insight: "Números del sitio",
  apiKey: "Llaves API",
  audit: "Auditoría",
  delegation: "Actuar por otra persona",
  owy: "Operar a Owy",
};
