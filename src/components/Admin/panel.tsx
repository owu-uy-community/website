"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { AnimatePresence, MotionConfig, motion, useDragControls, type Transition } from "motion/react";
import { AlertTriangle, Info, X, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { BOARD_EASE } from "components/Meetups/OpenSpace/utils/constants";
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
import { useIsMobile } from "components/shared/ui/sidebar";
import { Switch } from "components/shared/ui/switch";

/** Critically damped: lands fast, never wobbles. */
const PANEL_SPRING: Transition = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 };
const PANEL_EXIT: Transition = { duration: 0.2, ease: [0.4, 0, 1, 1] };
/** How far (px) or how fast (px/s) a swipe down has to go to close the sheet. */
const SWIPE_CLOSE_OFFSET = 96;
const SWIPE_CLOSE_VELOCITY = 500;

/**
 * Where the board's create/edit forms live: a panel sliding in from the right
 * on desktop, so the grid stays in view, and a bottom sheet on phones that
 * closes with a swipe down. It is a Radix dialog underneath — focus trap,
 * Esc, `role="dialog"` — animated by motion. Sized to the visual viewport
 * (AdminShell's --admin-viewport-* vars) so the iOS keyboard never hides it.
 *
 * `busy` blocks every way out (Esc, outside click, swipe) while a save runs.
 * The element marked `data-autofocus` gets focus on open (desktop only: on a
 * phone that would throw the keyboard over the sheet as it slides in).
 */
