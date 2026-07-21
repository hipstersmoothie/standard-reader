<script lang="ts">
  import type { BlockNode } from "@standard-reader/renderer-core";

  import Block from "./Block.svelte";

  let { nodes }: { nodes: Array<BlockNode> } = $props();
</script>

{#each nodes as node}<Block {node} />{/each}
