"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, LogIn, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { signIn } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import CopyField from "components/community/CopyField";
import { buttonClassName, Eyebrow } from "components/community/ui";
import { SITE_URL } from "lib/community/site";
import { orpc } from "lib/orpc";
import { AnswersSchema, type Answers } from "lib/orpc/salary-survey/schemas";
import {
  AMOUNT_RANGE,
  CONTRACTS,
  CURRENCIES,
  DEPARTMENTS,
  EDUCATION,
  EMPLOYERS,
  EXPERIENCE,
  GENDERS,
  labelOf,
  MAX_STACKS,
  MODALITIES,
  ROLES,
  SENIORITIES,
  STACKS,
} from "lib/salary-survey/questions";

type Option = { readonly value: string; readonly label: string };

/** Everything as the inputs hold it; numbers stay strings until the end */
type Draft = {
  role: string;
  seniority: string;
  experience: string;
  stacks: string[];
  employer: string;
  contract: string;
  modality: string;
  department: string;
  currency: string;
  amount: string;
  hoursPerWeek: string;
  gender: string;
  education: string;
};

const EMPTY: Draft = {
  role: "",
  seniority: "",
  experience: "",
  stacks: [],
  employer: "",
  contract: "",
  modality: "",
  department: "",
  currency: "",
  amount: "",
  hoursPerWeek: "40",
  gender: "",
  education: "",
};

const STEPS = ["Tu trabajo", "Tu contratación", "Tu sueldo", "Opcional", "Revisá"] as const;

const toAnswers = (draft: Draft) =>
  AnswersSchema.safeParse({
    ...draft,
    amount: Number(draft.amount.replace(/\D/g, "")),
    hoursPerWeek: Number(draft.hoursPerWeek),
    gender: draft.gender || null,
    education: draft.education || null,
  });

/** Field-level problems for one step; empty when it can move on */
function stepErrors(step: number, draft: Draft): Partial<Record<keyof Draft, string>> {
  const required = (keys: (keyof Draft)[]) =>
    Object.fromEntries(keys.filter((key) => !draft[key] || (Array.isArray(draft[key]) && !draft[key].length)).map((key) => [key, "Elegí una opción"]));

  if (step === 0) return required(["role", "seniority", "experience", "stacks"]);
  if (step === 1) return required(["employer", "contract", "modality", "department"]);
  if (step === 2) {
    const errors: Partial<Record<keyof Draft, string>> = required(["currency"]);
    const amount = Number(draft.amount.replace(/\D/g, ""));
    const range = AMOUNT_RANGE[draft.currency as keyof typeof AMOUNT_RANGE];
    if (!amount) errors.amount = "Poné el monto mensual";
    else if (range && (amount < range.min || amount > range.max)) {
      errors.amount = `Esperamos entre ${range.min.toLocaleString("es-UY")} y ${range.max.toLocaleString("es-UY")} ${draft.currency} por mes`;
    }
    const hours = Number(draft.hoursPerWeek);
    if (!Number.isInteger(hours) || hours < 1 || hours > 80) errors.hoursPerWeek = "Entre 1 y 80 horas";

    return errors;
  }

  return {};
}

