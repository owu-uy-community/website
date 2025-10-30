"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "app/lib/auth-client";

interface AdminAuthWrapperProps {
  children: React.ReactNode;
}

export function AdminAuthWrapper({ children }: AdminAuthWrapperProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    } else if (!isPending && session) {
      // Check if user has admin role
      if (session.user.role !== "admin") {
        router.push("/");
      }
    }
  }, [session, isPending, router]);

  // While checking authentication, render nothing to avoid flashes
  if (isPending) return null;

  // If not authenticated, don't render children (redirect will happen in useEffect)
  if (!session) {
    return null;
  }

  // Check if user has admin role
  if (session.user.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
