// Only keep truly shared types that are used across multiple components/files

export interface Position {
  x: number;
  y: number;
}

export interface CellCoordinates {
  room: string;
  timeSlot: string;
}
