import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { describe, expect, test } from "vitest";

import { codeBlockKey } from "#/lib/code-highlight";
import { articleMarkdownSanitizeSchema } from "#/lib/markdown/article-sanitize-schema";

import { extractMarkdownCodeBlocks } from "./extract-code-blocks";

/**
 * Reproduce exactly what `MarkdownArticle`'s `code` component does to derive the
 * `codeBlockKey` it looks a precomputed highlight up by, so we can prove the
 * server extractor produces the same keys.
 */
function renderedCodeBlockKeys(markdown: string): Array<string> {
  const keys: Array<string> = [];
  const components: Components = {
    pre: ({ children }) => createElement("div", null, children),
    code: ({ className, children }) => {
      const text = String(children ?? "").replace(/\n$/, "");
      const match = /language-(\w+)/.exec(className ?? "");
      const language = match?.[1];
      const isBlock = Boolean(className);
      if (isBlock) {
        keys.push(codeBlockKey({ plaintext: text, language }));
      }
      return createElement("code", null, children);
    },
  };

  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeRaw,
          [rehypeSanitize, articleMarkdownSanitizeSchema],
        ],
        components,
      },
      markdown,
    ),
  );
  return keys;
}

function extractedCodeBlockKeys(markdown: string): Array<string> {
  return extractMarkdownCodeBlocks(markdown).map((block) =>
    codeBlockKey({ plaintext: block.plaintext, language: block.language }),
  );
}

describe("extractMarkdownCodeBlocks", () => {
  test("keys match the renderer for fenced blocks with languages", () => {
    const markdown = [
      "# Title",
      "",
      "```ts",
      "const x = 1;",
      "function foo() {",
      "  return x;",
      "}",
      "```",
      "",
      "Some prose with `inline code` that must not be extracted.",
      "",
      "```python",
      "def hello():",
      "    return 'world'",
      "```",
    ].join("\n");

    const extracted = extractMarkdownCodeBlocks(markdown);
    expect(extracted).toEqual([
      {
        language: "ts",
        plaintext: "const x = 1;\nfunction foo() {\n  return x;\n}",
      },
      { language: "python", plaintext: "def hello():\n    return 'world'" },
    ]);
    expect(extractedCodeBlockKeys(markdown)).toEqual(
      renderedCodeBlockKeys(markdown),
    );
  });

  test("keys match for code blocks nested in lists and blockquotes", () => {
    const markdown = [
      "- item with code:",
      "",
      "  ```bash",
      "  echo hello",
      "  ```",
      "",
      "> quoted:",
      ">",
      "> ```json",
      '> { "a": 1 }',
      "> ```",
    ].join("\n");

    expect(extractedCodeBlockKeys(markdown)).toEqual(
      renderedCodeBlockKeys(markdown),
    );
  });

  test("ignores languageless fences (renderer treats them as inline)", () => {
    const markdown = ["```", "plain fenced, no language", "```"].join("\n");
    // The renderer emits no `language-*` class here, so it never mounts a
    // CodeBlockView — the extractor must likewise skip it.
    expect(renderedCodeBlockKeys(markdown)).toEqual([]);
    expect(extractMarkdownCodeBlocks(markdown)).toEqual([]);
  });

  test("empty input yields no blocks", () => {
    expect(extractMarkdownCodeBlocks("")).toEqual([]);
    expect(extractMarkdownCodeBlocks("   \n\n")).toEqual([]);
  });
});
