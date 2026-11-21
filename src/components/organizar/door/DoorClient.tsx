"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";

import { Scanner } from "components/Admin/attendees/Scanner";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { DoorInfo } from "lib/orpc/door/schemas";

/** The scanner on a volunteer's link, plus letting in someone who didn't sign up. */
export function DoorClient({ token, info }: { token: string; info: DoorInfo }) {
  const [name, setName] = useState("");
  const walkIn = useMutation(
    orpc.door.walkIn.mutationOptions({
      onSuccess: (person) => {
        toast.success(`${person.name} entró`, "Lo sumamos a la lista y a la cuenta.");
        setName("");
      },
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );

  return (
    <>
      <Scanner
        door={token}
        eventId={info.eventId}
        eventName={info.name}
        registration={info.registration}
        timezone={info.timezone}
      />
      <section className="mx-auto w-full max-w-md px-4 pb-8">
        <form
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            walkIn.mutate({ token, name });
          }}
        >
          <label className="text-ui font-medium text-foreground" htmlFor="walk-in">
            ¿Vino alguien sin anotarse?
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              id="walk-in"
              maxLength={120}
              minLength={2}
              placeholder="Su nombre"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button disabled={walkIn.isPending} type="submit" variant="outline">
              <UserPlus />
              Hacer entrar
            </Button>
          </div>
        </form>
        <p className="mt-3 text-center font-terminal text-meta text-muted-foreground tabular-nums">
          {info.communityName} · link válido hasta el {shortWhen(info.expiresAt)}
        </p>
      </section>
    </>
  );
}
