import { Button } from "components/shared/ui/button";
import { Github, Linkedin } from "lucide-react";

type SocialProvider = "google" | "linkedin" | "github";

interface SocialButtonProps {
  provider: SocialProvider;
  onClick: () => void;
  isLoading: boolean;
  actionText: "login" | "register";
  disabled?: boolean;
}

const GoogleIcon = () => (
  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const providerConfig = {
  google: {
    icon: GoogleIcon,
    name: "Google",
  },
  linkedin: {
    icon: () => <Linkedin className="mr-3 h-5 w-5" />,
    name: "LinkedIn",
  },
  github: {
    icon: () => <Github className="mr-3 h-5 w-5" />,
    name: "GitHub",
  },
};

const getButtonText = (provider: SocialProvider, actionText: "login" | "register") => {
  const providerName = providerConfig[provider].name;
  return actionText === "login" ? `Continuar con ${providerName}` : `Registrarme con ${providerName}`;
};

const getLoadingText = (actionText: "login" | "register") => {
  return actionText === "login" ? "Iniciando sesión..." : "Creando cuenta...";
};

export default function SocialButton({
  provider,
  onClick,
  isLoading,
  actionText,
  disabled = false,
}: SocialButtonProps) {
  const IconComponent = providerConfig[provider].icon;

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="outline"
      className="h-12 w-full border-zinc-600 bg-transparent text-white"
    >
      {isLoading ? (
        <div className="flex items-center">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-yellow-400" />
          {getLoadingText(actionText)}
        </div>
      ) : (
        <>
          <IconComponent />
          {getButtonText(provider, actionText)}
        </>
      )}
    </Button>
  );
}
