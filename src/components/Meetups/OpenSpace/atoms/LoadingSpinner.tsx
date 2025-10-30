"use client";

import * as React from "react";

interface LoadingSpinnerProps {
  message?: string;
}

/**
 * Full-screen loading spinner with optional message
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Loading..." }) => {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-yellow-400"></div>
        <p className="text-lg text-gray-400">{message}</p>
      </div>
    </div>
  );
};

LoadingSpinner.displayName = "LoadingSpinner";

