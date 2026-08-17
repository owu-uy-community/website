import Link from "next/link";

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link className="w-fit font-terminal text-sm text-zinc-400 transition-colors hover:text-yellow-400" href="/blog">
        ← Volver al blog
      </Link>
      <article className="blog-prose w-full">{children}</article>
    </div>
  );
}
