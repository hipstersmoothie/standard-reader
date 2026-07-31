import { isValidElement } from "react";
import type { ReactNode } from "react";

/**
 * Split the opening character off a React node, keeping the remainder intact —
 * including any inline markup that follows.
 *
 * The drop-cap handler enlarges a paragraph's first letter and floats it. The
 * previous approach stringified the whole paragraph, which turned an opening
 * link/bold/code element into `"[object Object]"`, so it bailed out whenever the
 * paragraph carried inline markup. That made the drop cap skip past the first
 * paragraph onto a later plain-text one. Splitting instead lets the caller lift
 * only the first character and render the rest (markup and all) untouched.
 *
 * Returns `null` when the node has no plain leading character — either it is
 * empty or it opens with a React element (a link, an image, …). In that case
 * there is no bare letter to enlarge.
 */
export function splitLeadingChar(
  node: ReactNode,
): { first: string; rest: ReactNode } | null {
  if (typeof node === "string") {
    if (node.length === 0) return null;
    const chars = [...node];
    return { first: chars[0], rest: chars.slice(1).join("") };
  }
  if (typeof node === "number") {
    const chars = [...String(node)];
    return { first: chars[0], rest: chars.slice(1).join("") };
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      if (
        child === null ||
        child === undefined ||
        typeof child === "boolean" ||
        child === ""
      ) {
        continue;
      }
      const split = splitLeadingChar(child);
      if (split === null) return null;
      return { first: split.first, rest: [split.rest, ...node.slice(i + 1)] };
    }
    return null;
  }
  // React element (link, bold, image, …) — no plain leading character.
  return null;
}

/**
 * Whether a React node contains any rendered text. Used to tell a prose
 * paragraph (which should claim the drop cap slot) from a media-only paragraph
 * such as a lone image (which should leave the slot for the first real prose).
 */
export function reactNodeHasText(node: ReactNode): boolean {
  if (typeof node === "string") return node.trim().length > 0;
  if (typeof node === "number") return true;
  if (Array.isArray(node)) return node.some((child) => reactNodeHasText(child));
  if (isValidElement(node)) {
    const { children } = node.props as { children?: ReactNode };
    return reactNodeHasText(children);
  }
  return false;
}
