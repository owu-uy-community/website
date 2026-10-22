"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, Copy } from "lucide-react";
import { FaSlack, FaTelegramPlane } from "react-icons/fa";

import { authClient } from "app/lib/auth-client";
import { AuthHeader } from "components/shared/Auth";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

const CARD = "border-zinc-700 bg-zinc-800/50 shadow-xs backdrop-blur-xs";
const FIELD = "border-zinc-600 bg-transparent text-white placeholder:text-zinc-500";

/** The OWU dashboard itself, as the request's "where". */
const OWU = "owu";

const STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "Pendiente", variant: "warning" },
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "Rechazado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "secondary" },
};

/** Better Auth's codes when linking a Slack fails. */
const LINK_ERRORS: Record<string, string> = {
  email_does_not_match: "Ese Slack usa otro email que tu cuenta de OWU, así que no lo pudimos vincular.",
  account_already_linked_to_different_user: "Ese Slack ya está vinculado a otra cuenta de OWU.",
};

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

/** The access page: OWU Slack, requests for access, Telegram. */
export function AccessClient({ bot, linkError }: { bot: string; linkError: string | null }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const me = useQuery({
    ...orpc.access.me.queryOptions(),
    // Waiting for the bot to get the code: the link shows up here on its own.
    refetchInterval: (query) =>
      code && !query.state.data?.telegram && Date.parse(code.expiresAt) > Date.now() ? 4000 : false,
  });
  const communities = useQuery(orpc.communities.list.queryOptions({ input: {} }));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.access.me.key() });

  const [linking, setLinking] = useState(false);
  const linkSlack = async () => {
    setLinking(true);
    const result = await authClient.linkSocial({
      provider: "slack",
      callbackURL: "/acceso",
      errorCallbackURL: "/acceso",
    });
    if (result.error) {
      setLinking(false);
      toast.error("No pudimos abrir Slack", result.error.message ?? "Probá de nuevo.");
    }
  };

  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const request = useMutation(
    orpc.access.request.mutationOptions({
      onSuccess: () => {
        toast.success("Pedido enviado", "Te avisamos por email cuando lo revisen.");
        setTarget("");
        setMessage("");
        refresh();
      },
      onError: (error) => toast.error("No se pudo mandar el pedido", reason(error)),
    })
  );
  const cancel = useMutation(
    orpc.access.cancelRequest.mutationOptions({
      onSuccess: () => {
        toast.success("Pedido cancelado");
        refresh();
      },
      onError: (error) => toast.error("No se pudo cancelar", reason(error)),
    })
  );

  const telegramCode = useMutation(
    orpc.access.telegram.code.mutationOptions({
      onSuccess: setCode,
      onError: (error) => toast.error("No se pudo generar el código", reason(error)),
    })
  );
  const unlinkTelegram = useMutation(
    orpc.access.telegram.unlink.mutationOptions({
      onSuccess: () => {
        setCode(null);
        toast.success("Telegram desvinculado");
        refresh();
      },
      onError: (error) => toast.error("No se pudo desvincular", reason(error)),
    })
  );

  if (me.isPending || me.isError) {
    return (
      <>
        <AuthHeader description="Tu acceso al panel de OWU y a los equipos de las comunidades." title="Acceso" />
        {me.isError ? (
          <Card className={CARD}>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <p className="text-sm text-zinc-300">No pudimos cargar tu acceso.</p>
              <Button disabled={me.isFetching} variant="outline" onClick={() => void me.refetch()}>
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div aria-hidden className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        )}
      </>
    );
  }

  const data = me.data;
  const hasAccess = data.countingRoles.some((role) => role !== "user") || data.communities.length > 0;
  const hasRoles = data.roles.some((role) => role !== "user") || data.communities.length > 0;
  const deadline = new Date(data.owuSlackRequiredFrom);
  const command = code ? `/vincular ${code.code}` : "";
  const options = [
    ...(hasAccess ? [] : [{ value: OWU, label: "Al panel de OWU" }]),
    ...(communities.data ?? [])
      .filter((community) => !data.communities.some((own) => own.id === community.id))
      .map((community) => ({ value: community.id, label: community.name })),
  ];

  return (
    <>
      <AuthHeader
        description={
          hasAccess
            ? "Tu acceso al panel de OWU y a los equipos de las comunidades."
            : "Para organizar con OWU o con una comunidad, entrá con el Slack de OWU y contanos a qué querés acceso."
        }
        title={hasAccess ? "Ya tenés acceso" : "Pedí acceso"}
      />

      <div className="space-y-4">
        {hasAccess ? (
          <Card className={CARD}>
            <CardContent className="flex flex-wrap gap-2 p-5">
              <Button asChild className="flex-1">
                <Link href="/admin">Ir al panel de OWU</Link>
              </Button>
              <Button asChild className="flex-1 border-zinc-600 bg-transparent text-white" variant="outline">
                <Link href="/organizar/panel">Ir a Organizá</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className={CARD}>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <FaSlack aria-hidden className="size-4" />
              Slack de OWU
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0 text-sm text-zinc-300">
            {data.owuSlack ? (
              <p className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-400" />
                Entraste con el Slack de OWU: tus roles cuentan.
              </p>
            ) : (
              <>
                <p>Los roles en OWU (el panel, el equipo de una comunidad) necesitan el Slack de OWU.</p>
                {data.otherSlack ? (
                  <p>El Slack que tenés vinculado es de otro workspace: entrá con el de OWU.</p>
                ) : null}
                {hasRoles ? (
                  <p>
                    {deadline.getTime() > Date.now()
                      ? `Desde el ${format(deadline, "d 'de' MMMM", { locale: es })}, sin él tus roles dejan de contar.`
                      : "Sin él, tus roles no cuentan."}
                  </p>
                ) : null}
                {linkError ? (
                  <p className="text-red-400" role="alert">
                    {LINK_ERRORS[linkError] ?? "No pudimos vincular el Slack. Probá de nuevo."}
                  </p>
                ) : null}
                <Button
                  className="h-11 w-full border-zinc-600 bg-transparent text-white"
                  disabled={linking}
                  variant="outline"
                  onClick={() => void linkSlack()}
                >
                  <FaSlack aria-hidden />
                  {linking ? "Abriendo Slack…" : "Entrar con el Slack de OWU"}
                </Button>
                <p className="text-xs text-zinc-400">
                  ¿Todavía no estás? Sumate en{" "}
                  <Link className="text-yellow-400 hover:underline" href="https://slack.owu.uy/">
                    slack.owu.uy
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={CARD}>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base text-white">¿A qué querés acceso?</CardTitle>
            <CardDescription className="text-zinc-400">
              Lo revisa el equipo de OWU o el de la comunidad. Te avisamos por email.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!target) return;
                request.mutate({ communityId: target === OWU ? null : target, message: message.trim() });
              }}
            >
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="A qué querés acceso" className={`h-11 ${FIELD}`}>
                  <SelectValue placeholder="Elegí el panel o una comunidad" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                aria-label="Mensaje (opcional)"
                className={FIELD}
                maxLength={1000}
                placeholder="Contanos quién sos y qué querés hacer (opcional)"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <Button className="h-11 w-full" disabled={!target || request.isPending} type="submit">
                {request.isPending ? "Enviando…" : "Pedir acceso"}
              </Button>
            </form>

            {data.requests.length > 0 ? (
              <ul className="mt-4 divide-y divide-zinc-700 border-t border-zinc-700">
                {data.requests.map((item) => {
                  const status = STATUS[item.status] ?? { label: item.status, variant: "secondary" };

                  return (
                    <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-white">{item.communityName ?? "Panel de OWU"}</p>
                        <p className="text-xs text-zinc-400">
                          {format(new Date(item.createdAt), "d 'de' MMMM", { locale: es })}
                        </p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {item.status === "pending" ? (
                        <Button
                          className="text-zinc-300"
                          disabled={cancel.isPending && cancel.variables.requestId === item.id}
                          size="sm"
                          variant="ghost"
                          onClick={() => cancel.mutate({ requestId: item.id })}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card className={CARD}>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <FaTelegramPlane aria-hidden className="size-4" />
              Telegram
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Vinculalo y Owy te reconoce cuando le escribís por Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0 text-sm text-zinc-300">
            {data.telegram ? (
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-400" />
                  Tu Telegram está vinculado.
                </p>
                <Button
                  className="text-zinc-300"
                  disabled={unlinkTelegram.isPending}
                  size="sm"
                  variant="ghost"
                  onClick={() => unlinkTelegram.mutate()}
                >
                  Desvincular
                </Button>
              </div>
            ) : code ? (
              <>
                <p>
                  Abrí{" "}
                  <Link
                    className="text-yellow-400 hover:underline"
                    href={`https://t.me/${bot}?start=${code.code}`}
                    target="_blank"
                  >
                    @{bot}
                  </Link>{" "}
                  y tocá «Iniciar», o mandale este mensaje (vence en 10 minutos):
                </p>
                <div className="flex items-start gap-2 rounded-md border border-zinc-600 p-2.5">
                  <code className="min-w-0 flex-1 font-mono text-xs break-all text-white">{command}</code>
                  <Button
                    aria-label="Copiar el mensaje"
                    className="text-zinc-300"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      void navigator.clipboard.writeText(command).then(
                        () => toast.success("Copiado"),
                        () => toast.error("No se pudo copiar")
                      )
                    }
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="text-xs text-zinc-400">
                  Vence a las {format(new Date(code.expiresAt), "HH:mm")}. Cuando Owy lo reciba, se actualiza solo.
                </p>
              </>
            ) : (
              <Button
                className="h-11 w-full border-zinc-600 bg-transparent text-white"
                disabled={telegramCode.isPending}
                variant="outline"
                onClick={() => telegramCode.mutate()}
              >
                <FaTelegramPlane aria-hidden />
                {telegramCode.isPending ? "Generando…" : "Vincular Telegram"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
