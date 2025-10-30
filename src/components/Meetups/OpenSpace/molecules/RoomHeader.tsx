"use client";

import * as React from "react";
import { Diamond, Square, Pentagon, Circle, Triangle } from "lucide-react";

const getRoomIcon = (room: string) => {
  const baseClasses = "h-[18px] w-[18px]";

  switch (room.toLowerCase()) {
    case "lobby":
      return <Diamond className={`${baseClasses} fill-blue-500 text-blue-500`} />;
    case "ventana":
      return <Square className={`${baseClasses} fill-orange-500 text-orange-500`} />;
    case "cueva":
      return <Pentagon className={`${baseClasses} fill-green-500 text-green-500`} />;
    case "centro":
      return <Circle className={`${baseClasses} fill-yellow-400 text-yellow-400`} />;
    case "rincon":
      return <Triangle className={`${baseClasses} fill-red-500 text-red-500`} />;
    default:
      return null;
  }
};

interface RoomHeaderProps {
  room: string;
  index: number;
  isBeingDragged: boolean;
  isHoveredTarget: boolean;
  onMouseDown: (e: React.MouseEvent, index: number) => void;
}

export function RoomHeader({ room, index, isBeingDragged, isHoveredTarget, onMouseDown }: RoomHeaderProps) {
  return (
    <div
      className={`openspace-room-header flex h-16 items-center justify-center border-b border-l border-zinc-600 bg-zinc-800 px-1 transition-all duration-200 ease-out md:h-20 ${
        isBeingDragged ? "dragging translate-y-[-1px]" : "translate-y-0"
      } ${isHoveredTarget ? "border-yellow-400/50 bg-yellow-400/30" : ""}`}
      onMouseDown={(e) => onMouseDown(e, index)}
    >
      <div className="flex items-center justify-center gap-1.5">
        {getRoomIcon(room)}
        <span className="text-center text-sm font-medium capitalize text-zinc-200 md:text-base">{room}</span>
      </div>
    </div>
  );
}
