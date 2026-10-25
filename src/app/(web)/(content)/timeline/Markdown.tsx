import ReactMarkdown, { type Components } from "react-markdown";

import { cn } from "app/lib/utils";

/*
 * Event descriptions as their sources wrote them: Meetup's are Markdown (bold, links, lists,
 * headings, escapes), the rest plain text, which reads the same. Raw HTML and images are dropped
 * (a description is text; its photos live in the gallery), links open outside, and bare URLs
 * become links: plain CommonMark only links <url>, so they get the brackets first.
 */

const BARE_URL = /(^|[\s(])(https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"])/g;
const linkify = (text: string) => text.replace(BARE_URL, "$1<$2>");

const components: Components = {
  p: ({ node: _node, ...props }) => <p {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      className="break-words text-zinc-100 underline decoration-white/25 underline-offset-4 hover:decoration-yellow-400"
      rel="noopener noreferrer nofollow"
      target="_blank"
    />
  ),
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-zinc-100" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="list-disc space-y-1 pl-5 marker:text-zinc-500" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-5 marker:text-zinc-500" {...props} />,
  // A description's headings are emphasis, not page structure
  h1: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  h2: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  h3: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  h4: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  h5: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  h6: ({ node: _node, ...props }) => <p className="font-semibold text-zinc-100" {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-2 border-white/15 pl-3" {...props} />,
  hr: () => <hr className="border-white/10" />,
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-white/[0.06] px-1 font-terminal text-[0.9em]" {...props} />
  ),
  img: () => null,
};

export default function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <ReactMarkdown components={components} skipHtml>
        {linkify(text)}
      </ReactMarkdown>
    </div>
  );
}
