import Image from "next/image";
import Link from "next/link";

import { Badge } from "components/community/ui";

import type { BlogPost } from "../(posts)/posts";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-ink-elev/60 transition-colors duration-200 hover:border-line-strong hover:bg-white/[0.03]"
      href={`/blog/${post.slug}`}
    >
      <div className="relative aspect-video w-full overflow-hidden border-b border-line">
        <Image
          fill
          alt=""
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          sizes="(min-width: 1024px) 560px, (min-width: 640px) 50vw, 100vw"
          src={post.image}
          unoptimized={post.image.startsWith("/blog/og")}
        />
        {post.draft ? (
          <Badge className="absolute top-3 right-3 bg-ink/80" tone="orange">
            Borrador
          </Badge>
        ) : null}
      </div>
      <div className="flex grow flex-col gap-2.5 p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-x-2 font-terminal text-[11px] text-zinc-500">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden>·</span>
          <span>{post.readingMinutes} min de lectura</span>
        </p>
        <h3 className="text-lg leading-snug font-semibold tracking-[-0.02em] text-zinc-50">{post.title}</h3>
        {post.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">{post.description}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 font-terminal text-[11px] text-zinc-500">
          <span className="text-zinc-400">{post.author}</span>
          {post.tags.slice(0, 3).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
