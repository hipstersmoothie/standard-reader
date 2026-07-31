import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { use, useEffect } from "react";
import { mergeProps, useHover } from "react-aria";
import type {
  CellProps as AriaCellProps,
  ColumnProps as AriaColumnProps,
  RowProps as AriaRowProps,
  TableBodyProps as AriaTableBodyProps,
  TableHeaderProps as AriaTableHeaderProps,
  TableProps as AriaTableProps,
  DropIndicatorProps,
} from "react-aria-components";
import {
  Cell as AriaCell,
  Column as AriaColumn,
  Row as AriaRow,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Collection,
  ColumnResizer,
  DropIndicator,
  TableLayout,
  Virtualizer,
  useTableOptions,
} from "react-aria-components";

import { Checkbox } from "../checkbox";
import { SizeContext } from "../context";
import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { Size, StyleXComponentProps } from "../theme/types";
import { LabelText } from "../typography";

const styles = stylex.create({
  table: {
    borderSpacing: 0,
  },
  tableHeader: {},
  row: {
    backgroundColor: {
      default: uiColor.bg,
      ":is([data-hovered])": uiColor.bgSubtle,
    },
    cursor: {
      ":is([data-href])": "pointer",
    },
    // A virtualized row's cells are absolutely positioned against the wrapper
    // the layout gives them, leaving the row itself zero-height — so its
    // background (hover, selection) had no box to paint in and simply
    // disappeared. Filling the wrapper puts it back behind the cells.
    height: {
      default: null,
      ":is([role=presentation] > [role=row])": "100%",
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
  },
  column: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    // Fill the header row. CSS table layout equalises cell heights for free,
    // but virtualized header cells are positioned individually — without this
    // the sorted column (taller, it carries the arrow) drops its bottom border
    // below its neighbours' and the header rule visibly steps.
    height: "100%",
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingTop: 0,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    verticalAlign: "middle",
  },
  columnHeader: {
    alignItems: "center",
    // Fill the header cell. Without this the box is only as tall as its own
    // content and sits at the top, so `align-items: center` has nothing to
    // centre against — and the sorted column, taller because it carries the
    // arrow, drops its label below every other header label.
    height: "100%",
    // `plain` drops the filled band and lets the bottom border do the
    // separating (see the `variant` prop on TableHeader).
    backgroundColor: {
      default: uiColor.component1,
      ":is([data-table-header=plain] *)": "transparent",
    },
    display: "flex",
    justifyContent: "space-between",
    // Inline padding is deliberately NOT set here: the inner element also
    // carries `cellContent`, so letting that own the padding is what keeps a
    // header cell horizontally aligned with the body cells beneath it — the
    // selection checkbox column most visibly.
  },
  columnHeaderSortable: {
    cursor: "pointer",
  },
  // A bare inline span around the arrow inherits the label's line box and
  // descender space, making the *sorted* header cell ~12px taller than its
  // neighbours — so the header labels stop lining up as soon as you sort.
  // Flex collapses it to exactly the icon.
  sortIndicator: {
    alignItems: "center",
    display: "flex",
  },
  tableBody: {},
  cell: {
    overflow: "auto",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: 1,
      ":is([role=row]:last-child *):not([role=presentation] > [role=gridcell]):not([role=presentation] > [role=rowheader])": 0,
      // `:last-child` can't find the real last row once rows are virtualized —
      // the last *rendered* row is whatever the window ends on. Rows that know
      // they're last mark themselves, which also reaches the selection and drag
      // cells this component renders on the row's behalf.
      ":is([data-last-row] *)": 0,
    },
    // The row's minimum height lives here rather than on the inner content box.
    // On a table cell `height` behaves as a minimum, so the row still grows for
    // a two-line name — and because the content box is then only as tall as its
    // content, `vertical-align` below has something left to centre.
    height: {
      default: sizeSpace["3xl"],
      ":is([data-table-size=lg] *)": sizeSpace["5xl"],
      ":is([data-table-size=md] *)": sizeSpace["4xl"],
      // Virtualized cells fill the row the layout measured instead of the size
      // token, which is only a floor. `rowheader` matters as much as
      // `gridcell` here — it is the row's first column, and pinning it to the
      // token while its siblings filled the row clipped its content.
      ":is([role=presentation] > [role=gridcell])": "100%",
      ":is([role=presentation] > [role=rowheader])": "100%",
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    // Cells in one row rarely have equal height (a two-line name next to a
    // one-line count). Baseline alignment — the CSS default — would pin the
    // short cells to the tall one's first line, which reads as top-aligned.
    verticalAlign: "middle",
  },
  cellContent: {
    // Fills the cell and centres its content. This is what keeps a one-line
    // count level with a two-line name beside it, and unlike the cell's
    // `vertical-align` it works in both layout modes — virtualized rows are
    // positioned divs, where `vertical-align` means nothing.
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    height: "100%",
    opacity: {
      default: 1,
      ":is([aria-disabled=true] *)": 0.5,
    },
    textAlign: "start",
    paddingBottom: {
      default: verticalSpace["xs"],
      ":is([data-table-size=lg] *)": verticalSpace["md"],
      ":is([data-table-size=md] *)": verticalSpace["sm"],
    },
    // The leading cell (selection checkbox / drag handle) scales with the table
    // size like every other cell; a fixed inset made it the widest gutter in
    // the table at the smaller sizes, where horizontal room is scarcest.
    paddingInlineStart: {
      default: horizontalSpace["3xl"],
      ":is([data-table-size=lg] *:not(:first-child))": horizontalSpace["2xl"],
      ":is([data-table-size=md] *)": horizontalSpace["md"],
    },
    paddingInlineEnd: {
      default: horizontalSpace["3xl"],
      ":is([data-table-size=lg] *:not(:last-child))": horizontalSpace["2xl"],
      ":is([data-table-size=md] *)": horizontalSpace["md"],
    },
    paddingTop: {
      default: verticalSpace["xs"],
      ":is([data-table-size=lg] *)": verticalSpace["md"],
      ":is([data-table-size=md] *)": verticalSpace["sm"],
    },
  },
  // Applied to a wrapper *inside* the content box, not the box itself: the
  // content box is a flex container, and `text-overflow` has nothing to clip
  // on a flex container's anonymous item.
  textEllipsis: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resizer: {
    boxSizing: "border-box",
    cursor: {
      ":is([data-resizable-direction=both])": "ew-resize",
      ":is([data-resizable-direction=left])": "e-resize",
      ":is([data-resizable-direction=right])": "w-resize",
    },
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    position: "relative",
    touchAction: "none",
    marginBottom: {
      default: `calc(${verticalSpace["xxs"]} * -1)`,
      ":is([data-table-size=lg] *)": `calc(${verticalSpace["md"]} * -1)`,
      ":is([data-table-size=md] *)": `calc(${verticalSpace["sm"]} * -1)`,
    },
    marginTop: {
      default: `calc(${verticalSpace["xxs"]} * -1)`,
      ":is([data-table-size=lg] *)": `calc(${verticalSpace["md"]} * -1)`,
      ":is([data-table-size=md] *)": `calc(${verticalSpace["sm"]} * -1)`,
    },
    minHeight: {
      default: sizeSpace["3xl"],
      ":is([data-table-size=lg] *)": sizeSpace["5xl"],
      ":is([data-table-size=md] *)": sizeSpace["4xl"],
    },
    width: sizeSpace["xxs"],
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
  },
  resizerLine: {
    backgroundColor: {
      default: uiColor.border1,
      ":is([data-hovered=true] *)": uiColor.border2,
      ":is([data-resizing=true] *)": uiColor.border3,
    },
    display: "block",
    position: "absolute",
    transform: "translateX(-50%)",
    bottom: 0,
    insetInlineStart: "50%",
    top: 0,
    width: sizeSpace["xxs"],
  },
  dropIndicator: {
    outlineColor: primaryColor.solid1,
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
});

const estimatedRowHeights: Record<Size, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

export interface TableProps extends StyleXComponentProps<AriaTableProps> {
  size?: Size;
  /**
   * Render only the rows near the viewport. react-aria's `Virtualizer` scrolls
   * against the page (`allowsWindowScrolling`), so the table does **not** need
   * its own bounded-height scrollport — but it does mean the table is laid out
   * by `TableLayout` rather than CSS table layout, so every column needs a
   * resolvable `width` / `defaultWidth` and rows need a height below.
   */
  isVirtualized?: boolean;
  /**
   * Exact row height in px when virtualized. Prefer this over the estimate when
   * rows are uniform: the layout skips measurement and the scrollbar is
   * accurate from the first frame.
   */
  rowHeight?: number;
  /** Estimated row height in px when virtualized and rows vary. */
  estimatedRowHeight?: number;
  /** Header row height in px when virtualized. */
  headingHeight?: number;
}

export const Table = ({
  style,
  size: sizeProp,
  isVirtualized = false,
  rowHeight,
  estimatedRowHeight,
  headingHeight,
  ...props
}: TableProps) => {
  const size = sizeProp || use(SizeContext);

  /**
   * react-aria's virtualizer only ever learns where its scroll view sits from a
   * scroll *event* — there is no mount-time initialization of that offset. But
   * scroll restoration lands during a layout effect, before the virtualizer's
   * own (passive) effect has attached its listener, so a page reopened
   * mid-scroll keeps rendering the window for the top of the list: rows exist,
   * none of them are on screen, and it stays that way until the reader scrolls.
   * One synthetic scroll after mount re-syncs it. This effect runs after the
   * virtualizer's (React runs child effects before parent ones), and the
   * handler no-ops when the offset it computes is already correct.
   */
  useEffect(() => {
    if (!isVirtualized) return;
    const sync = () => document.dispatchEvent(new Event("scroll"));
    sync();
    // Again next frame, for restoration that lands after the grid has height.
    const raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [isVirtualized]);

  let table = (
    <AriaTable
      {...props}
      {...stylex.props(styles.table, style)}
      data-table-size={size}
    />
  );

  if (isVirtualized) {
    table = (
      <Virtualizer
        layout={TableLayout}
        layoutOptions={{
          ...(rowHeight == null
            ? {
                estimatedRowHeight:
                  estimatedRowHeight ?? estimatedRowHeights[size],
              }
            : { rowHeight }),
          headingHeight: headingHeight ?? estimatedRowHeights[size],
        }}
      >
        {table}
      </Virtualizer>
    );
  }

  return <SizeContext value={size}>{table}</SizeContext>;
};

export interface TableColumnProps extends StyleXComponentProps<
  Omit<AriaColumnProps, "children">
> {
  children?: React.ReactNode;
  hasResizer?: boolean;
  hasEllipsis?: boolean;
}

export function TableColumn({
  style,
  children,
  hasResizer,
  hasEllipsis,
  ...props
}: TableColumnProps) {
  return (
    <AriaColumn {...props} {...stylex.props(styles.column, style)}>
      {({ allowsSorting, sortDirection }) => (
        <div
          {...stylex.props(
            styles.columnHeader,
            allowsSorting && styles.columnHeaderSortable,
          )}
        >
          <div {...stylex.props(styles.cellContent, styles.columnHeader)}>
            <Flex align="center" gap="xs">
              <LabelText
                tabIndex={hasResizer ? -1 : undefined}
                hasEllipsis={hasEllipsis}
              >
                {children}
              </LabelText>
              {allowsSorting && (
                <span
                  aria-hidden="true"
                  className="sort-indicator"
                  {...stylex.props(styles.sortIndicator)}
                >
                  {sortDirection === "ascending" ? (
                    <ArrowUp size={14} />
                  ) : sortDirection === "descending" ? (
                    <ArrowDown size={14} />
                  ) : null}
                </span>
              )}
            </Flex>
            {hasResizer && (
              <ColumnResizer {...stylex.props(styles.resizer)}>
                <div {...stylex.props(styles.resizerLine)} />
              </ColumnResizer>
            )}
          </div>
        </div>
      )}
    </AriaColumn>
  );
}

export interface TableHeaderProps<
  T extends object,
> extends StyleXComponentProps<AriaTableHeaderProps<T>> {
  /**
   * `filled` (default) gives the header row a tonal band; `plain` drops it so
   * the header reads as a rule over the surface, separated by its bottom
   * border alone.
   */
  variant?: "filled" | "plain";
}

export function TableHeader<T extends object>({
  children,
  style,
  variant = "filled",
  ...otherProps
}: TableHeaderProps<T>) {
  const { selectionBehavior, selectionMode, allowsDragging } =
    useTableOptions();

  return (
    <AriaTableHeader
      {...otherProps}
      data-table-header={variant}
      {...stylex.props(styles.tableHeader, style)}
    >
      {/* Add extra columns for drag and drop and selection. */}
      {allowsDragging && <TableColumn minWidth={52} width={52} />}
      {selectionBehavior === "toggle" && (
        <TableColumn minWidth={40} width={40}>
          {selectionMode === "multiple" && <Checkbox slot="selection" />}
        </TableColumn>
      )}
      <Collection items={otherProps.columns}>{children}</Collection>
    </AriaTableHeader>
  );
}

export interface TableRowProps<T extends object> extends StyleXComponentProps<
  AriaRowProps<T>
> {}

export function TableRow<T extends object>({
  id,
  columns,
  children,
  style,
  ...props
}: TableRowProps<T>) {
  const { selectionBehavior, allowsDragging } = useTableOptions();
  const { hoverProps, isHovered } = useHover({});

  return (
    <AriaRow
      id={id}
      {...mergeProps(props, hoverProps)}
      {...stylex.props(styles.row, style)}
      data-hovered={isHovered || undefined}
    >
      {allowsDragging && (
        <TableCell>
          <IconButton slot="drag" label="Reorder" variant="tertiary">
            <GripVertical size={16} />
          </IconButton>
        </TableCell>
      )}
      {selectionBehavior === "toggle" && (
        <TableCell>
          <Checkbox slot="selection" />
        </TableCell>
      )}
      <Collection items={columns}>{children}</Collection>
    </AriaRow>
  );
}

export interface TableBodyProps<T extends object> extends StyleXComponentProps<
  AriaTableBodyProps<T>
> {}

export function TableBody<T extends object>({
  style,
  ...prop
}: TableBodyProps<T>) {
  return <AriaTableBody {...prop} {...stylex.props(styles.tableBody, style)} />;
}

export interface TableCellProps extends StyleXComponentProps<
  Omit<AriaCellProps, "children">
> {
  children?: React.ReactNode;
  hasEllipsis?: boolean;
}

export function TableCell({
  style,
  children,
  hasEllipsis,
  ...props
}: TableCellProps) {
  return (
    <AriaCell {...props} {...stylex.props(styles.cell, style)}>
      <div {...stylex.props(styles.cellContent)}>
        {hasEllipsis ? (
          <span {...stylex.props(styles.textEllipsis)}>{children}</span>
        ) : (
          children
        )}
      </div>
    </AriaCell>
  );
}

export function TableDropIndicator(props: DropIndicatorProps) {
  return <DropIndicator {...props} {...stylex.props(styles.dropIndicator)} />;
}
