"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Cast, Sparkles } from "lucide-react";
import { supabase } from "app/lib/supabase";
import type { StickyNote } from "../../../../lib/orpc";
import { DEFAULT_OPENSPACE_ID } from "../../../../components/Meetups/OpenSpace/utils/constants";

interface OpenSpaceRealtimeEvent {
  type: "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";
  payload: {
    openSpaceId: string;
    cardId?: string;
    cardIds?: [string, string]; // For swaps
    updatedCard?: StickyNote;
    timestamp: string;
    sessionId: string; // To prevent echo from same session
  };
}

const motivationalPhrases = [
  "Bo, se viene un track que va a estar de más 🚀",
  "Dale que ya deployeamos el conocimiento 💻",
  "¡Preparate que este código va a estar bárbaro! 🎯",
  "Ta, arrancamos con el refactor más groso 💪",
  "¡Bo, este sprint va a estar tremendo! ⚡",
  "Dale nomás que el merge está llegando 🔀",
  "¡Che, se viene algo que va a romper el repo! 🔥",
  "Bo, preparate que este commit va en serio 📦",
  "¡Dale que ya pusheamos la innovación! 🚢",
  "Ta bueno, se viene el debugging de la vida 🐛",
  "¡Bo, este stack va a estar de locos! 🥞",
  "Dale que ya compilamos la diversión 🎪",
  "¡Che, preparate que esto va a escalar bárbaro! 📈",
  "Bo, se armó el deploy más zarpado 🌟",
  "¡Dale que esta API va a estar fenómeno! 🔗",
  "Ta, este framework va a estar mortal 💀",
  "¡Bo, preparate que el release va posta! 🎉",
  "Dale que ya instalamos las ganas 📦",
  "¡Che, este microservicio va a estar brutal! ⚙️",
  "Bo, se viene el pull request del siglo 📝",
  "¡Dale que ya configuramos el éxito! ⚡",
  "Ta bueno, este algoritmo va a volar 🛸",
  "¡Bo, preparate que el testing va en serio! 🧪",
  "Dale que ya buildamos la expectativa 🏗️",
  "¡Che, esta arquitectura va a estar de lujo! 🏛️",
  "Bo, se viene el hotfix más esperado 🔧",
  "¡Dale que ya optimizamos la emoción! 🚀",
  "Ta, este pipeline va a estar tremendo 🔄",
  "¡Bo, preparate que el standup arranca ya! 📢",
  "Dale que ya sincronizamos las mentes 🧠",
  "¡Che, este container va a estar genial! 🐳",
  "Bo, se armó el middleware más groso 🔗",
  "¡Dale que ya versionamos la diversión! 📊",
  "Ta bueno, este endpoint va a romper todo 💥",
  "¡Bo, preparate que el CI/CD está listo! ⚙️",
  "Dale que ya dockerizamos el conocimiento 🐋",
  "¡Che, esta función va a estar bárbara! ⚡",
  "Bo, se viene el rollback más épico 🔄",
  "¡Dale que ya migramos a la felicidad! 📤",
  "Ta, este JSON va a estar perfecto 📋",
  "¡Bo, preparate que el logging arranca! 📊",
  "Dale que ya validamos la experiencia ✅",
  "¡Che, este hash va a estar zarpado! #️⃣",
  "Bo, se armó la lambda más grosa ⚡",
  "¡Dale que ya cacheamos la diversión! 💾",
  "Ta bueno, este thread va a volar 🧵",
  "¡Bo, preparate que el parsing va posta! 🔍",
  "Dale que ya encriptamos el show 🔐",
  "¡Che, esta query va a estar mortal! 🔍",
  "Bo, se viene el backup del año 💾",
  "¡Dale que ya linkeamos las ganas! 🔗",
  "Ta, este timeout va a estar perfecto ⏰",
  "¡Bo, preparate que el debugging despega! 🐛",
  "Dale que ya compilamos la pasión 💻",
  "¡Che, este script va a estar brutal! 📜",
  "Bo, se armó el refactoring más épico 🔧",
  "¡Dale que ya pusheamos la innovación! ⬆️",
  "Ta bueno, este localhost va a estar genial 🏠",
  "¡Bo, preparate que el fork está listo! 🍴",
  "Dale que ya clonamos la diversión 👯",
  "¡Che, esta branch va a estar tremenda! 🌿",
  "Bo, se viene el switch más zarpado 🔀",
  "¡Dale que ya linteamos la calidad! ✨",
  "Ta, este namespace va a romper todo 📦",
  "¡Bo, preparate que el sudo arranca ya! 👑",
  "Dale que ya instalamos las expectativas 📥",
  "¡Che, este token va a estar bárbaro! 🎫",
  "Bo, se armó el webhook más groso 🪝",
  "¡Dale que ya serializamos la emoción! 📦",
  "Ta bueno, este buffer va a estar mortal 💾",
  "¡Bo, preparate que el async va posta! ⏳",
  "Dale que ya sincronizamos el futuro 🔄",
  "¡Che, este promise va a estar genial! 🤝",
  "Bo, se viene el callback del siglo 📞",
  "¡Dale que ya resolvimos la diversión! ✅",
  "Ta, este event loop va a volar 🔄",
  "¡Bo, preparate que el closure arranca! 🔒",
  "Dale que ya importamos las ganas 📦",
  "¡Che, este module va a estar tremendo! 📦",
  "Bo, se armó el package más zarpado 📦",
  "¡Dale que ya exportamos la calidad! 📤",
  "Ta bueno, este require va a estar épico 📋",
  "¡Bo, preparate que el npm install despega! 📦",
  "Dale que ya bundleamos la experiencia 📦",
  "¡Che, este webpack va a estar brutal! 📦",
  "Bo, se viene el transpile más esperado 🔄",
  "¡Dale que ya minificamos la espera! 🗜️",
  "Ta, este polyfill va a romper todo 🔧",
  "¡Bo, preparate que el babel arranca ya! 🗼",
  "Dale que ya configuramos el eslint 📏",
  "¡Che, este prettier va a estar bárbaro! ✨",
  "Bo, se armó el git flow más groso 🌊",
  "¡Dale que ya commiteamos la diversión! 💾",
  "Ta bueno, este cherry-pick va a estar genial 🍒",
  "¡Bo, preparate que el rebase va posta! 📐",
  "Dale que ya mergeamos las expectativas 🔀",
  "¡Che, este stash va a estar mortal! 📥",
  "Bo, se viene el bisect más épico 🔍",
  "¡Dale que ya tagueamos el momento! 🏷️",
  "Ta, este blame va a estar tremendo 👀",
  "¡Bo, preparate que el log arranca ya! 📊",
  "Dale que ya diffeamos la realidad 📊",
  "¡Che, este status va a estar zarpado! 📈",
  "Bo, se armó el fetch más esperado 📡",
  "¡Dale que ya pusheamos al origin! 🎯",
  "Ta bueno, este upstream va a volar ⬆️",
  "¡Bo, preparate que el remote despega! 🌐",
];

