"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { cn } from "app/lib/utils";
import { Button, type ButtonProps } from "components/shared/ui/button";
import { client } from "lib/orpc";
import type { CommandResult, CompanionCommand } from "lib/orpc/companion/schemas";

export type SendCommand = (command: CompanionCommand) => Promise<CommandResult>;

/** Results that beat their command's own reply are kept this many at most. */
const EARLY_MAX = 20;

/**
 * Commands and their results: the site hands a command to the bridge right away (or answers that
 * it isn't there), and the bridge's result comes back on the channel, matched by id. 10 s at most;
 * a mic test, its length plus 5 s. `settle` takes each `result` event.
 */
export function useCommands() {
  const waiting = useRef(new Map<string, (result: CommandResult) => void>());
  const early = useRef(new Map<string, CommandResult>());

  const settle = useCallback((result: CommandResult) => {
    const done = waiting.current.get(result.id);
    if (done) return done(result);
    early.current.set(result.id, result);
    const oldest = early.current.keys().next().value;
    if (early.current.size > EARLY_MAX && oldest !== undefined) early.current.delete(oldest);
  }, []);

  const send = useCallback<SendCommand>(async (command) => {
    const { id, delivered } = await client.companion.command({ command });
    if (!delivered) return { id, ok: false, error: "El bridge no está conectado." };

    return new Promise<CommandResult>((resolve) => {
      const done = (result: CommandResult) => {
        clearTimeout(timer);
        waiting.current.delete(id);
        resolve(result);
      };
      const timer = setTimeout(
        () => done({ id, ok: false, error: "El bridge no respondió a tiempo." }),
        command.type === "probe-mic" ? command.ms + 5000 : 10_000
      );
      waiting.current.set(id, done);
      const seen = early.current.get(id);
      if (seen) {
        early.current.delete(id);
        done(seen);
      }
    });
  }, []);

  return { send, settle };
}

type CommandState = { running: boolean; result?: CommandResult; command?: CompanionCommand };

/** One control's command: running, then its result until the next run. */
export function useCommand(send: SendCommand) {
  const [state, setState] = useState<CommandState>({ running: false });
  const run = async (command: CompanionCommand) => {
    setState({ running: true, command });
    const result = await send(command).catch((error: unknown): CommandResult => ({
      id: "",
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo mandar.",
    }));
    setState({ running: false, result, command });
    return result;
  };

  return { ...state, run };
}

/** What became of a command, next to its button: `running`, its error, or `done`. */
export function CommandNote({
  state,
  running = "enviando…",
  done = "listo",
  className,
}: {
  state: CommandState;
  running?: ReactNode;
  done?: ReactNode;
  className?: string;
}) {
  if (!state.running && !state.result) return null;

  return (
    <span
      aria-live="polite"
      className={cn(
        "text-meta",
        state.result && !state.result.ok ? "text-warning-foreground" : "text-muted-foreground",
        className
      )}
    >
      {state.running ? running : state.result?.ok ? done : state.result?.error || "No funcionó."}
    </span>
  );
}

/** A button that sends one command and says how it went. */
export function CommandButton({
  send,
  command,
  running,
  done,
  children,
  variant = "outline",
  size = "sm",
}: {
  send: SendCommand;
  command: CompanionCommand;
  running?: ReactNode;
  /** What to say when it worked, from the command as it was sent. */
  done?: (result: CommandResult, command: CompanionCommand) => ReactNode;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const state = useCommand(send);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button disabled={state.running} size={size} variant={variant} onClick={() => void state.run(command)}>
        {children}
      </Button>
      <CommandNote
        done={state.result && state.command && done ? done(state.result, state.command) : undefined}
        running={running}
        state={state}
      />
    </span>
  );
}
