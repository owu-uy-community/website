import { Megaphone, Users, Lightbulb, MessageSquare, Target } from "lucide-react";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";
import { EXTERNAL_SERVICES } from "app/lib/constants";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(): TimeLeft {
  const targetDate = new Date("2025-07-31T23:59:59").getTime();
  const now = new Date().getTime();
  const difference = targetDate - now;

  if (difference > 0) {
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    return {
      days,
      hours,
      minutes,
      seconds,
      total: difference,
    };
  } else {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      total: 0,
    };
  }
}

export default function CallForProposals() {
  const timeLeft = calculateTimeLeft();

  // Calculate progress percentage (assuming 31 days total campaign)
  const totalCampaignTime = 31 * 24 * 60 * 60 * 1000; // 31 days in milliseconds
  const progressPercentage = Math.max(0, Math.min(100, (timeLeft.total / totalCampaignTime) * 100));

  // SVG circle properties
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;
  return (
    <section id="call-for-proposals" className="mt-16 w-full">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-yellow-400/10 px-4 py-2">
            <Megaphone className="h-5 w-5 text-yellow-400" />
            <span className="font-semibold text-yellow-400">¡NOVEDAD!</span>
          </div>
          <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">Call for Proposals</h2>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-gray-300">
            <strong className="text-yellow-400">¡Lo pidieron, los escuchamos!</strong>
          </p>
          <p className="mx-auto mt-2 max-w-3xl text-balance text-base leading-relaxed text-gray-300 lg:text-lg">
            ¡Por primera vez, abrimos Call for Proposals para las charlas de La Meetup!
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_260px_1fr]">
          {/* Content */}
          <div className="flex flex-col items-center space-y-10 lg:items-baseline">
            <span>
              <h3 className="mb-4 text-center text-xl font-bold text-white lg:text-left">¿Qué buscamos?</h3>
              <p className="mb-4 leading-relaxed text-gray-300">
                Charlas que enseñan, que inspiran, que dejan pensando. <br />
                Si tenés una, este es el momento. Y si no pero conocés a alguien que quizás sí, podés nominarlo.
              </p>
              <p className="leading-relaxed text-gray-300">
                Las charlas se presentarán en el único track de la tarde, por lo que buscamos temas lo suficientemente
                amplios para ser de interés a una audiencia diversa.
              </p>
            </span>

            {timeLeft.total === 0 ? (
              <div className="ml-2 inline-flex w-full max-w-[260px] skew-x-[-21deg] cursor-not-allowed items-center justify-center border-2 border-red-500 bg-red-500/10 px-2 py-2.5 text-base font-semibold uppercase text-red-500">
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  Postulaciones Cerradas
                </span>
              </div>
            ) : (
              <Link
                className="ml-2 inline-flex w-full max-w-[260px] skew-x-[-21deg] cursor-pointer items-center justify-center border-2 border-yellow-400 px-2 py-2.5 text-base font-semibold uppercase text-yellow-400 ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-yellow-400 hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out"
                href={addUtmParams(EXTERNAL_SERVICES.googleForms.callForProposals)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  ¡Enviar Propuesta!
                </span>
              </Link>
            )}
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="relative">
              {/* SVG Progress Circle */}
              <svg className="h-[260px] w-[260px] -rotate-90 transform" viewBox="0 0 135 135">
                {/* Background circle */}
                <circle cx="70" cy="70" r={radius} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="4" fill="none" />
                {/* Progress circle */}
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  stroke={timeLeft.total > 0 ? "#fbbf24" : "#DB4437"}
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>

              {/* Timer content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="mb-1 text-2xl font-bold text-white">31 DE JULIO</div>
                <div className="mb-2 text-sm text-gray-400">2025</div>
                {timeLeft.total > 0 ? (
                  <p className="text-xs text-gray-500">{timeLeft.days} días restantes</p>
                ) : (
                  <p className="text-xs text-red-400">¡Postulaciones Cerradas!</p>
                )}
              </div>
            </div>
          </div>
          {/* CTA Buttons */}
          <span>
            <h3 className="mb-4 text-center text-xl font-bold text-white lg:text-left">Temas de interés</h3>
            <div className="grid grid-cols-1 gap-2">
              {[
                { icon: Lightbulb, title: "Tecnología", description: "Nuevas tecnologías, frameworks, herramientas" },
                {
                  icon: Users,
                  title: "Comunidad",
                  description: "Construcción de comunidades y networking",
                },
                { icon: Target, title: "Liderazgo", description: "Desarrollo profesional, gestión de equipos" },
                {
                  icon: MessageSquare,
                  title: "IA & Datos",
                  description: "Inteligencia artificial, machine learning, análisis de datos",
                },
              ].map((topic, index) => {
                const IconComponent = topic.icon;
                return (
                  <div key={index} className="flex items-center gap-4 py-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400/20">
                      <IconComponent className="h-4 w-4 text-yellow-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{topic.title}</h4>
                      <p className="text-sm text-gray-400">{topic.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </span>
        </div>
      </div>
    </section>
  );
}