function Fieldset({ legend, hint, error, children }: { legend: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3" aria-invalid={error ? true : undefined}>
      <legend className="text-[15px] font-medium text-zinc-100">{legend}</legend>
      {hint ? <p className="-mt-1 text-sm text-zinc-500">{hint}</p> : null}
      {children}
      {error ? (
        <p className="text-sm text-orange-300" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function Choices({
  name,
  options,
  value,
  onChange,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  name: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-2", columns)}>
      {options.map((option) => (
        <label key={option.value} className="group relative cursor-pointer">
          <input
            checked={value === option.value}
            className="peer sr-only"
            name={name}
            type="radio"
            value={option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white/[0.02] px-3.5 py-2.5 text-sm text-zinc-300 transition-colors group-hover:border-line-strong peer-checked:border-yellow-400/60 peer-checked:bg-yellow-400/[0.07] peer-checked:text-zinc-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-400">
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                value === option.value ? "border-yellow-400 bg-yellow-400" : "border-zinc-600"
              )}
            >
              {value === option.value ? <span className="size-1.5 rounded-full bg-zinc-950" /> : null}
            </span>
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function StackChoices({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const full = value.length >= MAX_STACKS;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {STACKS.map((option) => {
        const checked = value.includes(option.value);
        const disabled = full && !checked;

        return (
          <label key={option.value} className={cn("group relative", disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer")}>
            <input
              checked={checked}
              className="peer sr-only"
              disabled={disabled}
              type="checkbox"
              value={option.value}
              onChange={() => onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])}
            />
            <span className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white/[0.02] px-3.5 py-2.5 text-sm text-zinc-300 transition-colors group-hover:border-line-strong peer-checked:border-yellow-400/60 peer-checked:bg-yellow-400/[0.07] peer-checked:text-zinc-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-400">
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  checked ? "border-yellow-400 bg-yellow-400 text-zinc-950" : "border-zinc-600"
                )}
              >
                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const inputClassName =
  "h-11 w-full rounded-lg border border-line bg-white/[0.02] px-3.5 text-[15px] text-zinc-100 tabular-nums outline-none transition-colors placeholder:text-zinc-600 hover:border-line-strong focus-visible:border-yellow-400/60 focus-visible:ring-2 focus-visible:ring-yellow-400/30";

function Thanks() {
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-line bg-ink-elev/60 p-6 sm:p-10">
      <span className="flex size-11 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-400">
        <PartyPopper aria-hidden className="size-5" />
      </span>
      <div className="max-w-xl">
        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-zinc-50">Tu respuesta ya cuenta</h3>
        <p className="mt-3 text-zinc-400">
          Cuantas más personas respondan, más grupos llegan al mínimo para publicarse. Pasale el link a tu equipo: tarda unos 8
          minutos.
        </p>
      </div>
      <CopyField className="max-w-md" label="el link de la encuesta" value={`${SITE_URL}/encuesta-sueldos`} />
    </div>
  );
}

export default function SurveyForm({ slug, signedIn, answered }: { slug: string; signedIn: boolean; answered: boolean }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [isSigningIn, setIsSigningIn] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  const submit = useMutation(orpc.salarySurvey.submit.mutationOptions({ onSuccess: () => router.refresh() }));
  const reason = (submit.error as { data?: { reason?: string } } | null)?.data?.reason;

  if (answered || submit.isSuccess || reason === "already_answered") return <Thanks />;

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-6 rounded-xl border border-line bg-ink-elev/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-xl">
          <Eyebrow>Antes de empezar</Eyebrow>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">
            Entrá con tu cuenta del Slack de OWU. Es solo para que cada persona responda una vez: tu respuesta se guarda sin tu
            usuario.
          </p>
        </div>
        <button
          className={buttonClassName("primary", "lg")}
          disabled={isSigningIn}
          type="button"
          onClick={() => {
            setIsSigningIn(true);
            void signIn.social({ provider: "slack", callbackURL: "/encuesta-sueldos#formulario" }).catch(() => setIsSigningIn(false));
          }}
        >
          <LogIn aria-hidden className="size-4" />
          {isSigningIn ? "Abriendo Slack…" : "Entrar con Slack"}
        </button>
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const goTo = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => {
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading.current?.focus({ preventScroll: true });
    });
  };

  const next = () => {
    const found = stepErrors(step, draft);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    goTo(step + 1);
  };

  const send = () => {
    const parsed = toAnswers(draft);
    if (!parsed.success) {
      const firstStep = [0, 1, 2].find((index) => Object.values(stepErrors(index, draft)).some(Boolean)) ?? 0;
      setErrors(stepErrors(firstStep, draft));
      goTo(firstStep);
      return;
    }
    submit.mutate({ slug, answers: parsed.data as Answers });
  };

  const review: { label: string; value: string; step: number }[] = [
    { label: "Rol", value: labelOf(ROLES, draft.role), step: 0 },
    { label: "Seniority", value: labelOf(SENIORITIES, draft.seniority), step: 0 },
    { label: "Experiencia", value: labelOf(EXPERIENCE, draft.experience), step: 0 },
    { label: "Stacks", value: draft.stacks.map((stack) => labelOf(STACKS, stack)).join(", "), step: 0 },
    { label: "Para quién", value: labelOf(EMPLOYERS, draft.employer), step: 1 },
    { label: "Contratación", value: labelOf(CONTRACTS, draft.contract), step: 1 },
    { label: "Modalidad", value: labelOf(MODALITIES, draft.modality), step: 1 },
    { label: "Departamento", value: labelOf(DEPARTMENTS, draft.department), step: 1 },
    {
      label: "Monto nominal mensual",
      value: draft.amount ? `${Number(draft.amount.replace(/\D/g, "")).toLocaleString("es-UY")} ${draft.currency}` : "",
      step: 2,
    },
    { label: "Horas por semana", value: draft.hoursPerWeek, step: 2 },
    { label: "Género", value: draft.gender ? labelOf(GENDERS, draft.gender) : "Sin responder", step: 3 },
    { label: "Nivel educativo", value: draft.education ? labelOf(EDUCATION, draft.education) : "Sin responder", step: 3 },
  ];

  return (
    <div ref={top} className="scroll-mt-24 overflow-hidden rounded-xl border border-line bg-ink-elev/60">
      <div className="border-b border-line px-5 py-4 sm:px-8">
        <ol className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Pasos">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 font-terminal text-[11px] tracking-[0.1em] uppercase",
                index === step ? "text-yellow-400" : index < step ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              <span>{index < step ? "✓" : `0${index + 1}`}</span>
              <span className={index === step ? "" : "hidden sm:inline"}>{label}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 h-px w-full bg-line">
          <div
            className="h-px bg-yellow-400 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <form
        className="flex flex-col gap-10 px-5 py-8 sm:px-8 sm:py-10"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step < STEPS.length - 1) next();
          else send();
        }}
      >
        <h3 ref={heading} className="text-xl font-semibold tracking-[-0.02em] text-zinc-50 outline-none" tabIndex={-1}>
          {STEPS[step]}
        </h3>

        {step === 0 ? (
          <>
            <Fieldset error={errors.role} legend="¿Cuál es tu rol principal?">
              <Choices name="role" options={ROLES} value={draft.role} onChange={(value) => set("role", value)} />
            </Fieldset>
            <Fieldset error={errors.seniority} legend="¿Qué seniority tenés?">
              <Choices name="seniority" options={SENIORITIES} value={draft.seniority} onChange={(value) => set("seniority", value)} />
            </Fieldset>
            <Fieldset error={errors.experience} legend="¿Cuántos años de experiencia en tech?">
              <Choices
                columns="sm:grid-cols-3 lg:grid-cols-5"
                name="experience"
                options={EXPERIENCE}
                value={draft.experience}
                onChange={(value) => set("experience", value)}
              />
            </Fieldset>
            <Fieldset error={errors.stacks} hint={`Hasta ${MAX_STACKS}, los que más usás.`} legend="¿Con qué trabajás?">
              <StackChoices value={draft.stacks} onChange={(value) => set("stacks", value)} />
            </Fieldset>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Fieldset error={errors.employer} legend="¿Para quién trabajás?">
              <Choices columns="sm:grid-cols-2" name="employer" options={EMPLOYERS} value={draft.employer} onChange={(value) => set("employer", value)} />
            </Fieldset>
            <Fieldset error={errors.contract} legend="¿Cómo te contratan?">
              <Choices name="contract" options={CONTRACTS} value={draft.contract} onChange={(value) => set("contract", value)} />
            </Fieldset>
            <Fieldset error={errors.modality} legend="¿Dónde trabajás?">
              <Choices columns="sm:grid-cols-3" name="modality" options={MODALITIES} value={draft.modality} onChange={(value) => set("modality", value)} />
            </Fieldset>
            <Fieldset error={errors.department} legend="¿En qué departamento vivís?">
              <select
                aria-label="Departamento"
                className={cn(inputClassName, "max-w-xs appearance-none")}
                value={draft.department}
                onChange={(event) => set("department", event.target.value)}
              >
                <option value="">Elegí un departamento</option>
                {DEPARTMENTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Fieldset>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Fieldset error={errors.currency} legend="¿En qué moneda cobrás?">
              <Choices columns="sm:grid-cols-2" name="currency" options={CURRENCIES} value={draft.currency} onChange={(value) => set("currency", value)} />
            </Fieldset>
            <Fieldset
              error={errors.amount}
              hint="Nominal mensual: antes de aportes e impuestos. Si facturás, el promedio que facturás por mes. Sin aguinaldo ni bonos."
              legend="¿Cuánto cobrás por mes?"
            >
              <div className="relative max-w-xs">
                <input
                  aria-label="Monto nominal mensual"
                  autoComplete="off"
                  className={cn(inputClassName, "pr-16")}
                  inputMode="numeric"
                  placeholder={draft.currency === "USD" ? "4.000" : "120.000"}
                  value={draft.amount ? Number(draft.amount.replace(/\D/g, "")).toLocaleString("es-UY") : ""}
                  onChange={(event) => set("amount", event.target.value.replace(/\D/g, "").slice(0, 9))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center font-terminal text-xs text-zinc-500">
                  {draft.currency || "—"}
                </span>
              </div>
            </Fieldset>
            <Fieldset error={errors.hoursPerWeek} legend="¿Cuántas horas trabajás por semana?">
              <input
                aria-label="Horas por semana"
                className={cn(inputClassName, "max-w-[8rem]")}
                inputMode="numeric"
                max={80}
                min={1}
                type="number"
                value={draft.hoursPerWeek}
                onChange={(event) => set("hoursPerWeek", event.target.value)}
              />
            </Fieldset>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="-mt-6 max-w-xl text-sm text-zinc-400">
              Estas dos preguntas ayudan a ver brechas. Podés saltearlas: “Siguiente” sin elegir nada las deja en blanco.
            </p>
            <Fieldset legend="Género">
              <Choices columns="sm:grid-cols-2 lg:grid-cols-4" name="gender" options={GENDERS} value={draft.gender} onChange={(value) => set("gender", value)} />
            </Fieldset>
            <Fieldset legend="Nivel educativo">
              <Choices name="education" options={EDUCATION} value={draft.education} onChange={(value) => set("education", value)} />
            </Fieldset>
          </>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-6">
            <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {review.map(({ label, value, step: target }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">{label}</dt>
                  <dd className="flex items-center gap-3 text-right text-sm text-zinc-100">
                    {value || <span className="text-orange-300">Falta</span>}
                    <button className="text-xs text-zinc-500 underline underline-offset-4 hover:text-yellow-400" type="button" onClick={() => goTo(target)}>
                      Cambiar
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-zinc-500">
              Al enviar, tu respuesta se guarda sin tu usuario. Después no la vamos a poder encontrar para cambiarla.
            </p>
            {submit.isError && reason !== "already_answered" ? (
              <p className="text-sm text-orange-300" role="alert">
                {reason === "survey_closed"
                  ? "La encuesta ya no está recibiendo respuestas."
                  : "No pudimos guardar tu respuesta. Probá de nuevo en un rato."}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-6">
          {step > 0 ? (
            <button className={buttonClassName("ghost", "md")} type="button" onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden className="size-4" />
              Atrás
            </button>
          ) : (
            <span className="font-terminal text-[11px] text-zinc-600">≈ 8 minutos</span>
          )}
          <button className={buttonClassName(step === STEPS.length - 1 ? "accent" : "primary", "md")} disabled={submit.isPending} type="submit">
            {step === STEPS.length - 1 ? (submit.isPending ? "Enviando…" : "Enviar respuesta") : "Siguiente"}
            {step === STEPS.length - 1 ? <Check aria-hidden className="size-4" /> : <ArrowRight aria-hidden className="size-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
