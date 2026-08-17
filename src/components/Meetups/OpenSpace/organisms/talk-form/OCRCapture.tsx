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
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Capturar la tarjeta (OCR)</h3>
        {capturedImage && (
          <Button size="sm" type="button" variant="outline" onClick={onResetOCR}>
            <RotateCcw className="h-3.5 w-3.5" />
            Resetear
          </Button>
        )}
      </div>

      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-md bg-muted/60">
        {cameraActive ? (
          <>
            <video ref={videoRef} autoPlay className="absolute inset-0 h-full w-full object-cover" playsInline />
            {permissionMessage && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-foreground">
                <p>{permissionMessage}</p>
              </div>
            )}
          </>
        ) : capturedImage ? (
          <Image fill alt="Tarjeta capturada" className="object-cover" src={capturedImage} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Camera className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Capturá la tarjeta de la charla</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap gap-2">
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
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/[0.06] p-3 text-center text-sm text-foreground">
          Extrayendo la información y buscando el mejor lugar…
        </div>
      )}

      {ocrError && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-foreground">{ocrError}</p>
        </div>
      )}
    </div>
  );
}
