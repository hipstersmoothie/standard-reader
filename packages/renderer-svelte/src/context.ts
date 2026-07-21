import { getContext, setContext } from "svelte";

import type { SvelteComponents } from "./types";

const KEY = Symbol("standard-reader-render");

export interface RenderCtx {
  components: SvelteComponents;
  footnoteNumbers: ReadonlyMap<string, number>;
}

export function setRenderCtx(ctx: RenderCtx): void {
  setContext(KEY, ctx);
}

export function getRenderCtx(): RenderCtx {
  return getContext(KEY);
}
