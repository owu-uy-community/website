"use client";

import React from "react";

const ROWS = 10;
const COLS = 18;

export default function BackgroundAnimation() {
  const circles = [];

  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const x = (i / COLS) * 100;
      const y = (j / ROWS) * 100;
      // Create unique animation delays for each circle
      const animationDelay = `${(i + j) * 0.1}s`;
      const animationDuration = `${3 + (i % 3)}s`;

      circles.push(
        <circle
          key={`${i}-${j}`}
          cx={`${x}%`}
          cy={`${y}%`}
          r="2.5"
          fill="#DEDEDE"
          opacity="0.3"
          className="animate-float"
          style={{
            animationDelay,
            animationDuration,
          }}
        />
      );
    }
  }

  return (
    <>
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translate(0, 0);
            opacity: 0.2;
          }
          25% {
            transform: translate(10px, -10px);
            opacity: 0.4;
          }
          50% {
            transform: translate(-5px, 15px);
            opacity: 0.6;
          }
          75% {
            transform: translate(15px, 5px);
            opacity: 0.3;
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>

      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ zIndex: 0 }}
      >
        {circles}
      </svg>
    </>
  );
}
