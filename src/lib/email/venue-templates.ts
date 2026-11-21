import type { Email } from "./send";
import { appUrl, button, esc, layout } from "./templates";

/**
 * The emails between spaces and the communities they host (besides the request and the answers in
 * templates.ts): another date proposed, a request others took first, the yearly check, the
 * host-day sheet, the ID list and the recap. The organizer's own words are always escaped.
 */

type Mail = Omit<Email, "to">;

const P = (text: string, style = "margin:0 0 16px") => `<p style="${style}">${esc(text)}</p>`;
const quote = (text: string | null) =>
  text ? `<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px">«${esc(text)}»</p>` : "";
const mono = (lines: string[]) =>
  `<p style="margin:0 0 16px;font-family:'Geist Mono',ui-monospace,Menlo,monospace">${lines.map(esc).join("<br>")}</p>`;

/** The host can't on those dates but offered others (to the organizer who asked). */
export function venueProposedEmail(input: {
  venue: string;
  dates: string[];
  hostMessage: string | null;
  panelPath: string;
}): Mail {
  const link = appUrl(input.panelPath);
  const line = `${input.venue} no puede en las fechas que pediste, pero propone ${input.dates.length === 1 ? "otra" : "otras"}:`;
  const dates = input.dates.map((date, index) => `${index + 1}. ${date}`);

  return {
    subject: `${input.venue} propone otra fecha`,
    html: layout({
      preheader: `${line} ${input.dates.join(", ")}`,
      body: `${P(line)}${mono(dates)}${quote(input.hostMessage)}
${P("Si alguna te sirve, aceptala desde el panel: queda reservada para tu evento.")}
<p style="margin:0 0 8px">${button(link, "Ver la propuesta")}</p>`,
    }),
    text: `${line}\n${dates.join("\n")}${input.hostMessage ? `\n\n«${input.hostMessage}»` : ""}\n\nSi alguna te sirve, aceptala desde el panel: ${link}`,
  };
}

/** The organizer can't on the dates the host offered (to the host). */
export function venueProposalDeclinedEmail(input: { venue: string; community: string }): Mail {
  const line = `${input.community} no puede en las fechas que propusiste para ${input.venue}. ¡Gracias por la propuesta!`;

  return {
    subject: `${input.community}: esta vez no coincidimos`,
    html: layout({
      preheader: line,
      body: `${P(line)}${P("No hace falta que hagas nada. Cuando una comunidad vuelva a pedir fecha, te llega un mail como siempre.", "margin:0;color:#52525b")}`,
    }),
    text: `${line}\n\nNo hace falta que hagas nada. Cuando una comunidad vuelva a pedir fecha, te llega un mail como siempre.`,
  };
}

/** A request sent to several spaces was taken by another one first (to the hosts that didn't answer yet). */
export function venueBroadcastClosedEmail(input: { venue: string; community: string }): Mail {
  const line = `${input.community} ya encontró lugar para su meetup: el pedido a ${input.venue} quedó sin efecto.`;

  return {
    subject: `Ya se resolvió, ¡gracias! · ${input.community}`,
    html: layout({
      preheader: line,
      body: `${P(line)}${P("Le preguntaron a varios espacios a la vez y otro respondió primero. No hace falta que hagas nada: ¡gracias por estar!", "margin:0;color:#52525b")}`,
    }),
    text: `${line}\n\nLe preguntaron a varios espacios a la vez y otro respondió primero. No hace falta que hagas nada: ¡gracias por estar!`,
  };
}

/** A request sent to several spaces closed with nobody able (to the organizer). */
export function venueBroadcastFailedEmail(input: { count: number; panelPath: string }): Mail {
  const link = appUrl(input.panelPath);
  const line = `Ninguno de los ${input.count} espacios a los que les pediste lugar puede esta vez.`;

  return {
    subject: "Ningún espacio pudo esta vez",
    html: layout({
      preheader: line,
      body: `${P(line)}${P("Probá con otras fechas o con el Plan B desde el panel.")}<p style="margin:0 0 8px">${button(link, "Buscar otro espacio")}</p>`,
    }),
    text: `${line}\n\nProbá con otras fechas o con el Plan B: ${link}`,
  };
}

/** Once a year: does this person still answer for the space? Three buttons on a signed page. */
export function venueCheckEmail(input: { name: string; venue: string; link: string }): Mail {
  const hi = input.name ? `Hola ${input.name.split(" ")[0]},` : "Hola,";
  const line = `¿${input.venue} sigue pudiendo recibir meetups de las comunidades de OWU?`;

  return {
    subject: `¿Siguen pudiendo recibir meetups en ${input.venue}?`,
    html: layout({
      preheader: "Un clic: sí, por ahora no, o ya no trabajo ahí.",
      body: `${P(hi)}${P(line)}
${P("Una vez al año preguntamos, así los pedidos le llegan a quien puede responderlos. Es un clic: sí, por ahora no, o ya no trabajás ahí. Si querés, ahí mismo actualizás cómo se llega y qué hay en el espacio.")}
<p style="margin:0 0 8px">${button(input.link, "Responder")}</p>`,
    }),
    text: `${hi}\n\n${line}\n\nUna vez al año preguntamos, así los pedidos le llegan a quien puede responderlos. Es un clic: ${input.link}`,
  };
}

