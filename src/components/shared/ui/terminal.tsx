"use client";

import { motion, type MotionProps } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "app/lib/utils";

interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function AnimatedSpan({ children, delay = 0, className, ...props }: AnimatedSpanProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("grid text-sm font-normal tracking-tight", className)}
      initial={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.3, delay: delay / 1000 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

interface TypingAnimationProps extends MotionProps {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: React.ElementType;
}

export function TypingAnimation({
  children,
  className,
  duration = 60,
  delay = 0,
  as: Component = "span",
  ...props
}: TypingAnimationProps) {
  if (typeof children !== "string") {
    throw new Error("TypingAnimation: children must be a string. Received:");
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const MotionComponent = motion.create(Component, {
    forwardMotionProps: true,
  });

  const [displayedText, setDisplayedText] = useState<string>("");
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setStarted(true);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;

    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.substring(0, i + 1));
        i++;
      } else {
        clearInterval(typingEffect);
      }
    }, duration);

    return () => {
      clearInterval(typingEffect);
    };
  }, [children, duration, started]);

  return (
    <MotionComponent ref={elementRef} className={cn("text-sm font-normal tracking-tight", className)} {...props}>
      {displayedText}
    </MotionComponent>
  );
}

interface TerminalProps {
  children: React.ReactNode;
  className?: string;
}

export function Terminal({ children, className }: TerminalProps) {
  return (
    <div className={cn("z-0 h-full max-h-[500px] w-full rounded-xl border border-border bg-gray-900", className)}>
      <div className="flex flex-col gap-y-2 border-b border-border p-4">
        <div className="flex flex-row gap-x-2">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <div className="h-2 w-2 rounded-full bg-green-500" />
        </div>
      </div>
      <pre className="p-4">
        <code className="grid gap-y-1 overflow-auto text-white">{children}</code>
      </pre>
    </div>
  );
}
