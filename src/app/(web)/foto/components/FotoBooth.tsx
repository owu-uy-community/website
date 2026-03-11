"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { client } from "../../../../lib/orpc/client";
import type { RpgClass } from "../../../../lib/orpc/foto/schemas";
import WelcomeScreen from "./WelcomeScreen";
import CameraView from "./CameraView";
import CountdownOverlay from "./CountdownOverlay";
import ProcessingScreen from "./ProcessingScreen";
import AvatarReveal from "./AvatarReveal";

export type FotoState = "welcome" | "camera" | "countdown" | "processing" | "reveal";

export default function FotoBooth() {
  const [state, setState] = useState<FotoState>("welcome");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [avatarData, setAvatarData] = useState<{ base64: string; mediaType: string } | null>(null);
  const [rpgClass, setRpgClass] = useState<RpgClass>("warrior");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const handleStart = useCallback(() => {
    setState("camera");
    setError(null);
  }, []);

  const handleCapture = useCallback(() => {
    setState("countdown");
  }, []);

  const handleCountdownComplete = useCallback(
    (imageData: string) => {
      setCapturedImage(imageData);
      setState("processing");
      generateAvatar(imageData);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rpgClass]
  );

  const handleGalleryImage = useCallback(
    (imageData: string) => {
      setCapturedImage(imageData);
      setState("processing");
      generateAvatar(imageData);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rpgClass]
  );

  const checkRateLimit = (): boolean => {
    const key = "owu-foto-generations";
    const raw = localStorage.getItem(key);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    let entries: number[] = raw ? JSON.parse(raw) : [];
    entries = entries.filter((t) => now - t < dayMs);

    if (entries.length >= 10) {
      setError("Llegaste al límite de 10 avatares por día. ¡Volvé mañana!");
      setState("camera");
      return false;
    }

    entries.push(now);
    localStorage.setItem(key, JSON.stringify(entries));
    return true;
  };

  const generateAvatar = async (imageData: string) => {
    try {
      setError(null);

      if (!checkRateLimit()) return;

      setStatusMessage("Conectando...");

      // SSE streaming via oRPC event iterator
      const stream = await client.foto.generateAvatar({ imageData, rpgClass });

      console.log("[FotoBooth] stream received:", typeof stream, stream);

      for await (const event of stream) {
        console.log("[FotoBooth] event:", event.status, !!event.avatarBase64);
        setStatusMessage(event.message);

        if (event.status === "complete" && event.avatarBase64 && event.mediaType) {
          setAvatarData({
            base64: event.avatarBase64,
            mediaType: event.mediaType,
          });
          setState("reveal");
          return;
        }

        if (event.status === "error") {
          setError(event.message);
          setState("camera");
          return;
        }
      }

      console.log("[FotoBooth] stream ended without complete event");
    } catch (err) {
      console.error("Avatar generation error:", err);
      setError("No pudimos generar tu avatar. Intentá de nuevo.");
      setState("camera");
    }
  };

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setAvatarData(null);
    setError(null);
    setStatusMessage("");
    setState("camera");
  }, []);

  const handleReset = useCallback(() => {
    setCapturedImage(null);
    setAvatarData(null);
    setError(null);
    setStatusMessage("");
    setState("welcome");
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, #0a050a 50%, #050205 100%)",
      }}
    >
      {/* Star field */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.5) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 70% 40%, rgba(255,255,255,0.2) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 90% 80%, rgba(255,255,255,0.4) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 15% 85%, rgba(255,255,255,0.3) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 45% 45%, rgba(255,255,255,0.2) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 80% 15%, rgba(255,255,255,0.35) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 60% 75%, rgba(255,255,255,0.25) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 25% 35%, rgba(255,255,255,0.4) 0%, transparent 100%)",
        }}
      />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#ff6ec7]/5 blur-[120px]" />

      <AnimatePresence mode="wait">
        {state === "welcome" && (
          <WelcomeScreen
            key="welcome"
            onStart={handleStart}
            rpgClass={rpgClass}
            onClassChange={setRpgClass}
          />
        )}

        {(state === "camera" || state === "countdown") && (
          <CameraView
            key="camera"
            onCapture={handleCapture}
            onGalleryImage={handleGalleryImage}
            error={error}
            isCountingDown={state === "countdown"}
          >
            {state === "countdown" && (
              <CountdownOverlay onComplete={handleCountdownComplete} />
            )}
          </CameraView>
        )}

        {state === "processing" && (
          <ProcessingScreen
            key="processing"
            capturedImage={capturedImage}
            statusMessage={statusMessage}
          />
        )}

        {state === "reveal" && avatarData && (
          <AvatarReveal
            key="reveal"
            avatarBase64={avatarData.base64}
            mediaType={avatarData.mediaType}
            capturedImage={capturedImage}
            onRetake={handleRetake}
            onReset={handleReset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