export function EditorPanel({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  busy = false,
  danger,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  busy?: boolean;
  /** Footer, left: the destructive action. */
  danger?: React.ReactNode;
  /** Footer, right: cancel + primary. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const dragControls = useDragControls();
  const contentRef = React.useRef<HTMLDivElement>(null);

  const requestClose = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  const startSwipe = isMobile && !busy ? (event: React.PointerEvent) => dragControls.start(event) : undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {open ? (
            // Every direct child of the Portal must be a DOM element: Radix wraps each one in a
            // Presence that reads its computed style.
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay forceMount className="fixed inset-0 z-50">
                <motion.div
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />
              </DialogPrimitive.Overlay>
              {/* A click-through frame the size of the visual viewport; clicks around the panel
                  land on the overlay, which closes it. */}
              <DialogPrimitive.Content
                ref={contentRef}
                forceMount
                className={cn(
                  "fixed inset-x-0 top-[var(--admin-viewport-top,0px)] z-50 flex h-[var(--admin-viewport-height,100dvh)] outline-hidden",
                  isMobile ? "flex-col justify-end" : "justify-end"
                )}
                style={{ pointerEvents: "none" }}
                {...(description ? {} : { "aria-describedby": undefined })}
                onEscapeKeyDown={(event) => busy && event.preventDefault()}
                onInteractOutside={(event) => busy && event.preventDefault()}
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  const target = isMobile
                    ? contentRef.current
                    : contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
                  (target ?? contentRef.current)?.focus({ preventScroll: true });
                }}
              >
                <motion.div
                  animate={isMobile ? { y: 0 } : { x: 0 }}
                  className={cn(
                    "pointer-events-auto relative flex min-h-0 flex-col bg-popover text-popover-foreground shadow-2xl shadow-black/40 outline-hidden",
                    isMobile
                      ? "max-h-[calc(100%-1.5rem)] w-full rounded-t-2xl border-t border-border"
                      : "h-full w-full max-w-lg border-l border-border"
                  )}
                  drag={isMobile && !busy ? "y" : false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragControls={dragControls}
                  dragElastic={{ top: 0, bottom: 0.8 }}
                  dragListener={false}
                  exit={isMobile ? { y: "100%", transition: PANEL_EXIT } : { x: "100%", transition: PANEL_EXIT }}
                  initial={isMobile ? { y: "100%" } : { x: "100%" }}
                  transition={PANEL_SPRING}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > SWIPE_CLOSE_OFFSET || info.velocity.y > SWIPE_CLOSE_VELOCITY)
                      requestClose(false);
                  }}
                >
                  <div
                    className={cn("shrink-0 border-b border-border/70 px-5 pb-4 sm:px-6", isMobile ? "pt-2.5" : "pt-5")}
                    style={isMobile ? { touchAction: "none" } : undefined}
                    onPointerDown={startSwipe}
                  >
                    {isMobile ? (
                      <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
                    ) : null}
                    <div className="flex items-start gap-3 pr-10">
                      {Icon ? (
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <DialogPrimitive.Title className="font-display text-lg leading-tight font-semibold tracking-tight break-words text-foreground">
                          {title}
                        </DialogPrimitive.Title>
                        {description ? (
                          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                            {description}
                          </DialogPrimitive.Description>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                    {children}
                  </div>

                  {danger || actions ? (
                    <div className="flex shrink-0 items-center gap-2 border-t border-border/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                      {danger}
                      <div className="ml-auto flex flex-1 justify-end gap-2 sm:flex-none [&>button]:h-11 [&>button]:flex-1 sm:[&>button]:h-10 sm:[&>button]:flex-none">
                        {actions}
                      </div>
                    </div>
                  ) : null}

                  <DialogPrimitive.Close
                    className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none sm:top-4 sm:right-4"
                    disabled={busy}
                  >
                    <X aria-hidden className="h-4 w-4" />
                    <span className="sr-only">Cerrar</span>
                  </DialogPrimitive.Close>
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </DialogPrimitive.Root>
  );
}

/** Height + fade in/out; content can overflow (focus rings) once it has landed. */
export function Collapse({
  show,
  children,
  className,
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
          exit={{ height: 0, opacity: 0, overflow: "hidden" }}
          initial={{ height: 0, opacity: 0, overflow: "hidden" }}
          transition={{ duration: 0.22, ease: BOARD_EASE }}
        >
          <div className={className}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Inline field error that slides open; keeps its text while it slides shut. */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  const [shown, setShown] = React.useState(message);
  if (message && message !== shown) setShown(message);

  return (
    <Collapse show={Boolean(message)}>
      <p className="pt-1.5 text-sm text-destructive" id={id}>
        {message ?? shown}
      </p>
    </Collapse>
  );
}

const NOTICE_TONES = {
  danger: { icon: AlertTriangle, box: "border-destructive/40 bg-destructive/10", iconClass: "text-destructive" },
  warning: { icon: AlertTriangle, box: "border-amber-500/40 bg-amber-500/10", iconClass: "text-amber-500" },
  info: { icon: Info, box: "border-primary/30 bg-primary/[0.06]", iconClass: "text-primary" },
} as const;

/** A boxed message inside a form (save errors, consequences of an edit). Animates in and out. */
export function Notice({
  show = true,
  tone,
  children,
}: {
  show?: boolean;
  tone: keyof typeof NOTICE_TONES;
  children: React.ReactNode;
}) {
  const { icon: Icon, box, iconClass } = NOTICE_TONES[tone];

  return (
    <Collapse show={show}>
      <div
        className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", box)}
        role={tone === "danger" ? "alert" : undefined}
      >
        <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
        <div className="min-w-0 text-sm text-foreground">{children}</div>
      </div>
    </Collapse>
  );
}

/** A titled group of fields. */
export function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="font-terminal text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A whole-row toggle: icon, label, optional hint, switch. */
export function SwitchRow({
  id,
  icon: Icon,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  icon?: LucideIcon;
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        checked ? "border-primary/40 bg-primary/[0.05]" : "border-border hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60"
      )}
      htmlFor={id}
    >
      {Icon ? (
        <Icon aria-hidden className={cn("h-4 w-4 shrink-0", checked ? "text-primary" : "text-muted-foreground")} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/**
 * Tab list as a segmented control: the active pill glides between options.
 * Goes inside a Radix `Tabs` root; each instance animates on its own.
 */
export function SegmentedTabsList({
  value,
  items,
  className,
}: {
  value: string;
  items: { value: string; label: React.ReactNode; icon?: LucideIcon }[];
  className?: string;
}) {
  const layoutId = React.useId();

  return (
    <TabsPrimitive.List
      className={cn("grid h-11 w-full auto-cols-fr grid-flow-col rounded-lg bg-muted/70 p-1", className)}
    >
      {items.map(({ value: itemValue, label, icon: Icon }) => (
        <TabsPrimitive.Trigger
          key={itemValue}
          className="relative z-0 inline-flex items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden data-[state=active]:text-foreground"
          value={itemValue}
        >
          {value === itemValue ? (
            <motion.span
              className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm ring-1 ring-border/60"
              layoutId={layoutId}
              transition={PANEL_SPRING}
            />
          ) : null}
          {Icon ? <Icon aria-hidden className="h-4 w-4" /> : null}
          {label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

/** Content of a tab, fading in when it becomes active. */
export function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.22, ease: BOARD_EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Destructive confirmation; stays open (and locked) while the delete runs. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Eliminando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
