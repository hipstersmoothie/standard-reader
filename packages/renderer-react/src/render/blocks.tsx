import type {
  BlockNode,
  ListItem,
  RichText,
  TaskItem,
} from "@standard-reader/renderer-core";

import { useComponents } from "../components/context";
import type { TableRow } from "../types";

export function BlockList({ nodes }: { nodes: Array<BlockNode> }) {
  return (
    <>
      {nodes.map((node, index) => (
        <RenderBlock key={index} node={node} />
      ))}
    </>
  );
}

function Runs({ runs }: { runs: Array<RichText> }) {
  const { shared } = useComponents();
  return (
    <>
      {runs.map((run, index) => (
        <shared.FacetText
          key={index}
          plaintext={run.plaintext}
          facets={run.facets}
        />
      ))}
    </>
  );
}

function ListItemView({ item }: { item: ListItem }) {
  const { shared } = useComponents();
  return (
    <shared.ListItem>
      <Runs runs={item.runs} />
      {item.children.map((child, index) => (
        <RenderBlock key={`child-${index}`} node={child} />
      ))}
    </shared.ListItem>
  );
}

function TaskItemView({ item }: { item: TaskItem }) {
  const { shared } = useComponents();
  return (
    <shared.TaskListItem checked={item.checked}>
      <Runs runs={item.runs} />
    </shared.TaskListItem>
  );
}

function RenderBlock({ node }: { node: BlockNode }) {
  const { shared, leaflet, pckt, offprint } = useComponents();

  switch (node.type) {
    case "paragraph": {
      return (
        <shared.Paragraph dropCap={node.dropCap}>
          <shared.FacetText
            plaintext={node.text.plaintext}
            facets={node.text.facets}
          />
        </shared.Paragraph>
      );
    }
    case "heading": {
      return (
        <shared.Heading level={node.level}>
          <shared.FacetText
            plaintext={node.text.plaintext}
            facets={node.text.facets}
          />
        </shared.Heading>
      );
    }
    case "blockquote": {
      return (
        <shared.Blockquote>
          {node.paragraphs.map((text, index) => (
            <shared.Paragraph key={index}>
              <shared.FacetText
                plaintext={text.plaintext}
                facets={text.facets}
              />
            </shared.Paragraph>
          ))}
        </shared.Blockquote>
      );
    }
    case "callout": {
      return (
        <shared.Callout emoji={node.emoji} color={node.color}>
          <shared.FacetText
            plaintext={node.text.plaintext}
            facets={node.text.facets}
          />
        </shared.Callout>
      );
    }
    case "horizontalRule": {
      return <shared.HorizontalRule />;
    }
    case "bulletList": {
      return (
        <shared.BulletList>
          {node.items.map((item, index) => (
            <ListItemView key={index} item={item} />
          ))}
        </shared.BulletList>
      );
    }
    case "orderedList": {
      return (
        <shared.OrderedList start={node.start}>
          {node.items.map((item, index) => (
            <ListItemView key={index} item={item} />
          ))}
        </shared.OrderedList>
      );
    }
    case "taskList": {
      return (
        <shared.TaskList>
          {node.items.map((item, index) => (
            <TaskItemView key={index} item={item} />
          ))}
        </shared.TaskList>
      );
    }
    case "code": {
      return <shared.Code code={node.code} language={node.language} />;
    }
    case "image": {
      return (
        <shared.Image
          src={node.src}
          alt={node.alt}
          aspectRatio={node.aspectRatio}
          fullBleed={node.fullBleed}
          caption={node.caption}
        />
      );
    }
    case "iframe": {
      return (
        <shared.Iframe
          url={node.url}
          height={node.height}
          aspectRatio={node.aspectRatio}
        />
      );
    }
    case "website": {
      return (
        <shared.Website
          src={node.src}
          title={node.title}
          description={node.description}
          previewImage={node.previewImage}
        />
      );
    }
    case "table": {
      const rows: Array<TableRow> = node.rows.map((row) =>
        row.map((cell) => ({
          header: cell.header,
          children: (
            <shared.FacetText
              plaintext={cell.text.plaintext}
              facets={cell.text.facets}
            />
          ),
        })),
      );
      return <shared.Table rows={rows} />;
    }
    case "math": {
      return <shared.Math tex={node.tex} />;
    }
    case "button": {
      return (
        <shared.Button
          text={node.text}
          href={node.href}
          caption={node.caption}
          alignment={node.alignment}
        />
      );
    }
    case "blueskyEmbed": {
      return <shared.BlueskyEmbed postUri={node.postUri} />;
    }
    case "imageGrid": {
      return (
        <shared.ImageGrid
          images={node.images}
          caption={node.caption}
          layout={node.layout}
        />
      );
    }
    case "imageCarousel": {
      return (
        <shared.ImageCarousel
          images={node.images}
          caption={node.caption}
          layout={node.layout}
        />
      );
    }
    case "imageDiff": {
      return (
        <shared.ImageDiff
          before={node.before}
          after={node.after}
          caption={node.caption}
          labels={node.labels}
        />
      );
    }
    case "unknown": {
      return <shared.Unknown blockType={node.blockType} />;
    }
    case "leaflet.poll": {
      return <leaflet.Poll pollUri={node.pollUri} />;
    }
    case "leaflet.signup": {
      return <leaflet.Signup />;
    }
    case "leaflet.separator": {
      return <leaflet.Separator />;
    }
    case "leaflet.standardSitePost": {
      return <leaflet.StandardSitePost uri={node.uri} />;
    }
    case "leaflet.standardSitePublication": {
      return (
        <leaflet.StandardSitePublication
          uri={node.uri}
          cid={node.cid}
          showPublicationTheme={node.showPublicationTheme}
        />
      );
    }
    case "leaflet.pageEmbed": {
      return (
        <leaflet.PageEmbed pageId={node.pageId} pageType={node.pageType}>
          <BlockList nodes={node.children} />
        </leaflet.PageEmbed>
      );
    }
    case "pckt.gallery": {
      return <pckt.Gallery ref={node.ref} />;
    }
    case "pckt.noteEmbed": {
      return <pckt.NoteEmbed uri={node.uri} cid={node.cid} />;
    }
    case "offprint.component": {
      return <offprint.Component componentUri={node.componentUri} />;
    }
  }
}
