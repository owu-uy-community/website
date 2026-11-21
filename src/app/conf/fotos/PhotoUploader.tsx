"use client";

import { useEffect, useRef, useState } from "react";

import { JPEG_QUALITY, MAX_SIDE, PHOTOS_PER_PHONE, refuseFile } from "lib/conf-photos";

const ENDPOINT = "/api/conf/fotos";

type Item = {
  key: string;
  name: string;
  preview?: string;
  state: "waiting" | "sending" | "done" | "error";
  error?: string;
};

/**
 * The photo, resized to MAX_SIDE and re-encoded as JPEG: small enough for one request, without
 * the location the camera wrote into it. A video (or anything that isn't an image) never decodes.
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("encode");

    return blob;
  } finally {
    bitmap.close();
  }
}

export default function PhotoUploader() {
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    fetch(ENDPOINT)
      .then((response) => response.json())
      .then((body: { count: number }) => setCount(body.count))
      .catch(() => setCount(0));
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const patch = (key: string, change: Partial<Item>) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

  async function upload(files: File[]) {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
    const batch = files.map((file, i): Item => ({ key: `${Date.now()}-${i}`, name: file.name, state: "waiting" }));
    setItems(batch);
    setBusy(true);
    let uploaded = count ?? 0;

    for (const [i, file] of files.entries()) {
      const { key } = batch[i];
      if (uploaded >= PHOTOS_PER_PHONE) {
        patch(key, { state: "error", error: `Llegaste a las ${PHOTOS_PER_PHONE} fotos` });
        continue;
      }
      const refused = refuseFile(file);
      if (refused) {
        patch(key, { state: "error", error: refused });
        continue;
      }
      patch(key, { state: "sending" });
      let jpeg: Blob;
      try {
        jpeg = await toJpeg(file);
      } catch {
        patch(key, { state: "error", error: "No pudimos leer esta foto" });
        continue;
      }
      const preview = URL.createObjectURL(jpeg);
      previews.current.push(preview);
      patch(key, { preview });
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "image/jpeg" },
          body: jpeg,
        });
        const body = (await response.json()) as { count?: number; error?: string };
        if (typeof body.count === "number") uploaded = body.count;
        setCount(uploaded);
        patch(key, response.ok ? { state: "done" } : { state: "error", error: body.error ?? "No se pudo subir" });
      } catch {
        patch(key, { state: "error", error: "Sin conexión: probá de nuevo" });
      }
    }
    setBusy(false);
  }

  const done = items.filter((item) => item.state === "done").length;
  const full = count !== null && count >= PHOTOS_PER_PHONE;

  return (
    <section className="mt-8">
      <input
        accept="image/*"
        className="sr-only"
        disabled={busy || full}
        id="fotos"
        multiple
        type="file"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void upload(files);
        }}
      />
      <label
        className={`flex min-h-16 w-full items-center justify-center rounded-full px-8 font-display text-lg font-extrabold tracking-wide uppercase transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[#F5BB03] ${
          busy || full
            ? "cursor-not-allowed bg-[#FBF5E7]/15 text-[#FBF5E7]/50"
            : "cursor-pointer bg-[#F5BB03] text-black active:bg-[#FBF5E7]"
        }`}
        htmlFor="fotos"
      >
        {busy ? "Subiendo…" : full ? "Llegaste al máximo" : "Elegir fotos"}
      </label>

      <p
        aria-live="polite"
        className="mt-4 text-center font-display text-sm tracking-[0.12em] text-[#FBF5E7]/70 uppercase"
      >
        {count === null ? " " : `${count} de ${PHOTOS_PER_PHONE} fotos subidas desde este celular`}
        {items.length > 0 && !busy && ` · ${done} de ${items.length} en esta tanda`}
      </p>

      {items.length > 0 && (
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg bg-[#FBF5E7]/10">
              {item.preview && <img alt="" className="h-full w-full object-cover" src={item.preview} />}
              <span
                className={`absolute inset-x-0 bottom-0 px-2 py-1 text-xs leading-tight ${
                  item.state === "error" ? "bg-[#C8102E] text-white" : "bg-black/70 text-[#FBF5E7]"
                }`}
              >
                {item.state === "done"
                  ? "✓ Subida"
                  : item.state === "error"
                    ? item.error
                    : item.state === "sending"
                      ? "Subiendo…"
                      : "En cola"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
