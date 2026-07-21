<script lang="ts">
  import type { StandardSiteDocument } from "@standard-reader/renderer-core";

  import StandardDocument from "../StandardDocument.svelte";

  let { document }: { document: StandardSiteDocument } = $props();
</script>

{#snippet poll({ pollUri }: { pollUri: string })}<div data-poll={pollUri}></div
  >{/snippet}

<StandardDocument {document} components={{ leaflet: { poll } }} />
