import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Container } from "components/community/ui";

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="owu-furnace pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" />
      <Container className="max-w-3xl pt-10 pb-20 sm:pt-14 sm:pb-24">
        <Link
          className="group inline-flex items-center gap-1.5 font-terminal text-xs text-zinc-500 transition-colors hover:text-zinc-200"
          href="/blog"
        >
          <ArrowLeft aria-hidden className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Blog
        </Link>
        <article className="blog-prose mt-8 w-full">{children}</article>
      </Container>
    </div>
  );
}
