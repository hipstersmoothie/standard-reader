<script lang="ts">
  import type { InlineNode } from "@standard-reader/renderer-core";

  import { getRenderCtx } from "./context";
  import Inline from "./Inline.svelte";

  let { nodes }: { nodes: Array<InlineNode> } = $props();
  const s = getRenderCtx().components.shared ?? {};
</script>

{#each nodes as node}
  {#if node.type === "text"}{node.value}{:else if node.type === "mark"}
    {#snippet markInner()}<Inline nodes={node.children} />{/snippet}
    {#if node.mark === "strong"}
      {#if s.strong}{@render s.strong({ children: markInner })}{:else}<strong
          >{@render markInner()}</strong
        >{/if}
    {:else if node.mark === "emphasis"}
      {#if s.emphasis}{@render s.emphasis({ children: markInner })}{:else}<em
          >{@render markInner()}</em
        >{/if}
    {:else if node.mark === "code"}
      {#if s.inlineCode}{@render s.inlineCode({ children: markInner })}{:else}<code
          >{@render markInner()}</code
        >{/if}
    {:else if node.mark === "underline"}
      {#if s.underline}{@render s.underline({ children: markInner })}{:else}<u
          >{@render markInner()}</u
        >{/if}
    {:else if node.mark === "strikethrough"}
      {#if s.strikethrough}{@render s.strikethrough({ children: markInner })}{:else}<s
          >{@render markInner()}</s
        >{/if}
    {:else}
      {#if s.highlight}{@render s.highlight({ children: markInner })}{:else}<mark
          >{@render markInner()}</mark
        >{/if}
    {/if}
  {:else if node.type === "link"}
    {#snippet linkInner()}<Inline nodes={node.children} />{/snippet}
    {#if s.link}{@render s.link({ href: node.href, children: linkInner })}{:else}<a
        href={node.href}
        rel="noopener noreferrer nofollow">{@render linkInner()}</a
      >{/if}
  {:else if node.type === "mention"}
    {#snippet mentionInner()}<Inline nodes={node.children} />{/snippet}
    {#if s.mention}{@render s.mention({
        atUri: node.atUri,
        did: node.did,
        children: mentionInner,
      })}{:else}{@render mentionInner()}{/if}
  {:else if node.type === "footnoteRef"}
    {#if s.footnoteReference}{@render s.footnoteReference({
        footnoteId: node.footnoteId,
        number: node.number,
        contentPlaintext: node.contentPlaintext,
      })}{:else if node.number !== null}<sup
        ><a
          id={`fnref-${node.footnoteId}`}
          href={`#fn-${node.footnoteId}`}
          title={node.contentPlaintext || undefined}
          aria-label={`Footnote ${node.number}`}>{node.number}</a
        ></sup
      >{/if}
  {/if}
{/each}
