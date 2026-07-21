import { Component, forwardRef, Input } from "@angular/core";
import type { BlockNode } from "@standard-reader/renderer-core";

import { BlockComponent } from "./block.component";

@Component({
  selector: "sr-blocks",
  standalone: true,
  imports: [forwardRef(() => BlockComponent)],
  template: `@for (node of nodes; track $index) {
    <sr-block [node]="node" />
  }`,
})
export class BlocksComponent {
  @Input() nodes: Array<BlockNode> = [];
}
