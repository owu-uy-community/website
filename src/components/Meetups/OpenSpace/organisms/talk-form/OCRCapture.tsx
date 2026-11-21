"use client";

import type { RefObject } from "react";
import { Camera, Check, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import Image from "next/image";

import { Notice } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";

interface OCRCaptureProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  capturedImage: string | null;
  permissionMessage: string | null;
  ocrError: string | null;
  isProcessingImage: boolean;
  onStartCamera: () => void;
  onCaptureImage: () => void;
  onProcessImage: () => void;
  onResetOCR: () => void;
  onRetakeImage: () => void;
}

export function OCRCapture({
  videoRef,
  canvasRef,
  cameraActive,
  capturedImage,
  permissionMessage,
  ocrError,
  isProcessingImage,
  onStartCamera,
  onCaptureImage,
  onProcessImage,
  onResetOCR,
  onRetakeImage,
}: OCRCaptureProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ui font-semibold text-foreground">Foto de la tarjeta</h3>
        {capturedImage && (
          <Button size="sm" type="button" variant="outline" onClick={onResetOCR}>
            <RotateCcw />
            Resetear
          </Button>
        )}
      </div>

      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-md bg-background">
        {cameraActive ? (
          <>
            <video ref={videoRef} autoPlay className="absolute inset-0 h-full w-full object-cover" playsInline />
            {/* The whole frame is what gets sent, so the guide is only framing advice: a card
                that fills it is sharp enough to read. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[5%] rounded-sm border-2 border-dashed border-white/70"
            />
            <p className="absolute inset-x-0 bottom-2 text-center text-meta text-white drop-shadow">
              Encuadrá la tarjeta dentro del marco
            </p>
            {permissionMessage && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-ui text-foreground">
                <p>{permissionMessage}</p>
              </div>
            )}
          </>
        ) : capturedImage ? (
          <Image fill alt="Tarjeta capturada" className="object-cover" src={capturedImage} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Camera aria-hidden className="size-10 text-muted-foreground/60" />
            <p className="text-ui text-muted-foreground">
              Sacale una foto a la tarjeta: la IA la lee y sugiere el lugar.
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap pointer-coarse:[&>button]:h-11">
        {!cameraActive && !capturedImage && (
          <Button className="flex-1" type="button" onClick={onStartCamera}>
            <Camera />
            Iniciar cámara
          </Button>
        )}

        {cameraActive && (
          <Button className="flex-1" type="button" onClick={onCaptureImage}>
            <Check />
            Capturar
          </Button>
        )}

        {capturedImage && (
          <>
            <Button className="flex-1" disabled={isProcessingImage} type="button" onClick={onProcessImage}>
              {isProcessingImage ? <Loader2 className="animate-spin" /> : <Check />}
              {isProcessingImage ? "Procesando…" : "Extraer datos"}
            </Button>
            <Button disabled={isProcessingImage} type="button" variant="outline" onClick={onRetakeImage}>
              <RefreshCw />
              Retomar
            </Button>
          </>
        )}
      </div>

      <div className="mt-3 space-y-2 empty:hidden">
        {/* Over the video while the camera asks; down here once it couldn't start. */}
        <Notice show={!cameraActive && Boolean(permissionMessage)} tone="danger">
          {permissionMessage}
        </Notice>
        <Notice show={isProcessingImage} tone="info">
          Leyendo la tarjeta…
        </Notice>
        <Notice show={Boolean(ocrError)} tone="danger">
          {ocrError}
        </Notice>
      </div>
    </div>
  );
}
