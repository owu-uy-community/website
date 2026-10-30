import { toast } from "components/shared/ui/toast-utils";
import type { Attendee } from "lib/orpc/attendees/schemas";

/** Save the CSV the server built, under its own name, and say how many went in it. */
export function downloadCsv({ filename, csv, count }: { filename: string; csv: string; count: number }) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success(count === 1 ? "Exportamos 1 asistente" : `Exportamos ${count} asistentes`, filename);
}

/** Where someone came in: Organizer's method, the OWU scanner's device name, or just who. */
export function doorOf(attendee: Pick<Attendee, "checkinDevice" | "checkinSource">) {
  return attendee.checkinDevice || (attendee.checkinSource === "owu" ? "Escáner OWU" : "Organizer");
}
