import { Button } from "components/shared/ui/button";
import { SlackIcon } from "lucide-react";

type SocialProvider = "slack";

interface SocialButtonProps {
  provider: SocialProvider;
  onClick: () => void;
  isLoading: boolean;
  actionText: "login" | "register";
  disabled?: boolean;
}

const providerConfig = {
  slack: {
    icon: SlackIcon,
    name: "Slack",
  },
};

const getButtonText = (provider: SocialProvider, actionText: "login" | "register") => {
  const providerName = providerConfig[provider]?.name;
  return actionText === "login" ? `Continuar con ${providerName}` : `Registrarme con ${providerName} de OWU`;
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
  const IconComponent = providerConfig[provider]?.icon;

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
          <IconComponent className="mr-2 h-5 w-5" />
          {getButtonText(provider, actionText)}
        </>
      )}
    </Button>
  );
}
