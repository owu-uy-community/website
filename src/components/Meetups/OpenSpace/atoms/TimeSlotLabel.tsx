"use client";

import * as React from "react";
import { useState } from "react";

import { Input } from "components/shared/ui/input";
import { Button } from "components/shared/ui/button";
import { Star, Check, Trash2 } from "lucide-react";

interface TimeSlotLabelProps {
  timeSlot: string;
  isEditing: boolean;
  editValue: string;
  isHighlighted?: boolean;
  onDoubleClick: () => void;
  onEditChange: (value: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditBlur: () => void;
  onToggleHighlight?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
}

export function TimeSlotLabel({
  timeSlot,
  isEditing,
  editValue,
  isHighlighted = false,
  onDoubleClick,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onToggleHighlight,
  onSave,
  onDelete,
}: TimeSlotLabelProps) {
  const [isHovering, setIsHovering] = useState(false);

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleHighlight) {
      onToggleHighlight();
    }
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSave) {
      onSave();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  const handleSaveMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent blur from firing
  };

  const handleDeleteMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent blur from firing
  };

  return (
    <div
      className={`group relative flex h-28 cursor-pointer items-center justify-center border-b border-zinc-600 px-1 md:h-32 transition-colors duration-200 ${
        isHighlighted 
          ? "bg-yellow-500/20 border-yellow-500/40" 
          : "bg-zinc-800"
      }`}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {isEditing ? (
        <div className="flex w-full flex-col items-center gap-1.5 px-1">
          <Input
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={onEditBlur}
            className="h-8 w-full border-zinc-600 bg-zinc-900 text-center text-xs font-medium text-white placeholder:text-zinc-500 focus:border-yellow-500 focus:ring-yellow-500 md:text-sm"
            autoFocus
            placeholder="HH:MM - HH:MM"
          />
          <div className="flex w-full gap-1">
            <Button
              size="sm"
              variant="default"
              className="h-6 flex-1 bg-yellow-500 px-2 text-xs font-semibold text-black transition-colors hover:bg-yellow-400"
              onMouseDown={handleSaveMouseDown}
              onClick={handleSaveClick}
            >
              <Check className="mr-1 h-3 w-3" />
              Guardar
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 bg-red-600/10 hover:bg-red-600"
                onMouseDown={handleDeleteMouseDown}
                onClick={handleDeleteClick}
                title="Eliminar horario"
              >
                <Trash2 className="h-3 w-3 text-red-400 hover:text-white" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <span className="text-center text-sm font-medium leading-tight text-zinc-200 md:text-base">{timeSlot}</span>
          
          {/* Highlight Toggle Button - Always visible */}
          {onToggleHighlight && (
            <Button
              size="sm"
              variant={isHighlighted ? "default" : "ghost"}
              className={`absolute right-1 top-1 h-6 w-6 p-0 transition-opacity ${
                isHighlighted 
                  ? "bg-yellow-500 hover:bg-yellow-600 opacity-100" 
                  : "hover:bg-zinc-700 opacity-60 hover:opacity-100"
              }`}
              onClick={handleStarClick}
              title={isHighlighted ? "Quitar del mapa kiosco" : "Agregar al mapa kiosco"}
            >
              <Star className={`h-3 w-3 ${isHighlighted ? "fill-current text-black" : "text-zinc-400"}`} />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
