import ReactMarkdown from "react-markdown";

type RichTextProps = {
  content?: string;
};

export function RichText({ content }: RichTextProps) {
  return <ReactMarkdown>{content}</ReactMarkdown>;
}
