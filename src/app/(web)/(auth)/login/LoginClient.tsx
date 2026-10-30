"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "components/shared/ui/card";
import { signIn } from "app/lib/auth-client";
import { AuthHeader, SocialButton, AuthFooter } from "components/shared/Auth";
import { EmailCodeForm } from "components/shared/Auth/EmailCodeForm";
import Link from "next/link";

/** Sign in, then back to `next` (already checked to be a path on this site). */
export function LoginClient({ next }: { next: string }) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(provider);
    try {
      await signIn.social({
        provider: provider as "slack",
        callbackURL: next,
      });
    } catch (error) {
      console.error(`Error logging in with ${provider}:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <>
      <AuthHeader title="¡Qué alegría verte de nuevo!" description="Estás a un paso de entrar a la comunidad de OWU" />

      <Card className="border-zinc-700 bg-zinc-800/50 shadow-xs backdrop-blur-xs">
        <CardHeader className="gap-0 p-5 pb-6 text-center">
          <CardTitle className="text-2xl leading-none tracking-tight text-white">Iniciar sesión</CardTitle>
          <CardDescription className="text-sm text-zinc-400">
            Con el Slack de OWU o con un código por email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <SocialButton
            provider="slack"
            onClick={() => handleSocialLogin("slack")}
            isLoading={isLoading === "slack"}
            actionText="login"
            disabled={isLoading !== null}
          />
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span aria-hidden className="h-px flex-1 bg-zinc-700" />o con tu email
            <span aria-hidden className="h-px flex-1 bg-zinc-700" />
          </div>
          <EmailCodeForm onSignedIn={() => window.location.assign(next)} />
          <CardFooter className="px-5 text-center text-xs text-zinc-400">
            <span className="leading-5">
              ¿Todavía no estás en el Slack de OWU? Sumate en{" "}
              <Link href="https://slack.owu.uy/" className="text-yellow-400 hover:underline">
                slack.owu.uy
              </Link>
            </span>
          </CardFooter>
        </CardContent>
      </Card>

      <AuthFooter actionText="login" />
    </>
  );
}
