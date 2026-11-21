"use client";

import { useState } from "react";

import { authClient } from "app/lib/auth-client";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";

const FIELD = "h-12 border-zinc-600 bg-transparent text-white placeholder:text-zinc-500";

const CODE_ERRORS: Record<string, string> = {
  OTP_EXPIRED: "El código se venció. Pedí uno nuevo.",
  TOO_MANY_ATTEMPTS: "Probaste demasiadas veces. Pedí un código nuevo.",
};

/**
 * Sign in with a 6-digit code sent by email: email → code → (new accounts) name. Calls
 * `onSignedIn` once there is a session with a name.
 */
export function EmailCodeForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<"email" | "code" | "name">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.status === 429
          ? "Pediste varios códigos seguidos. Probá de nuevo en unos minutos."
          : "No pudimos mandarte el código. Revisá el email y probá de nuevo."
      );
      return;
    }
    setCode("");
    setStep("code");
  };

  const verify = async (otp: string) => {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({ email: email.trim(), otp });
    setBusy(false);
    if (result.error) {
      setCode("");
      setError(CODE_ERRORS[result.error.code ?? ""] ?? "Ese código no es correcto.");
      return;
    }
    if (result.data.user.name) onSignedIn();
    else setStep("name");
  };

  const saveName = async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (result.error) setError("No pudimos guardar tu nombre. Probá de nuevo.");
    else onSignedIn();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "email") void sendCode();
        else if (step === "code") void verify(code);
        else void saveName();
      }}
    >
      {step === "email" ? (
        <>
          <label className="sr-only" htmlFor="login-email">
            Email
          </label>
          <Input
            autoComplete="email"
            className={FIELD}
            id="login-email"
            placeholder="tu@email.com"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button className="h-12" disabled={busy} type="submit">
            {busy ? "Enviando…" : "Enviarme un código"}
          </Button>
        </>
      ) : step === "code" ? (
        <>
          <label className="text-sm text-zinc-300" htmlFor="login-code">
            Te mandamos un código a <span className="font-medium text-white">{email.trim()}</span>
          </label>
          <Input
            autoComplete="one-time-code"
            autoFocus
            className={`${FIELD} text-center font-mono text-xl tracking-[0.4em]`}
            id="login-code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="000000"
            required
            value={code}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              if (digits.length === 6 && !busy) void verify(digits);
            }}
          />
          <Button className="h-12" disabled={busy || code.length < 6} type="submit">
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          <div className="flex justify-between text-xs text-zinc-400">
            <button className="hover:text-white" type="button" onClick={() => setStep("email")}>
              Cambiar email
            </button>
            <button className="hover:text-white" disabled={busy} type="button" onClick={() => void sendCode()}>
              Mandarme otro código
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="text-sm text-zinc-300" htmlFor="login-name">
            ¿Cómo te llamás? Así te ven quienes organizan los eventos a los que vas.
          </label>
          <Input
            autoComplete="name"
            autoFocus
            className={FIELD}
            id="login-name"
            maxLength={80}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button className="h-12" disabled={busy || !name.trim()} type="submit">
            Listo
          </Button>
        </>
      )}
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
