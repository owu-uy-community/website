"use client";

import * as React from "react";

import { SearchInput } from "../atoms/SearchInput";
import { AddButton } from "../atoms/AddButton";
import { AddRoomControls } from "../molecules/AddRoomControls";
import { RealtimeIndicator } from "../atoms/RealtimeIndicator";

interface BoardHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isAddingRoom: boolean;
  newRoomName: string;
  onNewRoomNameChange: (value: string) => void;
  onAddRoom: () => void;
  onAddRoomKeyPress: (e: React.KeyboardEvent) => void;
  onCancelAddRoom: () => void;
  onStartAddingRoom: () => void;
  onAddSession: () => void;
}

export function BoardHeader({
  searchTerm,
  onSearchChange,
  isAddingRoom,
  newRoomName,
  onNewRoomNameChange,
  onAddRoom,
  onAddRoomKeyPress,
  onCancelAddRoom,
  onStartAddingRoom,
  onAddSession,
}: BoardHeaderProps) {
  return (
    <header className="border-b border-gray-600 bg-gray-900 px-4 py-4 md:px-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white md:text-2xl">Planificador de Open Space</h1>
          <RealtimeIndicator isConnected={true} />
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
          <SearchInput value={searchTerm} onChange={onSearchChange} />

          <div className="flex gap-2">
            <AddRoomControls
              isAddingRoom={isAddingRoom}
              newRoomName={newRoomName}
              onNewRoomNameChange={onNewRoomNameChange}
              onAddRoom={onAddRoom}
              onKeyPress={onAddRoomKeyPress}
              onCancel={onCancelAddRoom}
              onStartAdding={onStartAddingRoom}
            />

            <AddButton onClick={onAddSession}>Agregar charla</AddButton>
          </div>
        </div>
      </div>
    </header>
  );
}
