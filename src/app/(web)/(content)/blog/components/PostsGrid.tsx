import { Cells } from "components/community/ui";

import type { BlogPost } from "../(posts)/posts";

import PostCard from "./PostCard";

export default function PostsGrid({ posts }: { posts: BlogPost[] }) {
  return (
    <Cells className="sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
    </Cells>
  );
}
