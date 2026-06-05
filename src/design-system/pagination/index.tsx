import { clamp, useControlledState } from "@react-stately/utils";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
} from "lucide-react";
import { use } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { Button } from "../button";
import { SizeContext } from "../context";
import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { gap } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  list: {
    gap: gap["2xl"],
    alignItems: "center",
    containerType: "inline-size",
    display: "flex",
  },
  pages: {
    flexGrow: 1,
  },
  listItem: {
    listStyleType: "none",
  },
  mobileButton: {
    display: {
      default: "flex",
      ["@container (min-width: 400px)"]: "none",
    },
  },
  desktopButton: {
    display: {
      default: "none",
      ["@container (min-width: 400px)"]: "flex",
    },
  },
});

export interface PaginationProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  defaultSelectedPage?: number;
  selectedPage?: number;
  onSelectedPageChange?: (page: number) => void;
  totalPages: number;
  maxVisiblePages?: number;
  size?: Size;
}

function sliceRange(
  center: number,
  totalPages: number,
  maxVisiblePages: number,
) {
  const span = Math.floor(maxVisiblePages / 2);
  // Pages arent 0-indexed, so we need to subtract 1 from the center
  const safeCenter = clamp(center - 1, span, totalPages - 1 - span);
  const startPage = Math.max(0, safeCenter - Math.floor(maxVisiblePages / 2));
  const used = safeCenter - startPage;
  const remainingPages = maxVisiblePages - used;
  const endPage = Math.min(totalPages, safeCenter + remainingPages);

  return Array.from({ length: totalPages })
    .map((_, index) => index)
    .slice(startPage, endPage)
    .map((page) => page + 1);
}

export function Pagination({
  defaultSelectedPage,
  selectedPage,
  onSelectedPageChange,
  style,
  totalPages,
  maxVisiblePages = 5,
  size: sizeProp,
  ...props
}: PaginationProps) {
  const size = sizeProp || use(SizeContext);
  const [page, setPage] = useControlledState(
    selectedPage,
    defaultSelectedPage ?? 0,
    onSelectedPageChange,
  );
  const visiblePages = sliceRange(page, totalPages, maxVisiblePages);

  return (
    <nav {...props} {...stylex.props(style)}>
      <ul {...stylex.props(styles.list)}>
        <li {...stylex.props(styles.listItem, styles.mobileButton)}>
          <IconButton
            size={size}
            label="Previous page"
            isDisabled={page === 1}
            onClick={() => setPage(page - 1)}
            variant="tertiary"
          >
            <ChevronLeft />
          </IconButton>
        </li>
        <li {...stylex.props(styles.listItem, styles.desktopButton)}>
          <Button
            variant="tertiary"
            size={size}
            isDisabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ArrowLeft />
            Previous
          </Button>
        </li>
        <li {...stylex.props(styles.listItem, styles.pages)}>
          <ul>
            <Flex align="center" justify="center" gap="xs">
              {visiblePages[0] !== 1 && (
                <li {...stylex.props(styles.listItem, styles.desktopButton)}>
                  <Button
                    variant="tertiary"
                    size={size}
                    onClick={() => setPage(page - maxVisiblePages)}
                  >
                    <Ellipsis />
                  </Button>
                </li>
              )}
              {visiblePages.map((visiblePage) => (
                <li key={visiblePage} {...stylex.props(styles.listItem)}>
                  <Button
                    variant={page === visiblePage ? "outline" : "tertiary"}
                    aria-current={page === visiblePage ? "page" : undefined}
                    size={size}
                    onClick={() => setPage(visiblePage)}
                  >
                    {visiblePage}
                  </Button>
                </li>
              ))}
              {visiblePages.at(-1) !== totalPages && (
                <li {...stylex.props(styles.listItem, styles.desktopButton)}>
                  <IconButton
                    label="More pages"
                    variant="tertiary"
                    size={size}
                    onClick={() => setPage(page + maxVisiblePages)}
                  >
                    <Ellipsis />
                  </IconButton>
                </li>
              )}
            </Flex>
          </ul>
        </li>
        <li {...stylex.props(styles.listItem, styles.mobileButton)}>
          <IconButton
            size={size}
            label="Next page"
            isDisabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            variant="tertiary"
          >
            <ChevronRight />
          </IconButton>
        </li>
        <li {...stylex.props(styles.listItem, styles.desktopButton)}>
          <Button
            variant="tertiary"
            size={size}
            isDisabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
            <ArrowRight />
          </Button>
        </li>
      </ul>
    </nav>
  );
}
