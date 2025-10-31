"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import SocialLinks from "./SocialLinks";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border border-blue-900/30 bg-[#0a0e1a] p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-yellow-400 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-6 w-6 text-gray-400 hover:text-yellow-400" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col space-y-1.5 text-center sm:text-left" {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className="text-2xl font-bold leading-none tracking-tight text-yellow-400"
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className="text-base leading-relaxed text-gray-300" {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

type Speaker = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  company?: string;
  github?: string;
  linkedin?: string;
  x?: string;
};

type SpeakerModalProps = {
  trigger: React.ReactNode;
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  company?: string;
  github?: string;
  linkedin?: string;
  x?: string;
  talkTitle?: string;
  talkDescription?: string;
  allSpeakers?: Speaker[]; // All speakers for this talk
};

export default function SpeakerModal({
  trigger,
  firstname,
  lastname,
  picture,
  jobTitle,
  company,
  github,
  linkedin,
  x,
  talkTitle,
  talkDescription,
  allSpeakers,
}: SpeakerModalProps) {
  const initialSpeaker = {
    firstname,
    lastname,
    picture,
    jobTitle,
    company,
    github,
    linkedin,
    x,
  };

  const [currentSpeaker, setCurrentSpeaker] = React.useState<Speaker>(initialSpeaker);

  const fullName = `${currentSpeaker.firstname} ${currentSpeaker.lastname}`;
  const imageSrc = currentSpeaker.picture?.url || "/images/events/placeholder.webp";
  const hasMultipleSpeakers = allSpeakers && allSpeakers.length > 1;

  // Reset to initial speaker when modal opens
  React.useEffect(() => {
    setCurrentSpeaker(initialSpeaker);
  }, [firstname, lastname]);

  const handleSpeakerClick = (speaker: Speaker) => {
    setCurrentSpeaker(speaker);
  };

  // Reset to initial speaker when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCurrentSpeaker(initialSpeaker);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center">
            {/* Avatar Container - Primary + Secondary */}
            <div className="relative mr-4 flex h-20 shrink-0 items-center">
              {/* Primary Speaker (Current) */}
              <div
                className="relative h-20 w-20 cursor-pointer transition-transform hover:scale-105"
                onClick={() => handleSpeakerClick(currentSpeaker)}
                title={fullName}
              >
                <div className="absolute inset-0 rounded-full bg-white/10 p-[2px]">
                  <div className="h-full w-full overflow-hidden rounded-full bg-[#000214]/50">
                    <Image
                      src={imageSrc}
                      alt={fullName}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Other Speakers (Secondary) - Overlapping small avatars at bottom */}
              {hasMultipleSpeakers && (
                <>
                  {allSpeakers
                    .filter((speaker) => `${speaker.firstname} ${speaker.lastname}` !== fullName)
                    .map((speaker, index) => {
                      const speakerImageSrc = speaker.picture?.url || "/images/events/placeholder.webp";
                      const speakerFullName = `${speaker.firstname} ${speaker.lastname}`;
                      const otherSpeakers = allSpeakers.filter((s) => `${s.firstname} ${s.lastname}` !== fullName);
                      return (
                        <div
                          key={index}
                          className="group/avatar relative -ml-4 cursor-pointer self-end"
                          title={speakerFullName}
                          style={{
                            zIndex: otherSpeakers.length - index,
                          }}
                          onClick={() => handleSpeakerClick(speaker)}
                        >
                          <div className="h-12 w-12 rounded-full bg-[#0a0e1a] p-[2px] opacity-70 transition-all group-hover/avatar:z-50 group-hover/avatar:scale-110 group-hover/avatar:opacity-100">
                            <div className="h-full w-full overflow-hidden rounded-full bg-white/10 p-[2px]">
                              <div className="h-full w-full overflow-hidden rounded-full bg-[#000214]">
                                <Image
                                  src={speakerImageSrc}
                                  alt={speakerFullName}
                                  width={48}
                                  height={48}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </div>
                          </div>
                          {/* Tooltip on hover */}
                          <div className="pointer-events-none absolute -bottom-8 left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-gray-300 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                            {speakerFullName}
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>

            {/* Speaker Info */}
            <div className="flex-1">
              <DialogTitle className="mb-1">{fullName}</DialogTitle>
              <div className="flex flex-col gap-0.5">
                {currentSpeaker.jobTitle && <p className="text-sm text-gray-300">{currentSpeaker.jobTitle}</p>}
                {currentSpeaker.company && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {currentSpeaker.company}
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Talk Information */}
        {talkTitle && (
          <div className="space-y-4 border-t border-blue-900/30 pt-4">
            <div>
              <h3 className="mb-2 text-xl font-bold text-yellow-400">{talkTitle}</h3>
              {talkDescription && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    className="text-sm leading-relaxed text-gray-300"
                    components={{
                      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold text-yellow-400">{children}</strong>,
                      em: ({ children }) => <em className="italic text-gray-200">{children}</em>,
                      ul: ({ children }) => <ul className="mb-3 list-inside list-disc space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-3 list-inside list-decimal space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-300">{children}</li>,
                      h1: ({ children }) => (
                        <h1 className="mb-2 mt-4 text-2xl font-bold text-yellow-400">{children}</h1>
                      ),
                      h2: ({ children }) => <h2 className="mb-2 mt-3 text-xl font-bold text-yellow-400">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-2 mt-3 text-lg font-bold text-yellow-400">{children}</h3>,
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300"
                        >
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-3 border-l-4 border-yellow-400/50 pl-4 italic text-gray-400">
                          {children}
                        </blockquote>
                      ),
                      code: ({ children }) => (
                        <code className="rounded bg-blue-900/30 px-1.5 py-0.5 text-sm text-yellow-400">{children}</code>
                      ),
                    }}
                  >
                    {talkDescription}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Social Links - Only for current speaker */}
        {(currentSpeaker.github || currentSpeaker.linkedin || currentSpeaker.x) && (
          <div className="flex gap-4 border-t border-blue-900/30 pt-4">
            <SocialLinks
              github={currentSpeaker.github}
              linkedin={currentSpeaker.linkedin}
              x={currentSpeaker.x}
              speakerName={fullName}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
