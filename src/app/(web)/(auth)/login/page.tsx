"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "components/shared/ui/card";
import { signIn } from "app/lib/auth-client";
import { AuthHeader, SocialButton, AuthFooter } from "components/shared/Auth";
import Link from "next/link";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(provider);
    try {
      await signIn.social({
        provider: provider as "slack",
        callbackURL: "/", // Redirect after successful login
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

      <Card className="border-zinc-700 bg-zinc-800/50 backdrop-blur-sm">
        <CardHeader className="pb-6 text-center">
          <CardTitle className="text-2xl text-white">Iniciar sesión</CardTitle>
          <CardDescription className="text-zinc-400">Ingresa con tu cuenta de Slack de OWU</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SocialButton
            provider="slack"
            onClick={() => handleSocialLogin("slack")}
            isLoading={isLoading === "slack"}
            actionText="login"
            disabled={isLoading !== null}
          />
          <CardFooter className="text-center text-xs text-zinc-400">
            <span className="leading-5">
              Para iniciar sesión necesitas una cuenta de Slack de OWU.
              <br />
              ¿Aún no tienes una? Podés unirte en{" "}
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
