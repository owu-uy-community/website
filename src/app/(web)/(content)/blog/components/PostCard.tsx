import Image from "next/image";
import Link from "next/link";

import type { BlogPost } from "../(posts)/posts";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-yellow-400/40 hover:bg-yellow-400/[0.04]"
      href={`/blog/${post.slug}`}
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          alt=""
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(min-width: 1024px) 490px, (min-width: 640px) 50vw, 100vw"
          src={post.image}
          unoptimized={post.image.startsWith("/blog/og")}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {post.tags.length > 0 ? (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-black/60 px-2.5 py-1 font-terminal text-[11px] text-yellow-400 backdrop-blur-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex grow flex-col gap-2 p-5">
        <p className="font-terminal text-xs text-zinc-500">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span> · {post.readingMinutes} min de lectura</span>
        </p>
        <h3 className="font-title text-lg font-bold leading-snug tracking-tight text-white transition-colors group-hover:text-yellow-400">
          {post.title}
        </h3>
        {post.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">{post.description}</p>
        ) : null}
        <p className="mt-auto pt-3 font-terminal text-xs text-zinc-500">Por {post.author}</p>
      </div>
    </Link>
  );
}
