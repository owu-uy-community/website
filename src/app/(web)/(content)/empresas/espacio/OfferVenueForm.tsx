"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, PartyPopper } from "lucide-react";

import { cn } from "app/lib/utils";
import { buttonClassName, cardClassName, Eyebrow } from "components/community/ui";
import { orpc } from "lib/orpc/client";
import { AMENITIES, AMENITY_LABEL } from "lib/orpc/venues/schemas";

const inputClassName =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-zinc-500 hover:border-white/20 focus-visible:border-yellow-400/60 focus-visible:ring-2 focus-visible:ring-yellow-400/20";
const optionClassName =
  "flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 transition-colors group-hover:bg-white/[0.06] peer-checked:border-yellow-400 peer-checked:bg-yellow-400/10 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-400";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];
const CAPS = [
  { value: "", label: "Cuando se pueda" },
  { value: "1", label: "Hasta 1 meetup por mes" },
  { value: "2", label: "Hasta 2 por mes" },
];

function Group({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="font-title text-[17px] font-semibold text-white">{legend}</legend>
      {hint ? <p className="-mt-2 text-sm leading-relaxed text-zinc-500">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300">
      {label}
      {children}
    </label>
  );
}

/** Sumá tu espacio: a company offers its space; OWU's staff review it and organizers can ask for dates. */
export function OfferVenueForm({ name }: { name: string }) {
  const [form, setForm] = useState({
    name: "",
    neighbourhood: "",
    city: "Montevideo",
    address: "",
    capacity: "",
    availability: "",
    notes: "",
    monthlyCap: "",
    addressVisibility: "attendees" as "attendees" | "public",
  });
  const [amenities, setAmenities] = useState<(typeof AMENITIES)[number][]>([]);
  const [hostDays, setHostDays] = useState<number[]>([2, 3, 4]);
  const [consent, setConsent] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = useMutation(orpc.venues.submit.mutationOptions());

  if (submit.isSuccess) {
    return (
      <div className={cardClassName(false, "flex flex-col items-start gap-4 p-6 sm:p-8")}>
        <PartyPopper aria-hidden className="size-8 text-yellow-400" />
        <h2 className="font-title text-2xl font-semibold text-white">¡Gracias, {name.split(" ")[0]}!</h2>
        <p className="max-w-xl text-[15px] leading-relaxed text-zinc-300">
          El staff de OWU revisa el espacio y te avisa. Cuando una comunidad te pida fecha, te llega un mail con un link
          para responder: elegís una fecha, proponés otra o decís que esta vez no.
        </p>
      </div>
    );
  }

  return (
    <form
      className={cardClassName(false, "flex flex-col gap-10 p-6 sm:p-8")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!consent) return;
        submit.mutate({
          name: form.name,
          neighbourhood: form.neighbourhood,
          city: form.city,
          address: form.address,
          capacity: Number(form.capacity),
          amenities,
          hostDays,
          availability: form.availability,
          monthlyCap: form.monthlyCap ? Number(form.monthlyCap) : null,
          addressVisibility: form.addressVisibility,
          notes: form.notes,
          consent: true,
        });
      }}
    >
      <Group legend="La empresa">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="Empresa u organización">
              <input className={inputClassName} maxLength={120} required value={form.name} onChange={set("name")} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Barrio">
              <input
                className={inputClassName}
                maxLength={80}
                placeholder="Cordón"
                required
                value={form.neighbourhood}
                onChange={set("neighbourhood")}
              />
            </Field>
          </div>
          <Field label="Ciudad">
            <input className={inputClassName} maxLength={80} required value={form.city} onChange={set("city")} />
          </Field>
        </div>
      </Group>

      <Group legend="El espacio">
        <Field label="¿Cuántas personas entran sentadas?">
          <input
            className={cn(inputClassName, "max-w-[8rem] tabular-nums")}
            inputMode="numeric"
            max={2000}
            min={5}
            required
            type="number"
            value={form.capacity}
            onChange={set("capacity")}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-zinc-300">Qué tiene</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {AMENITIES.map((amenity) => {
              const checked = amenities.includes(amenity);

              return (
                <label key={amenity} className="group relative cursor-pointer">
                  <input
                    checked={checked}
                    className="peer sr-only"
                    type="checkbox"
                    onChange={() =>
                      setAmenities(checked ? amenities.filter((item) => item !== amenity) : [...amenities, amenity])
                    }
                  />
                  <span className={optionClassName}>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-yellow-400 bg-yellow-400 text-zinc-950" : "border-zinc-600"
                      )}
                    >
                      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    {AMENITY_LABEL[amenity]}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </Group>

      <Group hint="Así las comunidades te piden solo fechas que te sirven." legend="Cuándo">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-zinc-300">Días que pueden recibir</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Días que pueden recibir">
            {WEEKDAYS.map((day) => {
              const on = hostDays.includes(day.value);

              return (
                <button
                  key={day.value}
                  aria-pressed={on}
                  className={cn(
                    "h-11 min-w-14 rounded-xl border px-3 text-sm font-medium transition-colors",
                    on
                      ? "border-yellow-400 bg-yellow-400/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                  )}
                  type="button"
                  onClick={() =>
                    setHostDays(on ? hostDays.filter((value) => value !== day.value) : [...hostDays, day.value])
                  }
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Horarios">
          <input
            className={inputClassName}
            maxLength={500}
            placeholder="Desde las 18:30, hasta las 22"
            required
            value={form.availability}
            onChange={set("availability")}
          />
        </Field>
        <Field label="¿Cada cuánto?">
          <select
            className={cn(inputClassName, "max-w-xs appearance-none")}
            value={form.monthlyCap}
            onChange={set("monthlyCap")}
          >
            {CAPS.map((option) => (
              <option key={option.value} className="bg-zinc-900" value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </Group>

      <Group hint="Las comunidades la ven recién cuando aceptás su pedido." legend="La dirección">
        <Field label="Dirección">
          <input
            className={inputClassName}
            maxLength={200}
            placeholder="Calle 1234, piso 2"
            value={form.address}
            onChange={set("address")}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "attendees", label: "Solo para quienes se anoten al evento" },
              { value: "public", label: "Pública en la página del evento" },
            ] as const
          ).map((option) => (
            <label key={option.value} className="group relative cursor-pointer">
              <input
                checked={form.addressVisibility === option.value}
                className="peer sr-only"
                name="addressVisibility"
                type="radio"
                onChange={() => setForm((current) => ({ ...current, addressVisibility: option.value }))}
              />
              <span className={optionClassName}>{option.label}</span>
            </label>
          ))}
        </div>
      </Group>

      <Group legend="Algo más">
        <Field label="Comentarios (opcional)">
          <textarea
            className={cn(inputClassName, "h-auto min-h-24 py-3")}
            maxLength={1000}
            placeholder="Cómo se llega, si hay que registrar a la gente en la entrada…"
            value={form.notes}
            onChange={set("notes")}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300">
          <input
            checked={consent}
            className="mt-1 size-4 accent-yellow-400"
            required
            type="checkbox"
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            Acepto que organizadores de comunidades de OWU me pidan fecha por este espacio. Mi mail les llega solo
            cuando acepto un pedido, y puedo darme de baja escribiendo a OWU.
          </span>
        </label>
      </Group>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Eyebrow>Lo revisa el staff de OWU</Eyebrow>
        <button className={buttonClassName("primary", "lg")} disabled={submit.isPending || !consent} type="submit">
          {submit.isPending ? "Enviando…" : "Ofrecer el espacio"}
        </button>
      </div>
      {submit.isError ? (
        <p className="text-sm text-red-300" role="alert">
          {submit.error.message}
        </p>
      ) : null}
    </form>
  );
}
