"use client";

import { Plus } from "lucide-react";

interface EmptyCellProps {
  isHovered: boolean;
  onClick: () => void;
}

export function EmptyCell({ isHovered, onClick }: EmptyCellProps) {
  if (!isHovered) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={onClick}>
      <div className="w-8 h-8 bg-gray-600/80 hover:bg-gray-500/90 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg">
        <Plus className="h-4 w-4 text-white" />
      </div>
    </div>
  );
}
