"use client";

import { useState } from "react";
import { MessageCircleQuestion, MessageSquareText } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";

import { CommandNote, useCommand, type SendCommand } from "./commands";

const KINDS = {
  say: {
    open: "Decir…",
    icon: MessageSquareText,
    placeholder: "Lo que va a decir Owy",
    done: "lo dijo",
    submit: "Decir",
  },
  ask: {
    open: "Preguntar…",
    icon: MessageCircleQuestion,
    placeholder: "Una pregunta para Owy",
    done: "contestó",
    submit: "Preguntar",
  },
} as const;

/** «Decir…»: a line Owy says word for word on this device; «Preguntar…»: a question his brain answers out loud. */
export function LineForm({ id, send, kind }: { id: string; send: SendCommand; kind: keyof typeof KINDS }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const line = useCommand(send);
  const { open: label, icon: Icon, placeholder, done, submit } = KINDS[kind];

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Icon aria-hidden /> {label}
      </Button>
    );

  return (
    <form
      className="flex basis-full flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        const result = await line.run(
          kind === "say"
            ? { type: "say", deviceId: id, text: value }
            : { type: "ask", deviceId: id, text: value, asker: "presenter" }
        );
        if (result.ok) setText("");
      }}
    >
      <Input
        autoFocus
        aria-label={`${kind === "say" ? "Lo que dice" : "La pregunta para"} ${id}`}
        className="min-w-0 flex-1 sm:max-w-96"
        maxLength={600}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button disabled={line.running || !text.trim()} size="sm" type="submit">
        {submit}
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cerrar
      </Button>
      <CommandNote done={done} state={line} />
    </form>
  );
}
