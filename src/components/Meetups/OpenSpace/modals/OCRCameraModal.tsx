"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Camera, X, RefreshCw, Check, Loader2, RotateCcw } from "lucide-react";
import Image from "next/image";
import { client } from "lib/orpc";
import { useMutation } from "@tanstack/react-query";
import { cn } from "app/lib/utils";

interface OCRCameraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtractedData?: (data: { title: string; speaker: string }) => void;
  capturedImage: string | null;
  setCapturedImage: (image: string | null) => void;
  result: { title: string; speaker: string } | null;
  setResult: (result: { title: string; speaker: string } | null) => void;
}

export function OCRCameraModal({
  open,
  onOpenChange,
  onExtractedData,
  capturedImage,
  setCapturedImage,
  result,
  setResult,
}: OCRCameraModalProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Process image mutation using oRPC client
  const processImageMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const result = await client.ocr.processImage({ imageData });
      return result;
    },
    onSuccess: (data) => {
      setResult(data);
      if (onExtractedData) {
        onExtractedData(data);
      }
    },
    onError: (error) => {
      console.error("Error processing image:", error);
      alert("Error al procesar la imagen. Por favor intenta nuevamente.");
    },
  });

  // Clean up video stream when modal closes (but preserve captured image and result)
  useEffect(() => {
    if (!open) {
      stopCamera();
      setPermissionMessage(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      // Check if permissions are already granted
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });

        if (permissionStatus.state === "denied") {
          alert(
            "El acceso a la cámara está bloqueado. Por favor habilita el acceso en la configuración de tu navegador."
          );
          return;
        }
      }

      setCameraActive(true);
      setPermissionMessage("Por favor permite el acceso a la cámara cuando se solicite");

      // Request camera access with Full HD resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setPermissionMessage(null);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraActive(false);

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setPermissionMessage("Acceso a la cámara denegado. Por favor permite el acceso e intenta nuevamente.");
        } else if (err.name === "NotFoundError") {
          setPermissionMessage("No se encontró ninguna cámara en tu dispositivo.");
        } else if (err.name === "NotReadableError") {
          setPermissionMessage("La cámara ya está siendo utilizada por otra aplicación.");
        } else {
          setPermissionMessage(
            "No se puede acceder a la cámara. Verifica que tu dispositivo tenga una cámara e intenta nuevamente."
          );
        }
      } else {
        setPermissionMessage("Ocurrió un error inesperado al acceder a la cámara.");
      }
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas dimensions to Full HD (1920x1080)
      canvas.width = 1920;
      canvas.height = 1080;

      // Draw the video frame to the canvas at Full HD
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 1920, 1080);

        const imageData = canvas.toDataURL("image/jpeg", 1.0);
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  };

  const deleteImage = () => {
    setCapturedImage(null);
    setResult(null);
  };

  const retakeImage = () => {
    deleteImage();
    startCamera();
  };

  const handleProcessImage = () => {
    if (capturedImage) {
      processImageMutation.mutate(capturedImage);
    }
  };

  const handleReset = () => {
    stopCamera();
    setCapturedImage(null);
    setResult(null);
    setPermissionMessage(null);
  };

  const handleClose = () => {
    stopCamera();
    onOpenChange(false);
  };

  const handleUseData = () => {
    if (result && onExtractedData) {
      onExtractedData(result);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-900 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-white">Capturar Track</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Toma una foto de la tarjeta del track para extraer automáticamente el título y el orador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Camera/Image Display Area */}
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-800">
            {cameraActive ? (
              <>
                <video ref={videoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />
                {permissionMessage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 p-4 text-center text-white">
                    <p>{permissionMessage}</p>
                  </div>
                )}
              </>
            ) : capturedImage ? (
              <Image src={capturedImage} alt="Captured track card" fill className="object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Camera className="h-12 w-12 text-zinc-500" />
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="flex w-full flex-wrap justify-center gap-2">
            {!cameraActive && !capturedImage && (
              <Button onClick={startCamera} className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500">
                <Camera className="mr-2 h-4 w-4" /> Iniciar Cámara
              </Button>
            )}

            {cameraActive && (
              <Button onClick={captureImage} className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500">
                <Check className="mr-2 h-4 w-4" /> Capturar
              </Button>
            )}

            {capturedImage && (
              <>
                <Button
                  variant="outline"
                  onClick={deleteImage}
                  className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
                >
                  <X className="mr-2 h-4 w-4" /> Eliminar
                </Button>
                <Button
                  variant="outline"
                  onClick={retakeImage}
                  className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
                </Button>
                <Button
                  onClick={handleProcessImage}
                  disabled={processImageMutation.isPending}
                  className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500"
                >
                  {processImageMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Procesar
                </Button>
              </>
            )}
          </div>

          {/* Results Display */}
          {result && (
            <div className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-4">
              <h3 className="mb-2 font-medium text-white">Información Extraída:</h3>
              <div className="space-y-2 text-sm text-zinc-300">
                <div>
                  <span className="font-semibold text-yellow-400">Título:</span> {result.title || "N/A"}
                </div>
                <div>
                  <span className="font-semibold text-yellow-400">Orador:</span> {result.speaker || "N/A"}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={handleReset}
            className="border-zinc-700 text-white hover:bg-zinc-800"
            disabled={!capturedImage && !result}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar
          </Button>
          <div className="flex gap-2">
            {result && (
              <Button onClick={handleUseData} className="bg-yellow-400 text-black hover:bg-yellow-500">
                <Check className="mr-2 h-4 w-4" />
                Usar Datos
              </Button>
            )}
            <Button variant="outline" onClick={handleClose} className="border-zinc-700 text-white hover:bg-zinc-800">
              Cerrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
