"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { signIn } from "app/lib/auth-client";
import { AuthHeader, SocialButton, AuthFooter } from "components/shared/Auth";
import { INTERNAL_ROUTES } from "app/lib/constants";

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSocialRegister = async (provider: string) => {
    setIsLoading(provider);
    try {
      await signIn.social({
        provider: provider as "google" | "github" | "linkedin",
        callbackURL: "/", // Redirect after successful registration
      });
    } catch (error) {
      console.error(`Error registering with ${provider}:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <>
      <AuthHeader title="¡Únete a la comunidad!" description="Crea tu cuenta y conoce a los miembros de la comunidad" />

      <Card className="border-zinc-700 bg-zinc-800/50 backdrop-blur-sm">
        <CardHeader className="pb-6 text-center">
          <CardTitle className="text-2xl text-white">Crear cuenta</CardTitle>
          <CardDescription className="text-zinc-400">Elige tu método de registro preferido</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Register Buttons */}
          <SocialButton
            provider="google"
            onClick={() => handleSocialRegister("google")}
            isLoading={isLoading === "google"}
            actionText="register"
            disabled={isLoading !== null}
          />

          <SocialButton
            provider="linkedin"
            onClick={() => handleSocialRegister("linkedin")}
            isLoading={isLoading === "linkedin"}
            actionText="register"
            disabled={isLoading !== null}
          />

          <SocialButton
            provider="github"
            onClick={() => handleSocialRegister("github")}
            isLoading={isLoading === "github"}
            actionText="register"
            disabled={isLoading !== null}
          />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-800 px-2 text-zinc-400">¿Ya tienes una cuenta?</span>
            </div>
          </div>

          {/* Sign In Link */}
          <div className="text-center">
            <Link href={INTERNAL_ROUTES.auth.login}>
              <Button variant="outline" className="h-12 w-full border-zinc-600 bg-transparent uppercase text-white">
                Iniciar sesión
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <AuthFooter actionText="register" />
    </>
  );
}
