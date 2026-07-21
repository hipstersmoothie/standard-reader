<script lang="ts">
  import { segmentInline } from "@standard-reader/renderer-core";
  import type { BlockNode, RichText } from "@standard-reader/renderer-core";

  import Blocks from "./Blocks.svelte";
  import { getRenderCtx } from "./context";
  import Inline from "./Inline.svelte";
  import ListItems from "./ListItems.svelte";

  let { node }: { node: BlockNode } = $props();
  const ctx = getRenderCtx();
  const s = ctx.components.shared ?? {};
  const lf = ctx.components.leaflet ?? {};
  const pk = ctx.components.pckt ?? {};
  const op = ctx.components.offprint ?? {};
  const inline = (text: RichText) => segmentInline(text, ctx.footnoteNumbers);
</script>

{#if node.type === "paragraph"}
  {#snippet body()}<Inline nodes={inline(node.text)} />{/snippet}
  {#if s.paragraph}{@render s.paragraph({
      dropCap: node.dropCap,
      children: body,
    })}{:else}<p data-drop-cap={node.dropCap ? "" : undefined}
      >{@render body()}</p
    >{/if}
{:else if node.type === "heading"}
  {#snippet body()}<Inline nodes={inline(node.text)} />{/snippet}
  {#if s.heading}{@render s.heading({ level: node.level, children: body })}{:else}<svelte:element
      this={`h${Math.min(6, Math.max(1, node.level))}`}>{@render body()}</svelte:element
    >{/if}
{:else if node.type === "blockquote"}
  {#snippet body()}{#each node.paragraphs as p}<p><Inline nodes={inline(p)} /></p
      >{/each}{/snippet}
  {#if s.blockquote}{@render s.blockquote({ children: body })}{:else}<blockquote
      >{@render body()}</blockquote
    >{/if}
{:else if node.type === "callout"}
  {#snippet body()}<Inline nodes={inline(node.text)} />{/snippet}
  {#if s.callout}{@render s.callout({
      emoji: node.emoji,
      color: node.color,
      children: body,
    })}{:else}<aside role="note"
      >{#if node.emoji}<span aria-hidden="true">{node.emoji} </span>{/if}{@render body()}</aside
    >{/if}
{:else if node.type === "horizontalRule"}
  {#if s.horizontalRule}{@render s.horizontalRule()}{:else}<hr />{/if}
{:else if node.type === "bulletList"}
  {#snippet body()}<ListItems items={node.items} />{/snippet}
  {#if s.bulletList}{@render s.bulletList({ children: body })}{:else}<ul
      >{@render body()}</ul
    >{/if}
{:else if node.type === "orderedList"}
  {#snippet body()}<ListItems items={node.items} />{/snippet}
  {#if s.orderedList}{@render s.orderedList({
      start: node.start,
      children: body,
    })}{:else}<ol start={node.start}>{@render body()}</ol>{/if}
{:else if node.type === "taskList"}
  {#snippet body()}{#each node.items as item}
      {#snippet itemBody()}<input
          type="checkbox"
          checked={item.checked}
          readonly
          disabled
        /> {#each item.runs as run}<Inline nodes={inline(run)} />{/each}{/snippet}
      {#if s.taskListItem}{@render s.taskListItem({
          checked: item.checked,
          children: itemBody,
        })}{:else}<li>{@render itemBody()}</li>{/if}
    {/each}{/snippet}
  {#if s.taskList}{@render s.taskList({ children: body })}{:else}<ul
      >{@render body()}</ul
    >{/if}
{:else if node.type === "code"}
  {#if s.code}{@render s.code({ code: node.code, language: node.language })}{:else}<pre><code
        class={node.language ? `language-${node.language}` : undefined}
        >{node.code}</code
      ></pre>{/if}
{:else if node.type === "image"}
  {#if s.image}{@render s.image({
      src: node.src,
      alt: node.alt,
      aspectRatio: node.aspectRatio,
      fullBleed: node.fullBleed,
      caption: node.caption,
    })}{:else}<figure>
      <img
        src={node.src}
        alt={node.alt}
        referrerpolicy="no-referrer"
        loading="lazy"
      />{#if node.caption}<figcaption>{node.caption}</figcaption>{/if}
    </figure>{/if}
{:else if node.type === "iframe"}
  {#if s.iframe}{@render s.iframe({
      url: node.url,
      height: node.height,
      aspectRatio: node.aspectRatio,
    })}{:else}<iframe
      src={node.url}
      height={node.height}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      title="Embedded content"
    ></iframe>{/if}
{:else if node.type === "website"}
  {#if s.website}{@render s.website({
      src: node.src,
      title: node.title,
      description: node.description,
      previewImage: node.previewImage,
    })}{:else}<a href={node.src} rel="noopener noreferrer nofollow"
      ><span>{node.title || node.src}</span>{#if node.description}<span
          >{node.description}</span
        >{/if}</a
    >{/if}
{:else if node.type === "table"}
  {#if s.table}{@render s.table({ rows: node.rows })}{:else}<table><tbody
        >{#each node.rows as row}<tr
            >{#each row as cell}{#if cell.header}<th scope="col"
                  ><Inline nodes={inline(cell.text)} /></th
                >{:else}<td><Inline nodes={inline(cell.text)} /></td>{/if}{/each}</tr
          >{/each}</tbody
      ></table
    >{/if}
{:else if node.type === "math"}
  {#if s.math}{@render s.math({ tex: node.tex })}{:else}<code data-tex=""
      >{node.tex}</code
    >{/if}
{:else if node.type === "button"}
  {#if s.button}{@render s.button({
      text: node.text,
      href: node.href,
      caption: node.caption,
      alignment: node.alignment,
    })}{:else}<span
      ><a href={node.href} rel="noopener noreferrer nofollow">{node.text}</a
      >{#if node.caption}<small>{node.caption}</small>{/if}</span
    >{/if}
{:else if node.type === "blueskyEmbed"}
  {#if s.blueskyEmbed}{@render s.blueskyEmbed({ postUri: node.postUri })}{:else}<a
      data-bluesky-embed={node.postUri}
      href={node.postUri}>{node.postUri}</a
    >{/if}
{:else if node.type === "imageGrid" || node.type === "imageCarousel"}
  {#if node.type === "imageGrid" && s.imageGrid}{@render s.imageGrid({
      images: node.images,
      caption: node.caption,
      layout: node.layout,
    })}{:else if node.type === "imageCarousel" && s.imageCarousel}{@render s.imageCarousel(
      { images: node.images, caption: node.caption, layout: node.layout },
    )}{:else}<figure
      >{#each node.images as image}<img
          src={image.src}
          alt={image.alt}
          referrerpolicy="no-referrer"
          loading="lazy"
        />{/each}{#if node.caption}<figcaption>{node.caption}</figcaption
        >{/if}</figure
    >{/if}
{:else if node.type === "imageDiff"}
  {#if s.imageDiff}{@render s.imageDiff({
      before: node.before,
      after: node.after,
      caption: node.caption,
      labels: node.labels,
    })}{:else}<figure
      ><img
        src={node.before.src}
        alt={node.before.alt || node.labels?.[0] || ""}
        referrerpolicy="no-referrer"
        loading="lazy"
      /><img
        src={node.after.src}
        alt={node.after.alt || node.labels?.[1] || ""}
        referrerpolicy="no-referrer"
        loading="lazy"
      />{#if node.caption}<figcaption>{node.caption}</figcaption>{/if}</figure
    >{/if}
{:else if node.type === "unknown"}
  {#if s.unknown}{@render s.unknown({ blockType: node.blockType })}{/if}
{:else if node.type === "leaflet.poll"}
  {#if lf.poll}{@render lf.poll({ pollUri: node.pollUri })}{/if}
{:else if node.type === "leaflet.signup"}
  {#if lf.signup}{@render lf.signup()}{/if}
{:else if node.type === "leaflet.separator"}
  {#if lf.separator}{@render lf.separator()}{:else}<hr />{/if}
{:else if node.type === "leaflet.standardSitePost"}
  {#if lf.standardSitePost}{@render lf.standardSitePost({ uri: node.uri })}{/if}
{:else if node.type === "leaflet.standardSitePublication"}
  {#if lf.standardSitePublication}{@render lf.standardSitePublication({
      uri: node.uri,
      cid: node.cid,
      showPublicationTheme: node.showPublicationTheme,
    })}{/if}
{:else if node.type === "leaflet.pageEmbed"}
  {#snippet body()}<Blocks nodes={node.children} />{/snippet}
  {#if lf.pageEmbed}{@render lf.pageEmbed({
      pageId: node.pageId,
      pageType: node.pageType,
      children: body,
    })}{:else}<div data-page-embed="">{@render body()}</div>{/if}
{:else if node.type === "pckt.gallery"}
  {#if pk.gallery}{@render pk.gallery({ ref: node.ref })}{/if}
{:else if node.type === "pckt.noteEmbed"}
  {#if pk.noteEmbed}{@render pk.noteEmbed({ uri: node.uri, cid: node.cid })}{/if}
{:else if node.type === "offprint.component"}
  {#if op.component}{@render op.component({ componentUri: node.componentUri })}{/if}
{/if}