/** A week before: what the space should expect that day. */
export function venueDaySheetEmail(input: {
  venue: string;
  community: string;
  event: string;
  when: string;
  arrival: string;
  expected: number;
  needs: string[];
  food: string | null;
  idListBy: string | null;
  organizer: { name: string; email: string } | null;
}): Mail {
  const rows = [
    ["Cuándo", input.when],
    ["Llega el equipo", `${input.arrival}, para armar`],
    ["Personas", `unas ${input.expected}`],
    ["Necesitan", input.needs.length > 0 ? input.needs.join(", ") : "nada en especial"],
    ...(input.food ? [["Comida", input.food]] : []),
    ...(input.idListBy ? [["Lista para seguridad", `les llega el ${input.idListBy}`]] : []),
    ...(input.organizer ? [["Quien organiza", `${input.organizer.name} (${input.organizer.email})`]] : []),
  ];
  const line = `En una semana ${input.community} hace «${input.event}» en ${input.venue}. Esto es lo que conviene saber.`;

  return {
    subject: `En una semana: ${input.community} en ${input.venue}`,
    html: layout({
      preheader: `${input.when} · unas ${input.expected} personas`,
      body: `${P(line)}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;font-size:14px">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#71717a;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0">${esc(value)}</td></tr>`
        )
        .join("")}</table>
${P("Si algo cambió del lado del espacio (la sala, el horario, el acceso), avisale a quien organiza. ¡Gracias por recibirlos!", "margin:0;color:#52525b")}`,
    }),
    text: `${line}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nSi algo cambió del lado del espacio, avisale a quien organiza. ¡Gracias por recibirlos!`,
  };
}

/** The building's security list: names and ID numbers of the people with a seat, nothing else. */
export function venueIdListEmail(input: {
  venue: string;
  community: string;
  event: string;
  when: string;
  people: { name: string; id: string }[];
}): Mail {
  const line = `La lista para el ingreso a ${input.venue}: ${input.people.length} ${input.people.length === 1 ? "persona" : "personas"} anotadas a «${input.event}» (${input.when}).`;
  const privacy =
    "La compartimos solo para el control de ingreso: cada persona aceptó dar su cédula para esto al anotarse. Borrala después del evento.";

  return {
    subject: `Lista de ingreso: ${input.community} en ${input.venue}`,
    html: layout({
      preheader: line,
      body: `${P(line)}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;font-size:14px;border-collapse:collapse">
<tr><th align="left" style="padding:6px 0;border-bottom:1px solid #e4e4e7">Nombre</th><th align="left" style="padding:6px 0;border-bottom:1px solid #e4e4e7">Cédula</th></tr>
${input.people
  .map(
    (person) =>
      `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #f4f4f5">${esc(person.name)}</td><td style="padding:6px 0;border-bottom:1px solid #f4f4f5;font-family:ui-monospace,Menlo,monospace">${esc(person.id)}</td></tr>`
  )
  .join("")}
</table>
${P(privacy, "margin:0;color:#52525b;font-size:13px")}`,
    }),
    text: `${line}\n\n${input.people.map((person) => `${person.name}\t${person.id}`).join("\n")}\n\n${privacy}`,
  };
}

/** After the event: how it went, in numbers, and thanks. Never who came. */
export function venueRecapEmail(input: {
  venue: string;
  community: string;
  event: string;
  when: string;
  came: number;
  fromDoor: boolean;
  firstTimers: number | null;
  rating: { average: number; answers: number } | null;
  comments: string[];
  materials: { title: string; url: string }[];
  note: string;
}): Mail {
  const facts = [
    input.fromDoor
      ? `${input.came} ${input.came === 1 ? "persona vino" : "personas vinieron"} a «${input.event}» (${input.when}).`
      : `${input.came} ${input.came === 1 ? "persona tenía lugar" : "personas tenían lugar"} en «${input.event}» (${input.when}).`,
    input.firstTimers !== null && input.came > 0
      ? `Para el ${Math.round(input.firstTimers * 100)} % era su primer evento de ${input.community}.`
      : "",
    input.rating
      ? `Le pusieron ${input.rating.average.toLocaleString("es-UY", { maximumFractionDigits: 1 })} de 5 (${input.rating.answers} ${input.rating.answers === 1 ? "respuesta" : "respuestas"}).`
      : "",
  ].filter(Boolean);
  const thanks = `¡Gracias a ${input.venue} por recibirnos! Sin espacios como el de ustedes no hay meetups.`;

  return {
    subject: `Cómo salió «${input.event}» en ${input.venue}`,
    html: layout({
      preheader: facts[0] ?? thanks,
      body: `${input.note ? `<p style="margin:0 0 16px;white-space:pre-line">${esc(input.note)}</p>` : ""}${facts.map((line) => P(line, "margin:0 0 10px")).join("")}
${input.comments.length > 0 ? `<p style="margin:16px 0 8px;font-weight:600">Lo que dijeron del espacio</p>${input.comments.map((comment) => quote(comment)).join("")}` : ""}
${input.materials.length > 0 ? `<p style="margin:16px 0 8px;font-weight:600">Fotos y materiales</p><ul style="margin:0 0 16px;padding-left:18px">${input.materials.map((item) => `<li><a href="${esc(item.url)}" style="color:#18181b">${esc(item.title)}</a></li>`).join("")}</ul>` : ""}
${P(thanks, "margin:16px 0 0")}
${P(`${input.community}, con OWU`, "margin:8px 0 0;color:#71717a;font-size:13px")}`,
    }),
    text: [
      input.note,
      facts.join("\n"),
      input.comments.length > 0
        ? `Lo que dijeron del espacio:\n${input.comments.map((comment) => `«${comment}»`).join("\n")}`
        : "",
      input.materials.length > 0
        ? `Fotos y materiales:\n${input.materials.map((item) => `${item.title}: ${item.url}`).join("\n")}`
        : "",
      thanks,
      `${input.community}, con OWU`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
