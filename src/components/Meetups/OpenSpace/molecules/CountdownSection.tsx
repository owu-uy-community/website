import { Clock } from "lucide-react";
import { CountdownBadge } from "../atoms/CountdownBadge";

interface CountdownSectionProps {
  seconds: number;
  color: string;
  variant?: "mobile" | "desktop";
}

/**
 * Countdown section showing time until next rotation
 * Reusable component for both mobile and desktop layouts
 */
export function CountdownSection({ seconds, color, variant = "desktop" }: CountdownSectionProps) {
  const isMobile = variant === "mobile";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Clock className={`${isMobile ? "h-3 w-3" : "h-4 w-4"} text-gray-400`} />
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-gray-400">Próxima rotación en</p>
      </div>
      <div className={isMobile ? "w-full max-w-lg" : "w-full"}>
        <CountdownBadge seconds={seconds} color={color} />
      </div>
    </div>
  );
}





