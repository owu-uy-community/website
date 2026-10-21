import { ArrowLeft } from "lucide-react";

import { ButtonLink, Container } from "components/community/ui";

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="owu-furnace pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]" />
      <Container className="max-w-3xl pt-8 pb-20 sm:pt-12 sm:pb-28">
        <ButtonLink className="-ml-3" href="/blog" size="sm" variant="ghost">
          <ArrowLeft aria-hidden className="size-4 transition-transform group-hover/button:-translate-x-0.5" />
          Volver al blog
        </ButtonLink>
        <article className="blog-prose mt-8 w-full">{children}</article>
      </Container>
    </div>
  );
}
