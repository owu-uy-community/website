import Image from "next/image";
import Link from "next/link";

import { Badge, cardClassName } from "components/community/ui";

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
    <Link className={cardClassName(true, "group flex h-full flex-col p-3")} href={`/blog/${post.slug}`}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/[0.04]">
        <Image
          fill
          alt=""
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          src={post.image}
          unoptimized={post.image.startsWith("/blog/og")}
        />
        {post.draft ? <Badge className="absolute top-3 right-3 backdrop-blur">Borrador</Badge> : null}
      </div>
      <div className="flex grow flex-col gap-3 px-3 pt-5 pb-3">
        {post.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
        ) : null}
        <h3 className="font-title text-lg leading-snug font-semibold tracking-[-0.01em] text-white">{post.title}</h3>
        {post.description ? (
          <p className="line-clamp-2 text-[15px] leading-relaxed text-zinc-400">{post.description}</p>
        ) : null}
        <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-2 text-[13px] text-zinc-500">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden>·</span>
          <span>{post.readingMinutes} min de lectura</span>
        </p>
      </div>
    </Link>
  );
}
