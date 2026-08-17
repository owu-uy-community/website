import type { BlogPost } from "../(posts)/posts";

import PostCard from "./PostCard";

export default function PostsGrid({ posts }: { posts: BlogPost[] }) {
  return (
    <ul className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
      {posts.map((post) => (
        <li key={post.slug}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}
