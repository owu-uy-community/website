"use client";

import { useId } from "react";

import { MicroLabel } from "components/Admin/ui/page";
import { Checkbox } from "components/shared/ui/checkbox";
import { Input } from "components/shared/ui/input";
import { DEFAULT_ID_DEADLINE_HOURS, FACT_FLAGS, type VenueFactsInput } from "lib/organizar/venue-facts";

const TEXTS = [
  { key: "transit", label: "Cómo llegar", placeholder: "Ómnibus 121, 183 y 187 por 18 de Julio" },
  { key: "parking", label: "Estacionamiento", placeholder: "Parking pago en la esquina; bicicletero en la entrada" },
  { key: "foodRules", label: "Comida y bebida", placeholder: "Se puede comer en el comedor, no en la sala" },
  {
    key: "avNotes",
    label: "Proyector y sonido (para quien organiza)",
    placeholder: "Proyector con HDMI-C; micrófono inalámbrico",
  },
] as const;

/** The space's facts, as staff and its contact edit them (the Admin UI's look). */
export function VenueFactsFields({
  value,
  onChange,
}: {
  value: VenueFactsInput;
  onChange: (facts: VenueFactsInput) => void;
}) {
  const id = useId();
  const set = (change: VenueFactsInput) => onChange({ ...value, ...change });
  const flag = (key: string, label: string, checked: boolean, onChecked: (next: boolean) => void) => (
    <div key={key} className="flex min-h-8 items-center gap-2.5 text-ui text-foreground">
      <Checkbox
        aria-labelledby={`${id}-${key}`}
        checked={checked}
        className="size-5"
        id={`${id}-${key}-box`}
        onCheckedChange={(next) => onChecked(next === true)}
      />
      <label className="cursor-pointer" htmlFor={`${id}-${key}-box`} id={`${id}-${key}`}>
        {label}
      </label>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5">
          <MicroLabel>Accesibilidad</MicroLabel>
        </legend>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {FACT_FLAGS.map((item) =>
            flag(item.key, item.label, value[item.key] === true, (next) => set({ [item.key]: next }))
          )}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5">
          <MicroLabel>En la entrada</MicroLabel>
        </legend>
        {flag("idRequired", "Seguridad pide la lista de nombres y cédulas", value.idRequired === true, (next) =>
          set({ idRequired: next })
        )}
        {value.idRequired ? (
          <label className="flex items-center gap-2 pl-7 text-meta text-muted-foreground">
            La necesitan
            <Input
              className="w-20 font-terminal tabular-nums"
              inputMode="numeric"
              max={168}
              min={1}
              type="number"
              value={value.idDeadlineHours ?? DEFAULT_ID_DEADLINE_HOURS}
              onChange={(event) => set({ idDeadlineHours: Number(event.target.value) || undefined })}
            />
            horas antes
          </label>
        ) : null}
      </fieldset>
      {TEXTS.map((item) => (
        <label key={item.key} className="flex flex-col gap-1.5">
          <MicroLabel>{item.label}</MicroLabel>
          <Input
            maxLength={item.key === "foodRules" || item.key === "avNotes" ? 300 : 200}
            placeholder={item.placeholder}
            value={value[item.key] ?? ""}
            onChange={(event) => set({ [item.key]: event.target.value || undefined })}
          />
        </label>
      ))}
    </div>
  );
}
