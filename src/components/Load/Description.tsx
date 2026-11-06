import "katex/dist/katex.min.css";
import Markdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// netgamut's descriptions are Markdown: Netzschleuder's hold lists, links, footnotes and $math$; others
// inline code. Raw HTML is not rendered. A formula KaTeX cannot read shows as its source, in red.
const components: Components = {
  p: ({ node, ...props }) => <p {...props} className="mt-2 first:mt-0" />,
  ul: ({ node, ...props }) => <ul {...props} className="mt-2 list-disc pl-5" />,
  ol: ({ node, ...props }) => (
    <ol {...props} className="mt-2 list-decimal pl-5" />
  ),
  li: ({ node, ...props }) => <li {...props} className="mt-1" />,
  code: ({ node, ...props }) => (
    <code
      {...props}
      className="rounded bg-neutral-100 px-1 font-mono text-[0.9em]"
    />
  ),
  a: ({ node, href = "", ...props }) =>
    href.startsWith("#") ? (
      // A footnote link: the dialog has no page to jump in.
      <span {...props} />
    ) : (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-words text-blue-600 underline-offset-2 hover:underline"
      />
    ),
  section: ({ node, ...props }) => (
    <section
      {...props}
      className="mt-3 border-t border-neutral-200 pt-1 text-[11px] text-neutral-500"
    />
  ),
};

/** A catalog description, rendered from its Markdown. */
export default function Description({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed text-neutral-700">
      <Markdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: true }],
        ]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: "ignore" }],
        ]}
        remarkRehypeOptions={{
          footnoteLabelProperties: { className: ["sr-only"] },
        }}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
}
