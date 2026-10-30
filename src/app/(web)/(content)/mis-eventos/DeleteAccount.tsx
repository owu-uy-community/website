"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient, signOut } from "app/lib/auth-client";
import { buttonClassName, cardClassName } from "components/community/ui";

/** "Borrar mi cuenta": asks once more, then deletes. An old session has to sign in again first. */
export function DeleteAccount() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "deleting" | "stale">("idle");

  const remove = async () => {
    setStep("deleting");
    const { error } = await authClient.deleteUser();
    if (!error) {
      router.replace("/");
      router.refresh();
      return;
    }
    setStep("stale");
  };

  return (
    <section className={cardClassName(false, "flex flex-col gap-3 p-6")}>
      <h2 className="font-title text-lg font-semibold text-white">Borrar mi cuenta</h2>
      {step === "stale" ? (
        <>
          <p className="text-[15px] text-zinc-300">
            Por seguridad, entrá de nuevo (con tu código o con Slack) y volvé a probar.
          </p>
          <button
            className={buttonClassName("secondary", "md", "self-start")}
            type="button"
            onClick={() => void signOut().then(() => router.push("/login?next=/mis-eventos"))}
          >
            Entrar de nuevo
          </button>
        </>
      ) : (
        <>
          <p className="text-[15px] text-zinc-400">
            Se borran tu cuenta y quién sos en cada evento al que te anotaste. Los lugares que tenías pasan a la lista
            de espera. No se puede deshacer.
          </p>
          {step === "idle" ? (
            <button
              className={buttonClassName("secondary", "md", "self-start")}
              type="button"
              onClick={() => setStep("confirm")}
            >
              Borrar mi cuenta
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClassName("primary", "md")}
                disabled={step === "deleting"}
                type="button"
                onClick={() => void remove()}
              >
                {step === "deleting" ? "Borrando…" : "Sí, borrar todo"}
              </button>
              <button className={buttonClassName("ghost", "md")} type="button" onClick={() => setStep("idle")}>
                Cancelar
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
