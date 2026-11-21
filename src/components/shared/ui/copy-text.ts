import { toast } from "./toast-utils";

/** Copy and say so. When the browser refuses (permissions, an http page), say how to copy by hand. */
export async function copyText(text: string, done = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error("No se pudo copiar", "Seleccioná el texto y copialo a mano.");
    return false;
  }
}
