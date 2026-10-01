"use client";

import type { RefObject } from "react";
import { AlertTriangle, Camera, Check, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import Image from "next/image";

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
    <div className="border-border bg-muted/30 rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-foreground text-sm font-semibold">Capturar la tarjeta (OCR)</h3>
        {capturedImage && (
          <Button size="sm" type="button" variant="outline" onClick={onResetOCR}>
            <RotateCcw className="h-3.5 w-3.5" />
            Resetear
          </Button>
        )}
      </div>

      <div className="bg-muted/60 relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-md">
        {cameraActive ? (
          <>
            <video ref={videoRef} autoPlay className="absolute inset-0 h-full w-full object-cover" playsInline />
            {/* The whole frame is what gets sent, so the guide is only framing advice: a card
                that fills it is sharp enough to read. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[5%] rounded-sm border-2 border-dashed border-white/70"
            />
            <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white drop-shadow">
              Encuadrá la tarjeta dentro del marco
            </p>
            {permissionMessage && (
              <div className="text-foreground absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm">
                <p>{permissionMessage}</p>
              </div>
            )}
          </>
        ) : capturedImage ? (
          <Image fill alt="Tarjeta capturada" className="object-cover" src={capturedImage} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Camera className="text-muted-foreground/60 h-10 w-10" />
            <p className="text-muted-foreground text-sm">Capturá la tarjeta de la charla</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>button]:h-11 sm:[&>button]:h-10">
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

      {isProcessingImage && (
        <div className="border-primary/30 bg-primary/[0.06] text-foreground mt-3 rounded-md border p-3 text-center text-sm">
          Leyendo la tarjeta…
        </div>
      )}

      {ocrError && (
        <div className="border-destructive/40 bg-destructive/10 mt-3 flex items-start gap-2 rounded-md border px-3 py-2">
          <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-foreground text-sm">{ocrError}</p>
        </div>
      )}
    </div>
  );
}
