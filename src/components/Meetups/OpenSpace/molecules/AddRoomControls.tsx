"use client";

import * as React from "react";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { AddButton } from "../atoms/AddButton";

interface AddRoomControlsProps {
  isAddingRoom: boolean;
  newRoomName: string;
  onNewRoomNameChange: (value: string) => void;
  onAddRoom: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onCancel: () => void;
  onStartAdding: () => void;
}

export function AddRoomControls({
  isAddingRoom,
  newRoomName,
  onNewRoomNameChange,
  onAddRoom,
  onKeyPress,
  onCancel,
  onStartAdding,
}: AddRoomControlsProps) {
  if (isAddingRoom) {
    return (
      <div className="flex gap-1">
        <Input
          placeholder="Room name"
          value={newRoomName}
          onChange={(e) => onNewRoomNameChange(e.target.value)}
          onKeyDown={onKeyPress}
          className="w-32"
          autoFocus
        />
        <Button size="sm" onClick={onAddRoom} disabled={!newRoomName.trim()}>
          Agregar
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <AddButton variant="outline" onClick={onStartAdding}>
      Agregar lugar
    </AddButton>
  );
}
