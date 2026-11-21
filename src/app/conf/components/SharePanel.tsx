"use client";

import classNames from "classnames";
import { Check, Download, Link2, Share2, X } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { FaFacebook, FaLinkedin, FaWhatsapp, FaXTwitter } from "react-icons/fa6";

import {
  SHARE_DESIGNS,
  SHARE_DISCLAIMER,
  SHARE_FORMATS,
  shareImagePath,
  sharePageUrl,
  shareText,
  type ShareDesign,
  type ShareFormat,
} from "../share";

const DESIGNS = Object.entries(SHARE_DESIGNS) as [ShareDesign, (typeof SHARE_DESIGNS)[ShareDesign]][];
const FORMATS = Object.entries(SHARE_FORMATS) as [ShareFormat, (typeof SHARE_FORMATS)[ShareFormat]][];

const chip = (active: boolean) =>
  classNames(
    "inline-flex h-10 items-center gap-2 rounded-full border-2 px-4 font-display text-sm font-bold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
    active ? "border-[#F5BB03] bg-[#F5BB03] text-black" : "border-[#FBF5E7]/20 text-[#FBF5E7] hover:border-[#FBF5E7]/60"
  );
const action =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#FBF5E7]/25 font-display text-sm font-bold uppercase text-[#FBF5E7] transition-colors hover:border-[#F5BB03] hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]";

async function imageFile(src: string, filename: string) {
  const blob = await (await fetch(src)).blob();

  return new File([blob], filename, { type: "image/png" });
}

type SharePanelProps = {
  dialog: RefObject<HTMLDialogElement | null>;
  name: string;
};

/* Share images of the visitor's badge: pick a message and a size, download or post it */
export default function SharePanel({ dialog, name }: SharePanelProps) {
  const [design, setDesign] = useState<ShareDesign>("voy");
  const [format, setFormat] = useState<ShareFormat>("link");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const src = shareImagePath(design, format, name.trim());
  const page = sharePageUrl(design, name.trim());
  const text = shareText(design);
  const filename = `owu-conf-2026-${design}-${format}.png`;
  const { width, height } = SHARE_FORMATS[format];

  // Phones can hand the image itself to Instagram, WhatsApp & co. (no web link for Instagram stories)
  useEffect(() => {
    const probe = new File([""], "probe.png", { type: "image/png" });
    setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await imageFile(src, filename));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  };

  const shareNative = async () => {
    setBusy(true);
    try {
      await navigator.share({ files: [await imageFile(src, filename)], text: `${text} ${page}` });
    } catch {
      // Dismissed share sheet
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(page);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const platforms = [
    {
      label: "LinkedIn",
      Icon: FaLinkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(page)}`,
    },
    {
      label: "X",
      Icon: FaXTwitter,
      href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(page)}`,
    },
    {
      label: "Facebook",
      Icon: FaFacebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(page)}`,
    },
    { label: "WhatsApp", Icon: FaWhatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${page}`)}` },
  ];

  return (
    <dialog
      ref={dialog}
      aria-labelledby="share-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(1040px,calc(100vw-2rem))] overflow-y-auto border-2 border-[#FBF5E7]/15 bg-black p-0 text-[#FBF5E7] [color-scheme:dark] backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      // A click on the backdrop lands on the dialog itself
      onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
    >
      <div className="grid gap-8 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[260px] items-center justify-center bg-[#0B0B0B] p-3 md:max-h-[calc(100dvh-8rem)]">
          <img
            key={src}
            alt={`${SHARE_DESIGNS[design].text} — vista previa, ${width}×${height}`}
            className="max-h-[60dvh] w-auto max-w-full object-contain md:max-h-[calc(100dvh-10rem)]"
            height={height}
            src={src}
            width={width}
          />
        </div>

        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl leading-none font-extrabold uppercase" id="share-title">
              Compartí tu credencial
            </h2>
            <button
              aria-label="Cerrar"
              className="-mt-1 -mr-1 rounded-full p-1 text-[#FBF5E7]/70 hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F5BB03]"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" className="h-6 w-6" />
            </button>
          </div>
          {!name.trim() && (
            <p className="mt-3 text-sm text-[#F5BB03]">Escribí tu nombre en la credencial para personalizarla.</p>
          )}

          <p className="mt-6 font-display text-xs font-semibold tracking-[0.18em] text-[#FBF5E7]/60 uppercase">
            Mensaje
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DESIGNS.map(([id, { label }]) => (
              <button
                key={id}
                aria-pressed={design === id}
                className={chip(design === id)}
                onClick={() => setDesign(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-5 font-display text-xs font-semibold tracking-[0.18em] text-[#FBF5E7]/60 uppercase">
            Formato
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORMATS.map(([id, { label, hint }]) => (
              <button
                key={id}
                aria-pressed={format === id}
                className={chip(format === id)}
                onClick={() => setFormat(id)}
                type="button"
              >
                {label} <span className="font-medium opacity-70">{hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className={`${action} px-4`} disabled={busy} onClick={() => void download()} type="button">
              <Download aria-hidden="true" className="h-4 w-4" /> Descargar
            </button>
            {canShareFiles && (
              <button className={`${action} px-4`} disabled={busy} onClick={() => void shareNative()} type="button">
                <Share2 aria-hidden="true" className="h-4 w-4" /> Compartir
              </button>
            )}
            <button className={`${action} px-4`} onClick={() => void copy()} type="button">
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Link2 aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? "¡Copiado!" : "Copiar link"}
            </button>
          </div>

          <p className="mt-5 font-display text-xs font-semibold tracking-[0.18em] text-[#FBF5E7]/60 uppercase">
            Publicar en
          </p>
          <div className="mt-2 flex gap-2">
            {platforms.map(({ label, Icon, href }) => (
              <a
                key={label}
                aria-label={`Publicar en ${label}`}
                className={`${action} w-11`}
                href={href}
                rel="noopener"
                target="_blank"
                title={label}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
              </a>
            ))}
          </div>
          <p className="mt-3 text-sm text-[#FBF5E7]/60">
            Los links muestran tu credencial como vista previa. Para Instagram, descargá el post o la historia y subila
            desde la app.
          </p>

          <p className="mt-6 flex items-start gap-2 border-l-4 border-[#F5BB03] bg-[#F5BB03]/10 px-3 py-2 text-sm text-[#FBF5E7]">
            <span aria-hidden="true" className="font-display font-extrabold text-[#F5BB03]">
              !
            </span>
            {SHARE_DISCLAIMER}
          </p>
        </div>
      </div>
    </dialog>
  );
}
