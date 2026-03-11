"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "motion/react";

interface CameraViewProps {
  onCapture: () => void;
  onGalleryImage: (imageData: string) => void;
  error: string | null;
  isCountingDown: boolean;
  children?: ReactNode;
}

export default function CameraView({ onCapture, onGalleryImage, error, isCountingDown, children }: CameraViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onGalleryImage(result);
      };
      reader.readAsDataURL(file);

      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [onGalleryImage]
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [personDetected, setPersonDetected] = useState(false);
  const [hasFaceDetector, setHasFaceDetector] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start camera
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch {
        if (!cancelled) {
          setCameraError("No pudimos acceder a la cámara. Verificá los permisos.");
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Face detection polling
  useEffect(() => {
    if (!isReady || !videoRef.current) return;

    // FaceDetector is Chrome-only experimental API
    if (!("FaceDetector" in window)) {
      setHasFaceDetector(false);
      setPersonDetected(false);
      return;
    }

    setHasFaceDetector(true);
    let animFrame: number;
    let running = true;

    async function detectFaces() {
      if (!running || !videoRef.current) return;

      try {
        // @ts-expect-error -- FaceDetector is not yet in TS lib
        const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await detector.detect(videoRef.current);
        setPersonDetected(faces.length > 0);
      } catch {
        setHasFaceDetector(false);
        setPersonDetected(false);
        return;
      }

      if (running) {
        animFrame = requestAnimationFrame(() => {
          setTimeout(detectFaces, 300);
        });
      }
    }

    detectFaces();

    return () => {
      running = false;
      cancelAnimationFrame(animFrame);
    };
  }, [isReady]);

  // Capture frame from video to canvas
  const captureFrame = useCallback(() => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Mirror the image (front camera is mirrored)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL("image/png");
  }, []);

  // Expose captureFrame via window for CountdownOverlay to use
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__fotoCapture = captureFrame;
    return () => {
      delete (window as unknown as Record<string, unknown>).__fotoCapture;
    };
  }, [captureFrame]);

  if (cameraError) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex h-full w-full flex-col items-center justify-center gap-4 px-6"
      >
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-center">
          <p className="font-pixel text-[8px] leading-relaxed text-red-400">{cameraError}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5 }}
      className="flex h-full w-full flex-col items-center justify-center px-4 py-8"
    >
      {/* Camera viewport */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl">
        {/* Video feed */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-[#050205]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />

          {/* Vignette overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_100px_rgba(0,0,0,0.6)]" />

          {/* Scanning frame corners */}
          <div className="pointer-events-none absolute inset-0 p-6">
            {/* Top-left */}
            <div className={`absolute left-6 top-6 h-10 w-10 border-l-2 border-t-2 transition-colors duration-300 ${personDetected ? "border-[#4dd0e1]" : "border-[#cc7aa3]/40"}`} />
            {/* Top-right */}
            <div className={`absolute right-6 top-6 h-10 w-10 border-r-2 border-t-2 transition-colors duration-300 ${personDetected ? "border-[#4dd0e1]" : "border-[#cc7aa3]/40"}`} />
            {/* Bottom-left */}
            <div className={`absolute bottom-6 left-6 h-10 w-10 border-b-2 border-l-2 transition-colors duration-300 ${personDetected ? "border-[#4dd0e1]" : "border-[#cc7aa3]/40"}`} />
            {/* Bottom-right */}
            <div className={`absolute bottom-6 right-6 h-10 w-10 border-b-2 border-r-2 transition-colors duration-300 ${personDetected ? "border-[#4dd0e1]" : "border-[#cc7aa3]/40"}`} />
          </div>

          {/* Person detection indicator — only shown when FaceDetector API is available */}
          {hasFaceDetector && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-1/2 top-4 -translate-x-1/2"
            >
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-pixel text-[7px] tracking-wider backdrop-blur-md transition-all duration-300 ${
                  personDetected
                    ? "border border-[#4dd0e1]/30 bg-[#4dd0e1]/10 text-[#4dd0e1]"
                    : "border border-[#cc7aa3]/20 bg-[#0a050a]/50 text-[#cc7aa3]"
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    personDetected ? "animate-pulse bg-[#4dd0e1]" : "bg-[#cc7aa3]/40"
                  }`}
                />
                {personDetected ? "PERSONA DETECTADA" : "UBICA TU POSE"}
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#050205]">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#cc7aa3]/20 border-t-[#4dd0e1]" />
                <p className="font-pixel text-[7px] tracking-wider text-[#cc7aa3]/70">CARGANDO CAMARA</p>
              </div>
            </div>
          )}

          {/* Countdown overlay (renders inside the camera view) */}
          {children}
        </div>

        {/* Scanning line animation */}
        {isReady && !isCountingDown && (
          <motion.div
            initial={{ top: "0%" }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="pointer-events-none absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#4dd0e1]/40 to-transparent"
          />
        )}
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2"
        >
          <p className="font-pixel text-[7px] leading-relaxed text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Action buttons */}
      {isReady && !isCountingDown && (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 flex items-end gap-8"
        >
          {/* Spacer to center capture button */}
          <div className="w-16" />

          {/* Capture button */}
          <div className="flex flex-col items-center">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onCapture}
              className="group relative flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-[#4dd0e1]/60 bg-transparent transition-all"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-16 w-16 rounded-full bg-[#4dd0e1]"
              />
            </motion.button>
            <p className="mt-3 text-center font-pixel text-[7px] tracking-wider text-[#cc7aa3]/70">
              TOMAR FOTO
            </p>
          </div>

          {/* Gallery button */}
          <div className="flex flex-col items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#cc7aa3]/30 bg-[#050205]/80 text-[#cc7aa3] transition-all hover:border-[#cc7aa3]/60 hover:text-[#ff9dd9]"
            >
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </motion.button>
            <p className="mt-2 font-pixel text-[7px] tracking-wider text-[#cc7aa3]/70">
              GALERIA
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
