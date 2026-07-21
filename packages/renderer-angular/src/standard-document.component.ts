import { Component, inject, Input } from "@angular/core";
import type { OnChanges } from "@angular/core";
import { buildRenderTree } from "@standard-reader/renderer-core";
import type {
  DocumentTree,
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";

import { BlocksComponent } from "./blocks.component";
import { InlineComponent } from "./inline.component";
import { RenderContextService } from "./render-context.service";
import type { AngularComponents } from "./types";

/**
 * `<sr-standard-document>` — renders a Standard Site document as unstyled
 * semantic HTML. Structural blocks are styled with your own CSS; media and
 * data-backed blocks are overridable with `<ng-template>` refs via `components`.
 */
@Component({
  selector: "sr-standard-document",
  standalone: true,
  imports: [BlocksComponent, InlineComponent],
  providers: [RenderContextService],
  template: `@if (tree) {
    <div dir="auto">
      <sr-blocks [nodes]="tree.children" />
      @if (tree.footnotes.length > 0) {
        <section aria-label="Footnotes">
          <hr />
          <ol>
            @for (fn of tree.footnotes; track fn.id) {
              <li [id]="'fn-' + fn.id" [attr.data-number]="fn.number">
                <sr-inline [nodes]="ctx.inline(fn.text)" />
                <a [href]="'#fnref-' + fn.id" aria-label="Back to content">↩</a>
              </li>
            }
          </ol>
        </section>
      }
    </div>
  }`,
})
export class StandardDocumentComponent implements OnChanges {
  @Input({ required: true }) document!: StandardSiteDocument;
  @Input() options?: RendererOptions;
  @Input() components?: AngularComponents;

  readonly ctx = inject(RenderContextService);
  tree: DocumentTree | null = null;

  ngOnChanges(): void {
    this.tree = buildRenderTree(this.document, this.options);
    this.ctx.components = this.components ?? {};
    this.ctx.footnoteNumbers = this.tree?.footnoteNumbers ?? new Map();
  }
}
