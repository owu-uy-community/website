import Link from "next/link";
import { INTERNAL_ROUTES } from "app/lib/constants";

type AuthFooterProps = {
  actionText: "login" | "register";
};

export default function AuthFooter({ actionText }: AuthFooterProps) {
  const footerText =
    actionText === "login" ? "Al iniciar sesión, aceptas nuestros" : "Al crear una cuenta, aceptas nuestros";

  return (
    <div className="mt-8 text-balance text-center text-sm text-zinc-400">
      {footerText}{" "}
      <Link href={INTERNAL_ROUTES.legal.terms} className="text-yellow-400 hover:underline">
        Términos de Servicio
      </Link>{" "}
      y la{" "}
      <Link href={INTERNAL_ROUTES.legal.privacy} className="text-yellow-400 hover:underline">
        Política de Privacidad
      </Link>{" "}
      de la comunidad OWU Uruguay.
    </div>
  );
}
