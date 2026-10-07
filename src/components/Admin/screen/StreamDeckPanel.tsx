"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";

const ENDPOINTS: [string, string][] = [
  ["POST scene/{escena}", "Escena al aire (con la transición actual)"],
  ["POST preview/{escena}", "Escena a preview (modo estudio)"],
  ["POST take · POST cut", "TAKE / CUT (preview → program)"],
  ["POST studio/on · studio/off", "Modo estudio"],
  ["POST transition/{nombre}/{ms}", "Cambiar transición y duración"],
  ["POST mute/{fuente} · mute/{fuente}/on|off", "Mutear (toggle sin sufijo)"],
  ["POST stream/start|stop · record/start|stop", "Stream y grabación"],
  ["POST cue/{id} · cue/next · cue/prev", "Disparar un cue del guion"],
  ["POST loop/play|pause|stop|next|prev", "Loop automático"],
  ["GET status", "JSON con program/preview/estudio/stream/rec/cue actual (feedback)"],
];

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copiado", text))
    .catch(() => toast.error("No se pudo copiar"));
}

/**
 * How to drive this page from a Stream Deck through Bitfocus Companion's
 * Generic HTTP module (or curl). The key is a Better Auth API key with the
 * admin role — mint one on the server, it is shown once.
 */
export function StreamDeckPanel() {
  const [origin, setOrigin] = useState("");
  const [probe, setProbe] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const base = `${origin}/api/obs/`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 text-sm">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            En el servidor:{" "}
            <code className="rounded bg-muted px-1 font-terminal text-xs">
              pnpm owy:key -- --name &quot;stream deck&quot;
            </code>{" "}
            imprime la clave una sola vez.
          </li>
          <li>
            En Companion: <b>Connections → Generic: HTTP</b>, Base URL{" "}
            <button
              className="rounded bg-muted px-1 font-terminal text-xs hover:text-primary"
              type="button"
              onClick={() => copy(base)}
            >
              {base}
            </button>
            .
          </li>
          <li>
            En cada botón: acción <b>POST</b>, URL = la ruta de la tabla, Headers{" "}
            <button
              className="rounded bg-muted px-1 font-terminal text-xs hover:text-primary"
              type="button"
              onClick={() => copy('{"x-api-key":"TU_CLAVE"}')}
            >
              {'{"x-api-key":"TU_CLAVE"}'}
            </button>
            , Body <code className="rounded bg-muted px-1 font-terminal text-xs">{"{}"}</code>. La clave va siempre en
            el header, nunca en la URL (quedaría en los logs).
          </li>
          <li>
            Feedback: un botón con <b>GET status</b> cada 2 s, &quot;JSON response → variable&quot;, y feedbacks por{" "}
            <code className="rounded bg-muted px-1 font-terminal text-xs">$(obs:programScene)</code>,{" "}
            <code className="rounded bg-muted px-1 font-terminal text-xs">streaming</code>,{" "}
            <code className="rounded bg-muted px-1 font-terminal text-xs">currentCue.name</code>.
          </li>
          <li>
            Los comandos responden <b>202</b> cuando esta pestaña (el ejecutor) los va a correr y <b>409</b> si no hay
            ejecutor conectado a OBS — usalo para pintar el botón de rojo.
          </li>
        </ol>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              fetch("/api/obs/status")
                .then((res) => res.json())
                .then((json) => setProbe(JSON.stringify(json, null, 2)))
                .catch((error: Error) => setProbe(error.message))
            }
          >
            Probar GET status con esta sesión
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copy(`curl -X POST -H "x-api-key: TU_CLAVE" ${base}take`)}>
            <Copy className="h-4 w-4" /> curl de ejemplo
          </Button>
        </div>
        {probe && (
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-black/40 p-3 font-terminal text-xs">
            {probe}
          </pre>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {ENDPOINTS.map(([path, description]) => (
            <tr key={path} className="border-b border-border/60">
              <td className="py-1.5 pr-3 align-top font-terminal text-xs">{path}</td>
              <td className="py-1.5 text-muted-foreground">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
