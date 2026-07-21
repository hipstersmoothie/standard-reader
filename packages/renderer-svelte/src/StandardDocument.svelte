<script lang="ts">
  import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";
  import type {
    RendererOptions,
    StandardSiteDocument,
  } from "@standard-reader/renderer-core";

  import Blocks from "./Blocks.svelte";
  import { setRenderCtx } from "./context";
  import Inline from "./Inline.svelte";
  import type { SvelteComponents } from "./types";

  let {
    document,
    options,
    components = {},
  }: {
    document: StandardSiteDocument;
    options?: RendererOptions;
    components?: SvelteComponents;
  } = $props();

  const tree = $derived(buildRenderTree(document, options));

  setRenderCtx({
    get components() {
      return components;
    },
    get footnoteNumbers() {
      return tree?.footnoteNumbers ?? new Map<string, number>();
    },
  });

  const s = $derived(components.shared ?? {});
</script>

{#if tree}
  {#snippet body()}
    <Blocks nodes={tree.children} />
    {#if tree.footnotes.length > 0}
      {#snippet fnList()}
        {#each tree.footnotes as fn}
          {#snippet fnItem()}<Inline
              nodes={segmentInline(fn.text, tree.footnoteNumbers)}
            /> <a href={`#fnref-${fn.id}`} aria-label="Back to content">↩</a
            >{/snippet}
          {#if s.footnoteItem}{@render s.footnoteItem({
              id: fn.id,
              number: fn.number,
              children: fnItem,
            })}{:else}<li id={`fn-${fn.id}`} data-number={fn.number}
              >{@render fnItem()}</li
            >{/if}
        {/each}
      {/snippet}
      {#if s.footnotes}{@render s.footnotes({ children: fnList })}{:else}<section
          aria-label="Footnotes"><hr /><ol>{@render fnList()}</ol></section
        >{/if}
    {/if}
  {/snippet}
  {#if s.root}{@render s.root({ children: body })}{:else}<div dir="auto"
      >{@render body()}</div
    >{/if}
{/if}
