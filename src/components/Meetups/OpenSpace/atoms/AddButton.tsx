"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "components/shared/ui/button";

interface AddButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "outline";
}

export function AddButton({ onClick, children, variant = "default" }: AddButtonProps) {
  return (
    <Button variant={variant} onClick={onClick} className="gap-2 whitespace-nowrap">
      <Plus className="h-4 w-4" />
      {children}
    </Button>
  );
}
