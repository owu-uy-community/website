/**
 * Centralized toast utility using Sonner
 * 
 * This provides a clean, reusable API for showing toast notifications
 * throughout the application with consistent styling.
 */

import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const toast = {
  /**
   * Show a success toast
   */
  success: (titleOrOptions: string | ToastOptions, description?: string) => {
    if (typeof titleOrOptions === "string") {
      sonnerToast.success(titleOrOptions, {
        description,
      });
    } else {
      sonnerToast.success(titleOrOptions.title, {
        description: titleOrOptions.description,
        duration: titleOrOptions.duration,
        action: titleOrOptions.action,
      });
    }
  },

  /**
   * Show an error toast
   */
  error: (titleOrOptions: string | ToastOptions, description?: string) => {
    if (typeof titleOrOptions === "string") {
      sonnerToast.error(titleOrOptions, {
        description,
      });
    } else {
      sonnerToast.error(titleOrOptions.title, {
        description: titleOrOptions.description,
        duration: titleOrOptions.duration,
        action: titleOrOptions.action,
      });
    }
  },

  /**
   * Show an info toast
   */
  info: (titleOrOptions: string | ToastOptions, description?: string) => {
    if (typeof titleOrOptions === "string") {
      sonnerToast.info(titleOrOptions, {
        description,
      });
    } else {
      sonnerToast.info(titleOrOptions.title, {
        description: titleOrOptions.description,
        duration: titleOrOptions.duration,
        action: titleOrOptions.action,
      });
    }
  },

  /**
   * Show a warning toast
   */
  warning: (titleOrOptions: string | ToastOptions, description?: string) => {
    if (typeof titleOrOptions === "string") {
      sonnerToast.warning(titleOrOptions, {
        description,
      });
    } else {
      sonnerToast.warning(titleOrOptions.title, {
        description: titleOrOptions.description,
        duration: titleOrOptions.duration,
        action: titleOrOptions.action,
      });
    }
  },

  /**
   * Show a loading toast
   */
  loading: (titleOrOptions: string | ToastOptions, description?: string) => {
    if (typeof titleOrOptions === "string") {
      return sonnerToast.loading(titleOrOptions, {
        description,
      });
    } else {
      return sonnerToast.loading(titleOrOptions.title, {
        description: titleOrOptions.description,
        duration: titleOrOptions.duration,
      });
    }
  },

  /**
   * Show a default toast (backward compatibility)
   */
  default: (options: {
    title?: string;
    description?: string;
    variant?: "default" | "destructive" | "success";
    className?: string;
    duration?: number;
  }) => {
    const { title, description, variant, className, duration } = options;

    // Map old variant system to new toast types
    if (variant === "destructive") {
      sonnerToast.error(title, {
        description,
        duration,
        className,
      });
    } else if (variant === "success") {
      sonnerToast.success(title, {
        description,
        duration,
        className,
      });
    } else {
      sonnerToast(title, {
        description,
        duration,
        className,
      });
    }
  },

  /**
   * Dismiss a toast by ID
   */
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },

  /**
   * Custom toast with full control
   */
  custom: sonnerToast,
};