export default function StickyNoteDisplay() {
  const [selectedNote, setSelectedNote] = useState<StickyNote | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);

  useEffect(() => {
    // Subscribe to highlighted note changes via Supabase
    const highlightedChannel = supabase
      .channel("highlighted-note")
      .on("broadcast", { event: "note_highlighted" }, (payload: { payload: { note: StickyNote | null } }) => {
        console.log("📢 Note highlighted:", payload.payload.note);

        // Show casting animation when a new note is cast
        if (payload.payload.note) {
          setIsCasting(true);
          setSelectedNote(payload.payload.note);

          // Remove the casting indicator after animation
          setTimeout(() => {
            setIsCasting(false);
          }, 1000);
        } else {
          // No animation when clearing the screen
          setSelectedNote(null);
          setIsCasting(false);
        }
      })
      .subscribe();

    // Subscribe to real-time card updates for the currently displayed card
    const cardUpdatesChannel = supabase
      .channel(`openspace:${DEFAULT_OPENSPACE_ID}`)
      .on("broadcast", { event: "card_change" }, (payload: { payload: OpenSpaceRealtimeEvent }) => {
        const event = payload.payload;

        // Only handle CARD_UPDATE events
        if (event.type === "CARD_UPDATE" && event.payload.updatedCard && selectedNote) {
          // Check if the updated card is the one currently being displayed
          if (event.payload.cardId === selectedNote.id) {
            console.log("🔄 Updating displayed card with new content:", event.payload.updatedCard);

            // Show visual feedback for the update
            setIsUpdating(true);
            setSelectedNote(event.payload.updatedCard);

            // Remove the update indicator after animation
            setTimeout(() => {
              setIsUpdating(false);
            }, 1000);
          }
        }
      })
      .subscribe();

    // Fetch initial highlighted note if any
    const fetchHighlightedNote = async () => {
      const { data } = await supabase.from("highlighted_note").select("*").eq("id", 1).single();

      if (data && data.note_data) {
        setSelectedNote(JSON.parse(data.note_data));
      }
    };

    fetchHighlightedNote();

    return () => {
      supabase.removeChannel(highlightedChannel);
      supabase.removeChannel(cardUpdatesChannel);
    };
  }, [selectedNote?.id]); // Re-subscribe when the selected note changes

  // Rotate motivational phrases
  useEffect(() => {
    if (!selectedNote) {
      const interval = setInterval(() => {
        setCurrentPhraseIndex((prevIndex) => (prevIndex + 1) % motivationalPhrases.length);
      }, 3000); // Change phrase every 3 seconds

      return () => clearInterval(interval);
    }
  }, [selectedNote]);

  return (
    <>
      <style jsx>{`
        @keyframes smoothZoom {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }
      `}</style>
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-green-500">
        {/* Animated Sparkles - Only when waiting */}
        {!selectedNote && (
          <>
            <Sparkles className="absolute left-20 top-20 h-8 w-8 animate-pulse text-yellow-300" />
            <Sparkles
              className="absolute right-32 top-32 h-6 w-6 animate-bounce text-yellow-200"
              style={{ animationDelay: "0.5s" }}
            />
            <Sparkles
              className="absolute bottom-40 left-40 h-7 w-7 animate-pulse text-yellow-400"
              style={{ animationDelay: "1s" }}
            />
            <Sparkles
              className="absolute bottom-20 right-20 h-5 w-5 animate-bounce text-yellow-300"
              style={{ animationDelay: "1.5s" }}
            />
            <Sparkles
              className="absolute left-20 top-1/2 h-6 w-6 animate-pulse text-yellow-200"
              style={{ animationDelay: "2s" }}
            />
            <Sparkles
              className="absolute right-20 top-1/2 h-8 w-8 animate-bounce text-yellow-400"
              style={{ animationDelay: "2.5s" }}
            />
            <Sparkles
              className="absolute left-1/2 top-16 h-5 w-5 animate-pulse text-yellow-300"
              style={{ animationDelay: "0.8s" }}
            />
            <Sparkles
              className="absolute bottom-16 left-1/2 h-7 w-7 animate-bounce text-yellow-200"
              style={{ animationDelay: "1.8s" }}
            />
          </>
        )}

        {/* Large Sticky Note - Centered */}
        <div
          className="relative"
          style={{
            transform: "rotate(-8deg)",
            transformOrigin: "center",
          }}
        >
          {/* Shadow */}
          <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-lg bg-black/40 blur-2xl" />

          {/* Sticky Note */}
          <div
            className={`relative h-[600px] w-[800px] rounded-lg bg-gradient-to-br from-yellow-200 via-yellow-100 to-yellow-200 shadow-2xl transition-all duration-500 ${
              isUpdating ? "scale-105 ring-4 ring-blue-400/75" : ""
            } ${isCasting ? "scale-105 ring-4 ring-green-400/75" : ""}`}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 2px 4px 0 rgba(255, 255, 255, 0.6)",
              ...(!selectedNote && {
                animation: "smoothZoom 3s ease-in-out infinite",
              }),
            }}
          >
            {/* Dog ear fold */}
            <div
              className="absolute bottom-0 right-0 h-32 w-32"
              style={{
                background: "linear-gradient(135deg, transparent 50%, rgba(180, 150, 50, 0.3) 50%)",
                clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
              }}
            />

            {/* Real-time Update Indicator */}
            {isUpdating && (
              <div className="absolute right-8 top-8 animate-pulse rounded-full bg-blue-500 px-6 py-4 text-white shadow-lg">
                <span className="text-xl font-bold">Actualizando...</span>
              </div>
            )}

            {/* Content */}
            <div className="flex h-full flex-col items-center justify-center p-16 text-center">
              {selectedNote ? (
                <>
                  <h2
                    className={`mb-2 text-6xl font-bold leading-tight text-gray-900 transition-all duration-300 ${
                      isUpdating ? "text-blue-900" : ""
                    } ${isCasting ? "text-green-900" : ""}`}
                  >
                    {selectedNote.title}
                  </h2>
                  {selectedNote.speaker && (
                    <p
                      className={`text-4xl font-medium text-gray-700 transition-all duration-300 ${
                        isUpdating ? "text-blue-700" : ""
                      } ${isCasting ? "text-green-700" : ""}`}
                    >
                      {selectedNote.speaker}
                    </p>
                  )}
                </>
              ) : (
                <div className="mb-5 flex flex-col items-center gap-2">
                  {/* Cast Icon with Loading Spinner */}
                  <div className="relative">
                    <Cast className="h-72 w-72 text-black" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-16 w-16 animate-spin">
                        <div className="h-full w-full rounded-full border-8 border-black border-t-transparent"></div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-5xl font-bold text-gray-800">Esperando un track</p>
                    <p className="mt-4 text-2xl text-gray-600">Selecciona un track desde el panel de administración</p>
                  </div>
                </div>
              )}
            </div>

            {/* Motivational Phrase - Only when waiting */}
            {!selectedNote && (
              <div className="absolute bottom-2 left-0 right-0 px-4">
                <p className="animate-fade-in max-w-full text-center text-2xl font-bold text-gray-800 transition-all duration-500">
                  {motivationalPhrases[currentPhraseIndex]}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
