import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  isTableRowDivider,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown";
import type {
  ElementTransformer,
  TextMatchTransformer,
  Transformer,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $createParagraphNode, $createTextNode } from "lexical";

import { $createImageNode, $isImageNode, ImageNode } from "./nodes/image-node";
import { $createMathNode, $isMathNode, MathNode } from "./nodes/math-node";

/** `---`, `***`, or `___` on its own line. */
export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: "element",
};

/** `![alt](src "title")` — a standalone block image. */
export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null;
    const title = node.getTitle();
    const src = node.getSrc();
    const alt = node.getAltText();
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },
  importRegExp: /!\[([^[]*)\]\(([^() ]+)(?:\s"([^"]*)")?\)/,
  regExp: /!\[([^[]*)\]\(([^() ]+)(?:\s"([^"]*)")?\)$/,
  replace: (textNode, match) => {
    const [, altText, src, title] = match;
    const imageNode = $createImageNode({
      src: src ?? "",
      altText: altText ?? "",
      title: title || undefined,
    });
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match",
};

/** Inline `$…$` math. */
export const MATH_INLINE: TextMatchTransformer = {
  dependencies: [MathNode],
  export: (node) => {
    if (!$isMathNode(node) || !node.isInline()) return null;
    return `$${node.getTex()}$`;
  },
  importRegExp: /\$([^$\n]+?)\$/,
  regExp: /\$([^$\n]+?)\$$/,
  replace: (textNode, match) => {
    const tex = match[1] ?? "";
    textNode.replace($createMathNode({ tex, inline: true }));
  },
  trigger: "$",
  type: "text-match",
};

/** Block `$$…$$` math on its own line. */
export const MATH_BLOCK: ElementTransformer = {
  dependencies: [MathNode],
  export: (node) => {
    if (!$isMathNode(node) || node.isInline()) return null;
    return `$$${node.getTex()}$$`;
  },
  regExp: /^\$\$(.+?)\$\$\s*$/,
  replace: (parentNode, _children, match) => {
    const tex = (match[1] ?? "").trim();
    parentNode.replace($createMathNode({ tex, inline: false }));
  },
  type: "element",
};

const TABLE_ROW_REG_EXP = /^\|(.+)\|\s*$/;

/** Split a GFM row body on unescaped pipes. */
function splitCells(rowBody: string): Array<string> {
  const cells: Array<string> = [];
  let current = "";
  for (let i = 0; i < rowBody.length; i++) {
    const char = rowBody[i];
    if (char === "\\" && rowBody[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function $createCell(text: string): TableCellNode {
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  const paragraph = $createParagraphNode();
  if (text) paragraph.append($createTextNode(text));
  cell.append(paragraph);
  return cell;
}

/** One cell's markdown text: flatten to a single line and escape pipes. */
function exportCell(cell: TableCellNode): string {
  return cell
    .getTextContent()
    .replaceAll(/\r?\n/g, " ")
    .replaceAll("|", String.raw`\|`)
    .trim();
}

/**
 * GFM tables. Import merges consecutive row lines into a single table by
 * appending to the table the previous line already created; the delimiter row
 * (`| --- |`) is consumed and promotes the row above it to a header.
 */
export const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node) => {
    if (!$isTableNode(node)) return null;
    const lines: Array<string> = [];
    let headerEmitted = false;
    for (const row of node.getChildren()) {
      if (!$isTableRowNode(row)) continue;
      // Direct type-guard reference preserves narrowing to TableCellNode[].
      // eslint-disable-next-line unicorn/no-array-callback-reference
      const cells = row.getChildren().filter($isTableCellNode);
      lines.push(`| ${cells.map((cell) => exportCell(cell)).join(" | ")} |`);
      if (!headerEmitted) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        headerEmitted = true;
      }
    }
    return lines.join("\n");
  },
  regExp: TABLE_ROW_REG_EXP,
  replace: (parentNode, _children, match) => {
    const body = match[1] ?? "";
    const previous = parentNode.getPreviousSibling();

    // Delimiter row: promote the header row of the table above, then drop it.
    if (isTableRowDivider(match[0].trim())) {
      if ($isTableNode(previous)) {
        const firstRow = previous.getFirstChild();
        if ($isTableRowNode(firstRow)) {
          for (const cell of firstRow.getChildren()) {
            if ($isTableCellNode(cell)) {
              cell.setHeaderStyles(TableCellHeaderStates.ROW);
            }
          }
        }
      }
      parentNode.remove();
      return;
    }

    const cells = splitCells(body).map((text) => $createCell(text));
    const row = $createTableRowNode();
    for (const cell of cells) row.append(cell);

    let table: TableNode;
    if ($isTableNode(previous)) {
      table = previous;
    } else {
      table = $createTableNode();
      parentNode.insertBefore(table);
    }
    table.append(row);
    parentNode.remove();
  },
  type: "element",
};

/**
 * Full transformer set for markpub (GFM). Ordering matters: block matchers run
 * before generic paragraphs, and text-match transformers (image, inline math)
 * run last so inline patterns inside other blocks still resolve.
 */
export const MARKPUB_TRANSFORMERS: Array<Transformer> = [
  TABLE,
  HORIZONTAL_RULE,
  MATH_BLOCK,
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  IMAGE,
  MATH_INLINE,
  ...TEXT_MATCH_TRANSFORMERS,
];
