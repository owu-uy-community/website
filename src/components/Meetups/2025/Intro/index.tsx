"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, ZoomIn, ChevronLeft, ChevronRight } from "lucide-react";

export default function IntroSection() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const images = [
    "/static/2025/intro/1.webp",
    "/static/2025/intro/2.webp",
    "/static/2025/intro/3.webp",
    "/static/2025/intro/4.webp",
    "/static/2025/intro/5.webp",
    "/static/2025/intro/6.webp",
    "/static/2025/intro/7.webp",
    "/static/2025/intro/8.webp",
    "/static/2025/intro/9.webp",
  ];

  // Auto-rotate images only when not hovering
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (!isHovering) {
      interval = setInterval(() => {
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
      }, 6000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isHovering, images.length]);

  // Handle hover end
  const handleImageLeave = () => {
    setIsHovering(false);
  };

  // Navigate to previous image
  const goToPreviousImage = () => {
    const currentIndex = images.findIndex((img) => img === fullscreenImage);
    const previousIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    setFullscreenImage(images[previousIndex]);
  };

  // Navigate to next image
  const goToNextImage = () => {
    const currentIndex = images.findIndex((img) => img === fullscreenImage);
    const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    setFullscreenImage(images[nextIndex]);
  };

  // Handle keyboard events for fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!fullscreenImage) return;

      switch (event.key) {
        case "Escape":
          setFullscreenImage(null);
          break;
        case "ArrowLeft":
          event.preventDefault();
          goToPreviousImage();
          break;
        case "ArrowRight":
          event.preventDefault();
          goToNextImage();
          break;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!fullscreenImage) return;

      event.preventDefault();

      // Horizontal scroll or shift+vertical scroll
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
        if (event.deltaX > 0 || (event.shiftKey && event.deltaY > 0)) {
          goToNextImage();
        } else if (event.deltaX < 0 || (event.shiftKey && event.deltaY < 0)) {
          goToPreviousImage();
        }
      }
    };

    if (fullscreenImage) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("wheel", handleWheel, { passive: false });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("wheel", handleWheel);
      document.body.style.overflow = "unset";
    };
  }, [fullscreenImage, images]);

  const openFullscreen = (imageUrl: string) => {
    setFullscreenImage(imageUrl);
  };

  const closeFullscreen = () => {
    setFullscreenImage(null);
  };

  return (
    <>
      <section className="mt-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Content */}
            <div>
              <h2 className="mb-8 text-center text-4xl font-bold text-white md:text-5xl lg:text-left">
                ¿Qué es La Meetup?
              </h2>
              <p className="mb-8 text-base leading-relaxed text-gray-300 lg:text-lg">
                Es el punto de encuentro para profesionales, estudiantes y entusiastas de la tecnología de todo el país.
                Es una gran oportunidad para intercambiar ideas, compartir experiencias y construir relaciones que
                fomenten el crecimiento y la unidad dentro de la comunidad tecnológica uruguaya.
              </p>

              {/* Features */}
              <div className="grid gap-10 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
                    <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-white">Networking</h3>
                    <p className="text-sm text-gray-400">Conecta con profesionales de toda la industria</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
                    <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-white">Conocimiento</h3>
                    <p className="text-sm text-gray-400">Aprende sobre las últimas tecnologías</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
                    <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-white">Innovación</h3>
                    <p className="text-sm text-gray-400">Descubre nuevas ideas y enfoques</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
                    <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-white">Comunidad</h3>
                    <p className="text-sm text-gray-400">Forma parte del ecosistema tech uruguayo</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Photo Gallery - Fixed Layout */}
            <div className="relative" onMouseLeave={handleImageLeave}>
              <div className="grid h-[500px] grid-cols-3 grid-rows-3 gap-3">
                {images.map((imageUrl, idx) => {
                  const isActive = idx === currentImageIndex;
                  const isAdjacent =
                    idx === (currentImageIndex + 1) % images.length ||
                    idx === (currentImageIndex - 1 + images.length) % images.length;

                  // Define specific positions for each image to ensure all are always visible
                  const getGridPosition = (index: number, activeIndex: number) => {
                    if (index === activeIndex) {
                      // Active image takes 2x2 space in top-left area
                      return "col-span-2 row-span-2 col-start-1 row-start-1";
                    }

                    // Position other images around the active one
                    const positions = [
                      "col-start-3 row-start-1", // top right
                      "col-start-4 row-start-1", // top far right
                      "col-start-3 row-start-2", // middle right
                      "col-start-4 row-start-2", // middle far right
                      "col-start-1 row-start-3", // bottom left
                      "col-start-2 row-start-3", // bottom center-left
                      "col-start-3 row-start-3", // bottom center-right
                      "col-start-4 row-start-3", // bottom right
                      "col-start-1 row-start-4", // bottom row left
                      "col-start-2 row-start-4", // bottom row center-left
                      "col-start-3 row-start-4", // bottom row center-right
                      "col-start-4 row-start-4", // bottom row right
                    ];

                    // Get position index, skipping the active image
                    const positionIndex = index > activeIndex ? index - 1 : index;
                    return positions[positionIndex] || positions[0];
                  };

                  return (
                    <div
                      key={idx}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl transition-all duration-700 ease-in-out ${getGridPosition(
                        idx,
                        currentImageIndex
                      )} ${
                        isActive
                          ? "z-10 shadow-2xl ring-2 ring-yellow-400/50"
                          : isAdjacent
                            ? "scale-100 opacity-90"
                            : "scale-95 opacity-60"
                      }`}
                      onClick={() => openFullscreen(imageUrl)}
                      onMouseEnter={() => setIsHovering(true)}
                    >
                      <Image
                        src={imageUrl || "/placeholder.svg"}
                        alt={`La Meetup momento ${idx + 1}`}
                        fill
                        className={`object-cover transition-transform duration-700 ${
                          isActive ? "scale-110" : "scale-100 group-hover:scale-105"
                        }`}
                        crossOrigin="anonymous"
                      />

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 group-hover:bg-black/20">
                        <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                            <ZoomIn className="h-4 w-4 text-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation dots */}
              <div className="mt-6 flex justify-center gap-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${
                      idx === currentImageIndex ? "w-8 bg-yellow-400" : "bg-gray-600 hover:bg-gray-500"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fullscreen Modal */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 pt-[56px] backdrop-blur-sm"
          onClick={closeFullscreen}
        >
          <div className="relative flex h-[calc(100dvh-56px)] w-full max-w-7xl items-center justify-center">
            {/* Left Arrow */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPreviousImage();
              }}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Right Arrow */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNextImage();
              }}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {/* Image */}
            <div
              className="relative flex h-full w-full items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={fullscreenImage || "/placeholder.svg"}
                alt="La Meetup fullscreen"
                fill
                className="object-contain"
                crossOrigin="anonymous"
                priority
              />
            </div>

            {/* Image counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {images.findIndex((img) => img === fullscreenImage) + 1} / {images.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
