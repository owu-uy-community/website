"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "components/shared/ui/card";
import { Camera, X, RefreshCw, Check } from "lucide-react";
import Image from "next/image";
import { processImage } from "app/lib/images/process-image";
import Starfield from "react-starfield";
import Navbar from "components/shared/Navbar";
import Footer from "components/shared/Footer";

export default function Home() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ title: string; speaker: string } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      // Clean up video stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
      }
      setPermissionMessage(null);
    };
  }, []);

  const startCamera = async () => {
    try {
      // First check if permissions are already granted
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });

        if (permissionStatus.state === "denied") {
          alert("Camera access is blocked. Please enable camera access in your browser settings and try again.");
          return;
        }
      }

      // Show a message to the user before requesting permission
      setCameraActive(true);
      setPermissionMessage("Please allow camera access when prompted");

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setPermissionMessage(null);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraActive(false);

      // Provide more specific error messages based on the error
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setPermissionMessage("Camera access was denied. Please allow camera access and try again.");
        } else if (err.name === "NotFoundError") {
          setPermissionMessage("No camera found on your device.");
        } else if (err.name === "NotReadableError") {
          setPermissionMessage("Camera is already in use by another application.");
        } else {
          setPermissionMessage("Unable to access camera. Please ensure your device has a camera and try again.");
        }
      } else {
        setPermissionMessage("An unexpected error occurred while accessing the camera.");
      }
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas dimensions to match video (square aspect ratio)
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;

      // Calculate offset to center the crop
      const xOffset = (video.videoWidth - size) / 2;
      const yOffset = (video.videoHeight - size) / 2;

      // Draw the video frame to the canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          video,
          xOffset,
          yOffset,
          size,
          size, // Source rectangle
          0,
          0,
          size,
          size // Destination rectangle
        );

        // Convert canvas to data URL
        const imageData = canvas.toDataURL("image/jpeg");
        setCapturedImage(imageData);

        // Stop the camera stream
        const stream = video.srcObject as MediaStream;
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());

        setCameraActive(false);
        setPermissionMessage(null);
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

  const handleProcessImage = async () => {
    if (!capturedImage) return;

    setIsProcessing(true);
    try {
      const extractedData = await processImage(capturedImage);
      setResult(extractedData);
    } catch (error) {
      console.error("Error processing image:", error);
      alert("Failed to process the image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="flex min-h-screen flex-1 flex-col bg-black">
      <div className="container flex w-full flex-1 flex-col items-center">
        <Navbar />
        <Starfield speedFactor={0.05} starColor={[255, 255, 255]} starCount={1000} />
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <Card className="mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle></CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-md bg-gray-200">
                {cameraActive ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {permissionMessage && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 p-4 text-center text-white">
                        <p>{permissionMessage}</p>
                      </div>
                    )}
                  </>
                ) : capturedImage ? (
                  <Image src={capturedImage || "/placeholder.svg"} alt="Captured sign" fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Camera className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden" />

              {/* Controls */}
              <div className="flex w-full justify-center gap-4">
                {!cameraActive && !capturedImage && (
                  <Button onClick={startCamera} className="flex-1">
                    <Camera className="mr-2 h-4 w-4" /> Capturar Track
                  </Button>
                )}

                {cameraActive && (
                  <Button onClick={captureImage} className="flex-1">
                    <Check className="mr-2 h-4 w-4" /> Capturar
                  </Button>
                )}

                {capturedImage && (
                  <>
                    <Button variant="outline" onClick={deleteImage} className="flex-1">
                      <X className="mr-2 h-4 w-4" /> Eliminar
                    </Button>
                    <Button variant="outline" onClick={retakeImage} className="flex-1">
                      <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
                    </Button>
                    <Button onClick={handleProcessImage} disabled={isProcessing} className="flex-1">
                      {isProcessing ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Procesar
                    </Button>
                  </>
                )}
              </div>

              {result && (
                <div className="mt-6 w-full">
                  <h3 className="mb-2 font-medium">Información extraída:</h3>
                  <div className="overflow-x-auto rounded-md bg-gray-100 p-4 font-mono text-sm">
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-center text-center text-xs text-gray-500">
              <p>Extrae automáticamente el título y la información del orador del track.</p>
            </CardFooter>
          </Card>
        </div>
        <Footer />
      </div>
    </section>
  );
}
