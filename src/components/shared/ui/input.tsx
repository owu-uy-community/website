import * as React from "react";

import { cn } from "app/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-gray-600 bg-gray-700 text-white px-3 py-2 text-sm ring-offset-gray-800 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      type={type}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
