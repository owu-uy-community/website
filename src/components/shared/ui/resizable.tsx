"use client";

import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "app/lib/utils";

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

/**
 * The gap between two panels doubles as the grip: a quiet pill that lights up
 * on hover, focus and while dragging. The library widens the hit target for
 * touch (`resizeTargetMinimumSize` on the group).
 */
function ResizableHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative flex w-3 shrink-0 items-center justify-center outline-hidden aria-[orientation=horizontal]:h-3 aria-[orientation=horizontal]:w-full",
        className
      )}
      {...props}
    >
      <span className="h-8 w-1 rounded-full bg-border transition-colors group-aria-[orientation=horizontal]/handle:h-1 group-aria-[orientation=horizontal]/handle:w-8 group-data-[separator=active]/handle:bg-primary group-data-[separator=focus]/handle:bg-primary group-data-[separator=hover]/handle:bg-muted-foreground" />
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
