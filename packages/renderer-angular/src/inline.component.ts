import { Component, forwardRef, Input } from "@angular/core";
import type { InlineNode } from "@standard-reader/renderer-core";

@Component({
  selector: "sr-inline",
  standalone: true,
  imports: [forwardRef(() => InlineComponent)],
  template: `@for (node of nodes; track $index) {
    @if (node.type === "text") {
      {{ node.value }}
    } @else if (node.type === "mark") {
      @if (node.mark === "strong") {
        <strong><sr-inline [nodes]="node.children" /></strong>
      } @else if (node.mark === "emphasis") {
        <em><sr-inline [nodes]="node.children" /></em>
      } @else if (node.mark === "code") {
        <code><sr-inline [nodes]="node.children" /></code>
      } @else if (node.mark === "underline") {
        <u><sr-inline [nodes]="node.children" /></u>
      } @else if (node.mark === "strikethrough") {
        <s><sr-inline [nodes]="node.children" /></s>
      } @else {
        <mark><sr-inline [nodes]="node.children" /></mark>
      }
    } @else if (node.type === "link") {
      <a [href]="node.href" rel="noopener noreferrer nofollow"
        ><sr-inline [nodes]="node.children"
      /></a>
    } @else if (node.type === "mention") {
      <sr-inline [nodes]="node.children" />
    } @else if (node.type === "footnoteRef") {
      @if (node.number !== null) {
        <sup
          ><a
            [id]="'fnref-' + node.footnoteId"
            [href]="'#fn-' + node.footnoteId"
            [title]="node.contentPlaintext || null"
            [attr.aria-label]="'Footnote ' + node.number"
            >{{ node.number }}</a
          ></sup
        >
      }
    }
  }`,
})
export class InlineComponent {
  @Input() nodes: Array<InlineNode> = [];
}
