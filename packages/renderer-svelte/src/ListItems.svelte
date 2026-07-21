<script lang="ts">
  import { segmentInline } from "@standard-reader/renderer-core";
  import type { ListItem } from "@standard-reader/renderer-core";

  import Blocks from "./Blocks.svelte";
  import { getRenderCtx } from "./context";
  import Inline from "./Inline.svelte";

  let { items }: { items: Array<ListItem> } = $props();
  const ctx = getRenderCtx();
  const s = ctx.components.shared ?? {};
</script>

{#each items as item}
  {#snippet itemBody()}
    {#each item.runs as run}<Inline
        nodes={segmentInline(run, ctx.footnoteNumbers)}
      />{/each}
    <Blocks nodes={item.children} />
  {/snippet}
  {#if s.listItem}{@render s.listItem({ children: itemBody })}{:else}<li
      >{@render itemBody()}</li
    >{/if}
{/each}
