"use client";

import { SearchX } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";

import type { BlogPost } from "../(posts)/posts";

import EmptyState, { emptyStateActionClassName } from "./EmptyState";
import PostsGrid from "./PostsGrid";
import SearchField from "./SearchField";
import TagChips from "./TagChips";

const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

// Accent-insensitive matching ("Montaña" matches "montana" and vice versa)
function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

interface PostsExplorerProps {
  posts: BlogPost[];
  tags: string[];
}

export default function PostsExplorer({ posts, tags }: PostsExplorerProps) {
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
  const [tag, setTag] = useQueryState("tag", parseAsString.withDefault(""));

  const term = normalize(query.trim());
  const filtered = posts.filter((post) => {
    if (tag && !post.tags.includes(tag)) return false;
    if (!term) return true;

    return [post.title, post.description ?? "", post.author, ...post.tags].some((field) =>
      normalize(field).includes(term)
    );
  });

  const clearFilters = () => {
    void setQuery(null);
    void setTag(null);
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <SearchField value={query} onChange={(value) => void setQuery(value || null)} />
      <TagChips active={tag} tags={tags} onSelect={(value) => void setTag(value)} />
      {filtered.length === 0 ? (
        <EmptyState
          description={
            term
              ? `No hay posts que coincidan con «${query.trim()}»${tag ? ` en #${tag}` : ""}. Probá con otra búsqueda.`
              : `No hay posts con el tag #${tag} todavía.`
          }
          icon={SearchX}
          title="No encontramos nada"
        >
          <button className={emptyStateActionClassName} type="button" onClick={clearFilters}>
            Limpiar filtros
          </button>
        </EmptyState>
      ) : (
        <div className="flex w-full flex-col gap-6 pt-2">
          <PostsGrid posts={filtered} />
        </div>
      )}
    </div>
  );
}
