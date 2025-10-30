"use client";

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-zinc-900 group-[.toaster]:text-white group-[.toaster]:border-zinc-700 group-[.toaster]:shadow-2xl",
          title: "group-[.toast]:text-white group-[.toast]:font-semibold",
          description: "group-[.toast]:text-zinc-300",
          actionButton:
            "group-[.toast]:bg-zinc-700 group-[.toast]:text-white group-[.toast]:hover:bg-zinc-600",
          cancelButton:
            "group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-300 group-[.toast]:hover:bg-zinc-700",
          success: "group-[.toast]:bg-green-900 group-[.toast]:border-green-700",
          error: "group-[.toast]:bg-red-900 group-[.toast]:border-red-700",
          warning: "group-[.toast]:bg-yellow-900 group-[.toast]:border-yellow-700",
          info: "group-[.toast]:bg-blue-900 group-[.toast]:border-blue-700",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
