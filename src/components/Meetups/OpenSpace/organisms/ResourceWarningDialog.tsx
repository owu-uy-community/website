"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";

interface ResourceWarningDialogProps {
  open: boolean;
  /** One human-readable line per missing resource. */
  issues: string[];
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Single confirmation for "the target room lacks TV/whiteboard", shared by
 * the drag-and-drop flow and the talk form (they used to render two
 * different UIs for the same warning).
 */
export function ResourceWarningDialog({
  open,
  issues,
  confirmLabel = "Continuar igual",
  isPending = false,
  onConfirm,
  onCancel,
}: ResourceWarningDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>La sala no tiene los recursos</AlertDialogTitle>
          <AlertDialogDescription>
            Podés continuar igual, pero la charla va a quedar sin lo que pide:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2">
          {issues.map((issue) => (
            <li
              key={issue}
              className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm text-foreground"
            >
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              // Keep the dialog open while the mutation runs; the caller
              // closes it on success.
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? "Guardando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
