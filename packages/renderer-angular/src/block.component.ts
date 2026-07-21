import { NgTemplateOutlet } from "@angular/common";
import { Component, forwardRef, inject, Input } from "@angular/core";
import type {
  BlockNode,
  InlineNode,
  RichText,
} from "@standard-reader/renderer-core";

import { BlocksComponent } from "./blocks.component";
import { InlineComponent } from "./inline.component";
import { RenderContextService } from "./render-context.service";

@Component({
  selector: "sr-block",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    InlineComponent,
    forwardRef(() => BlocksComponent),
  ],
  template: `@if (node.type === "paragraph") {
      <p [attr.data-drop-cap]="node.dropCap ? '' : null">
        <sr-inline [nodes]="inline(node.text)" />
      </p>
    } @else if (node.type === "heading") {
      @switch (node.level) {
        @case (1) {
          <h1><sr-inline [nodes]="inline(node.text)" /></h1>
        }
        @case (3) {
          <h3><sr-inline [nodes]="inline(node.text)" /></h3>
        }
        @case (4) {
          <h4><sr-inline [nodes]="inline(node.text)" /></h4>
        }
        @case (5) {
          <h5><sr-inline [nodes]="inline(node.text)" /></h5>
        }
        @case (6) {
          <h6><sr-inline [nodes]="inline(node.text)" /></h6>
        }
        @default {
          <h2><sr-inline [nodes]="inline(node.text)" /></h2>
        }
      }
    } @else if (node.type === "blockquote") {
      <blockquote>
        @for (p of node.paragraphs; track $index) {
          <p><sr-inline [nodes]="inline(p)" /></p>
        }
      </blockquote>
    } @else if (node.type === "callout") {
      <aside role="note">
        @if (node.emoji) {
          <span aria-hidden="true">{{ node.emoji }} </span>
        }
        <sr-inline [nodes]="inline(node.text)" />
      </aside>
    } @else if (node.type === "horizontalRule") {
      <hr />
    } @else if (node.type === "bulletList") {
      <ul>
        @for (item of node.items; track $index) {
          <li>
            @for (run of item.runs; track $index) {
              <sr-inline [nodes]="inline(run)" />
            }
            <sr-blocks [nodes]="item.children" />
          </li>
        }
      </ul>
    } @else if (node.type === "orderedList") {
      <ol [attr.start]="node.start ?? null">
        @for (item of node.items; track $index) {
          <li>
            @for (run of item.runs; track $index) {
              <sr-inline [nodes]="inline(run)" />
            }
            <sr-blocks [nodes]="item.children" />
          </li>
        }
      </ol>
    } @else if (node.type === "taskList") {
      <ul>
        @for (item of node.items; track $index) {
          <li>
            <input type="checkbox" [checked]="item.checked" disabled readonly />
            @for (run of item.runs; track $index) {
              <sr-inline [nodes]="inline(run)" />
            }
          </li>
        }
      </ul>
    } @else if (node.type === "code") {
      @if (ctx.components.shared?.code; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { code: node.code, language: node.language } }
          "
        />
      } @else {
        <pre><code [class]="node.language ? 'language-' + node.language : null">{{ node.code }}</code></pre>
      }
    } @else if (node.type === "image") {
      @if (ctx.components.shared?.image; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <figure>
          <img
            [src]="node.src"
            [alt]="node.alt"
            referrerpolicy="no-referrer"
            loading="lazy"
          />
          @if (node.caption) {
            <figcaption>{{ node.caption }}</figcaption>
          }
        </figure>
      }
    } @else if (node.type === "iframe") {
      @if (ctx.components.shared?.iframe; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <iframe
          [src]="node.url"
          [attr.height]="node.height ?? null"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title="Embedded content"
        ></iframe>
      }
    } @else if (node.type === "website") {
      @if (ctx.components.shared?.website; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <a [href]="node.src" rel="noopener noreferrer nofollow">
          <span>{{ node.title || node.src }}</span>
          @if (node.description) {
            <span>{{ node.description }}</span>
          }
        </a>
      }
    } @else if (node.type === "table") {
      @if (ctx.components.shared?.table; as tpl) {
        <ng-container
          *ngTemplateOutlet="tpl; context: { $implicit: { rows: node.rows } }"
        />
      } @else {
        <table>
          <tbody>
            @for (row of node.rows; track $index) {
              <tr>
                @for (cell of row; track $index) {
                  @if (cell.header) {
                    <th scope="col">
                      <sr-inline [nodes]="inline(cell.text)" />
                    </th>
                  } @else {
                    <td><sr-inline [nodes]="inline(cell.text)" /></td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      }
    } @else if (node.type === "math") {
      @if (ctx.components.shared?.math; as tpl) {
        <ng-container
          *ngTemplateOutlet="tpl; context: { $implicit: { tex: node.tex } }"
        />
      } @else {
        <code data-tex="">{{ node.tex }}</code>
      }
    } @else if (node.type === "button") {
      @if (ctx.components.shared?.button; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <span>
          <a [href]="node.href" rel="noopener noreferrer nofollow">{{
            node.text
          }}</a>
          @if (node.caption) {
            <small>{{ node.caption }}</small>
          }
        </span>
      }
    } @else if (node.type === "blueskyEmbed") {
      @if (ctx.components.shared?.blueskyEmbed; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { postUri: node.postUri } }
          "
        />
      } @else {
        <a [attr.data-bluesky-embed]="node.postUri" [href]="node.postUri">{{
          node.postUri
        }}</a>
      }
    } @else if (node.type === "imageGrid") {
      @if (ctx.components.shared?.imageGrid; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <figure>
          @for (image of node.images; track $index) {
            <img
              [src]="image.src"
              [alt]="image.alt"
              referrerpolicy="no-referrer"
              loading="lazy"
            />
          }
          @if (node.caption) {
            <figcaption>{{ node.caption }}</figcaption>
          }
        </figure>
      }
    } @else if (node.type === "imageCarousel") {
      @if (ctx.components.shared?.imageCarousel; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <figure>
          @for (image of node.images; track $index) {
            <img
              [src]="image.src"
              [alt]="image.alt"
              referrerpolicy="no-referrer"
              loading="lazy"
            />
          }
          @if (node.caption) {
            <figcaption>{{ node.caption }}</figcaption>
          }
        </figure>
      }
    } @else if (node.type === "imageDiff") {
      @if (ctx.components.shared?.imageDiff; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      } @else {
        <figure>
          <img
            [src]="node.before.src"
            [alt]="node.before.alt || node.labels?.[0] || ''"
            referrerpolicy="no-referrer"
            loading="lazy"
          />
          <img
            [src]="node.after.src"
            [alt]="node.after.alt || node.labels?.[1] || ''"
            referrerpolicy="no-referrer"
            loading="lazy"
          />
          @if (node.caption) {
            <figcaption>{{ node.caption }}</figcaption>
          }
        </figure>
      }
    } @else if (node.type === "unknown") {
      @if (ctx.components.shared?.unknown; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { blockType: node.blockType } }
          "
        />
      }
    } @else if (node.type === "leaflet.poll") {
      @if (ctx.components.leaflet?.poll; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { pollUri: node.pollUri } }
          "
        />
      }
    } @else if (node.type === "leaflet.signup") {
      @if (ctx.components.leaflet?.signup; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: {} }" />
      }
    } @else if (node.type === "leaflet.separator") {
      @if (ctx.components.leaflet?.separator; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: {} }" />
      } @else {
        <hr />
      }
    } @else if (node.type === "leaflet.standardSitePost") {
      @if (ctx.components.leaflet?.standardSitePost; as tpl) {
        <ng-container
          *ngTemplateOutlet="tpl; context: { $implicit: { uri: node.uri } }"
        />
      }
    } @else if (node.type === "leaflet.standardSitePublication") {
      @if (ctx.components.leaflet?.standardSitePublication; as tpl) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: node }" />
      }
    } @else if (node.type === "leaflet.pageEmbed") {
      <div data-page-embed=""><sr-blocks [nodes]="node.children" /></div>
    } @else if (node.type === "pckt.gallery") {
      @if (ctx.components.pckt?.gallery; as tpl) {
        <ng-container
          *ngTemplateOutlet="tpl; context: { $implicit: { ref: node.ref } }"
        />
      }
    } @else if (node.type === "pckt.noteEmbed") {
      @if (ctx.components.pckt?.noteEmbed; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { uri: node.uri, cid: node.cid } }
          "
        />
      }
    } @else if (node.type === "offprint.component") {
      @if (ctx.components.offprint?.component; as tpl) {
        <ng-container
          *ngTemplateOutlet="
            tpl;
            context: { $implicit: { componentUri: node.componentUri } }
          "
        />
      }
    }`,
})
export class BlockComponent {
  @Input({ required: true }) node!: BlockNode;
  readonly ctx = inject(RenderContextService);

  inline(text: RichText): Array<InlineNode> {
    return this.ctx.inline(text);
  }
}
