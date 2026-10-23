"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { EditorPanel, FieldError } from "components/Admin/panel";
import { SettingsCard, SettingsRow, SettingsSection } from "components/Admin/settings/settings";
import { usePanel } from "components/organizar/shell/context";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Input } from "components/shared/ui/input";
import { RadioGroup, RadioGroupItem } from "components/shared/ui/radio-group";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { PLATFORM_LABELS } from "lib/orpc/assets/schemas";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Next = "queda" | "invitar" | "buscar";
const STEPS = ["¿Quién sigue?", "Cuentas y accesos", "Salir"] as const;

/**
 * "Salir del equipo", as a handover: who carries on (someone who stays, someone invited now, or
 * the community marked as looking for organizers), the accounts to pass on, then leaving. The last
 * owner can't start it: they hand the community over first.
 */
export function LeaveTeam({ communityId, communityName }: { communityId: string; communityName: string }) {
  const router = useRouter();
  const { current, can } = usePanel();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [next, setNext] = useState<Next>("queda");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [passed, setPassed] = useState<string[]>([]);
  const input = { communityId };
  const owner = current?.role === "owner";
  // Only owners can be the last one; they hold member:read, so they see how many there are
  const members = useQuery(orpc.communities.members.list.queryOptions({ input: owner ? input : skipToken }));
  const lastOwner = owner && (members.data?.filter((member) => member.role === "owner").length ?? 1) <= 1;
  const organizers = useQuery(
    orpc.insights.organizers.queryOptions({ input: open && can("event:stats") ? input : skipToken })
  );
  const assets = useQuery(orpc.assets.list.queryOptions({ input: open && can("member:read") ? input : skipToken }));
  const me = useQuery({ ...orpc.access.me.queryOptions(), enabled: open });
  const others = (organizers.data?.people ?? []).filter((person) => person.userId !== me.data?.id);

  const leave = useMutation(
    orpc.communities.members.leave.mutationOptions({
      onSuccess: () => {
        toast.success("Saliste del equipo", `Ya no sos parte de ${communityName}.`);
        router.push("/organizar/panel");
        // The panel's layout lists the communities: it has to forget this one.
        router.refresh();
      },
      onError: (failure) => setError(failure.message),
    })
  );
  const invite = useMutation(orpc.communities.members.add.mutationOptions());
  const lookFor = useMutation(orpc.communities.update.mutationOptions());
  const busy = leave.isPending || invite.isPending || lookFor.isPending;

  const choices: { value: Next; label: string; hint: string }[] = [
    ...(others.length > 0
      ? [
          {
            value: "queda" as const,
            label: "Ya queda quien siga",
            hint: `En el equipo siguen ${others.map((person) => person.name).join(", ")}.`,
          },
        ]
      : []),
    ...(can("member:create")
      ? [{ value: "invitar" as const, label: "Invitar a alguien", hint: "Le llega un mail para sumarse como editor." }]
      : []),
    ...(can("organization:update")
      ? [
          {
            value: "buscar" as const,
            label: "Marcar que buscamos organizadores",
            hint: "Se ve en el perfil de la comunidad y en la página para pedir organizarla.",
          },
        ]
      : []),
  ];
  const choice = choices.some((item) => item.value === next) ? next : choices[0]?.value;

  const forward = async () => {
    setError(undefined);
    try {
      if (step === 0 && choice === "invitar") {
        if (!EMAIL.test(email.trim())) return setError("Escribí su email: le llega la invitación ahí");
        await invite.mutateAsync({ communityId, email: email.trim(), role: "editor" });
        toast.success("Invitación enviada", `${email.trim()} va a poder sumarse a ${communityName}.`);
      }
      if (step === 0 && choice === "buscar") {
        await lookFor.mutateAsync({ communityId, data: { status: "busca-organizadores" } });
        toast.success("Listo: busca organizadores", "Lo dice su perfil en owu.uy.");
      }
    } catch (failure) {
      return setError(failure instanceof Error ? failure.message : "No se pudo. Probá de nuevo.");
    }
    if (step === 2) return leave.mutate(input);
    setStep(step + 1);
  };

  const accounts = assets.data ?? [];

  return (
    <SettingsSection className="mt-8" id="salir" title="Salir">
      <SettingsCard>
        <SettingsRow
          compact
          hint={
            lastOwner
              ? "Pasá la propiedad a otra persona primero: en Miembros, hacé dueño a alguien más."
              : `Dejás de ver el panel de ${communityName}. Antes, te ayudamos a dejar a alguien a cargo.`
          }
          label="Salir del equipo"
        >
          <Button
            aria-describedby={lastOwner ? "leave-blocked" : undefined}
            disabled={lastOwner || members.isPending}
            size="sm"
            variant="destructive"
            onClick={() => {
              setStep(0);
              setPassed([]);
              setError(undefined);
              setOpen(true);
            }}
          >
            <LogOut />
            Salir
          </Button>
        </SettingsRow>
        {lastOwner ? (
          <p className="sr-only" id="leave-blocked">
            Sos la única persona dueña: pasá la propiedad a otra persona primero.
          </p>
        ) : null}
      </SettingsCard>

      <EditorPanel
        actions={
          <>
            <Button
              disabled={busy}
              type="button"
              variant="ghost"
              onClick={() => (step === 0 ? setOpen(false) : setStep(step - 1))}
            >
              Volver
            </Button>
            <Button
              disabled={busy}
              type="button"
              variant={step === 2 ? "destructive" : "default"}
              onClick={() => void forward()}
            >
              {step === 2
                ? leave.isPending
                  ? "Saliendo…"
                  : "Salir del equipo"
                : step === 0 && choice === "invitar"
                  ? "Invitar y seguir"
                  : step === 0 && choice === "buscar"
                    ? "Marcar y seguir"
                    : "Siguiente"}
            </Button>
          </>
        }
        busy={busy}
        description={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
        icon={LogOut}
        open={open}
        title={`Salir de ${communityName}`}
        onOpenChange={setOpen}
      >
        <div className="space-y-4">
          {step === 0 ? (
            choices.length > 0 ? (
              <RadioGroup
                aria-label="Quién sigue"
                value={choice}
                onValueChange={(value) => {
                  setNext(value as Next);
                  setError(undefined);
                }}
              >
                {choices.map((item) => (
                  <label
                    key={item.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary/40"
                    htmlFor={`leave-${item.value}`}
                  >
                    <RadioGroupItem className="mt-0.5" id={`leave-${item.value}`} value={item.value} />
                    <span className="min-w-0">
                      <span className="block text-ui font-medium text-foreground">{item.label}</span>
                      <span className="block text-meta text-muted-foreground">{item.hint}</span>
                    </span>
                  </label>
                ))}
                {choice === "invitar" ? (
                  <Input
                    aria-describedby="leave-error"
                    aria-label="Email de quien sigue"
                    autoComplete="off"
                    placeholder="su@email.com"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError(undefined);
                    }}
                  />
                ) : null}
              </RadioGroup>
            ) : (
              <p className="text-ui text-foreground">
                Avisale a quien administra {communityName} que te vas, así se ocupan de quién sigue.
              </p>
            )
          ) : null}

          {step === 1 ? (
            accounts.length > 0 ? (
              <>
                <p className="text-ui text-foreground">
                  Antes de irte, pasá el acceso de lo que tengas. Marcá cada una cuando ya esté.
                </p>
                <ul className="space-y-1.5">
                  {accounts.map((asset) => {
                    const id = `passed-${asset.id}`;
                    const mine = asset.holder?.userId === me.data?.id || asset.backup?.userId === me.data?.id;

                    return (
                      <li key={asset.id}>
                        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-1" htmlFor={id}>
                          <Checkbox
                            checked={passed.includes(asset.id)}
                            id={id}
                            onCheckedChange={(checked) =>
                              setPassed((list) =>
                                checked ? [...list, asset.id] : list.filter((item) => item !== asset.id)
                              )
                            }
                          />
                          <span className="min-w-0 text-ui text-foreground">
                            {`Ya le pasé el acceso: ${PLATFORM_LABELS[asset.platform]}`}
                            {asset.label ? <span className="text-muted-foreground">{` · ${asset.label}`}</span> : null}
                            {mine ? (
                              <span className="block text-meta text-warning-foreground">La tenés vos</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-meta text-muted-foreground">
                  {`${passed.length} de ${accounts.length} marcadas. Actualizá quién la tiene en Cuentas y accesos.`}
                </p>
              </>
            ) : (
              <p className="text-ui text-foreground">
                Si tenés acceso a cuentas de la comunidad (Meetup, Instagram, el canal de Slack, el mail), pasáselo a
                alguien del equipo antes de salir.
              </p>
            )
          ) : null}

          {step === 2 ? (
            <p className="text-ui text-foreground">
              {`Dejás de ver el panel de ${communityName}${current ? ` (hoy sos ${current.roleLabel.toLowerCase()})` : ""}. Para volver, alguien del equipo te tiene que sumar.`}
            </p>
          ) : null}
          <FieldError id="leave-error" message={error} />
        </div>
      </EditorPanel>
    </SettingsSection>
  );
}
