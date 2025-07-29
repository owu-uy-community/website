"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { UserPlus } from "lucide-react";
import { signIn } from "app/lib/auth-client";
import { AuthHeader, SocialButton, AuthFooter } from "components/shared/Auth";
import { INTERNAL_ROUTES } from "app/lib/constants";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(provider);
    try {
      await signIn.social({
        provider: provider as "google" | "github" | "linkedin",
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
          <CardDescription className="text-zinc-400">Elige tu método de inicio de sesión preferido</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Login Buttons */}
          <SocialButton
            provider="google"
            onClick={() => handleSocialLogin("google")}
            isLoading={isLoading === "google"}
            actionText="login"
            disabled={isLoading !== null}
          />

          <SocialButton
            provider="linkedin"
            onClick={() => handleSocialLogin("linkedin")}
            isLoading={isLoading === "linkedin"}
            actionText="login"
            disabled={isLoading !== null}
          />

          <SocialButton
            provider="github"
            onClick={() => handleSocialLogin("github")}
            isLoading={isLoading === "github"}
            actionText="login"
            disabled={isLoading !== null}
          />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-800 px-2 text-zinc-400">¿No tienes una cuenta?</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <div className="text-center">
            <Link href={INTERNAL_ROUTES.auth.register}>
              <Button className="h-12 w-full bg-yellow-400 text-black hover:bg-yellow-500">
                <UserPlus className="mr-2 h-5 w-5" />
                CREAR CUENTA
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <AuthFooter actionText="login" />
    </>
  );
}
