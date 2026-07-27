/**
 * CSS Grid Lanes Polyfill
 *
 * Polyfills the new `display: grid-lanes` CSS feature for browsers
 * that don't support it natively. Based on the WebKit implementation
 * described at: https://webkit.org/blog/17660/introducing-css-grid-lanes/
 *
 * Features supported:
 * - display: grid-lanes
 * - grid-template-columns / grid-template-rows for lane definition
 * - gap, column-gap, row-gap
 * - --flow-tolerance for placement sensitivity
 * - Spanning items (grid-column: span N)
 * - Explicit placement (grid-column: N / M)
 * - Responsive auto-fill/auto-fit with minmax()
 * - Both waterfall (columns) and brick (rows) layouts
 *
 * Features that do not work:
 * - fr units with grid-template-rows
 *
 * @version 1.0.0
 * @author Simon Willison
 * @author ninjamar
 * @license MIT
 */

// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const POLYFILL_NAME = "GridLanesPolyfill";
const POLYFILL_ATTR = "data-grid-lanes-polyfilled";
const DEFAULT_TOLERANCE = 16; // ~1em in pixels

// Cache computed styles to reduce redundant calls
const styleMap = new WeakMap(); // Not const because map has no clear meaning it has to be initialized later

// ============================================================================
// FEATURE DETECTION
// ============================================================================

/**
 * Check if the browser natively supports display: grid-lanes
 */
function supportsGridLanes() {
  if (typeof CSS === "undefined" || !CSS.supports) {
    return false;
  }
  return CSS.supports("display", "grid-lanes");
}

// ============================================================================
// PARSING UTILITIES
// ============================================================================

/**
 * Parse a CSS length value to pixels
 */
function parseLengthToPixels(
  value,
  containerSize,
  fontSize = 16,
  rootFontSize = 16,
) {
  if (!value || value === "auto" || value === "none") return null;

  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return null;

  if (value.endsWith("px")) return num;
  if (value.endsWith("rem")) return num * rootFontSize;
  if (value.endsWith("em")) return num * fontSize;
  if (value.endsWith("ch")) return num * fontSize * 0.5; // Approximate
  if (value.endsWith("lh")) return num * fontSize * 1.2; // Approximate line-height
  if (value.endsWith("%")) return (num / 100) * containerSize;
  if (value.endsWith("vw")) return (num / 100) * globalThis.innerWidth;
  if (value.endsWith("vh")) return (num / 100) * globalThis.innerHeight;
  if (value.endsWith("vmin"))
    return (
      (num / 100) * Math.min(globalThis.innerWidth, globalThis.innerHeight)
    );
  if (value.endsWith("vmax"))
    return (
      (num / 100) * Math.max(globalThis.innerWidth, globalThis.innerHeight)
    );
  if (value.endsWith("fr")) return null; // Handled separately

  // Unitless number treated as pixels
  if (!Number.isNaN(num) && value === String(num)) return num;

  return null;
}

/**
 * Parse minmax() function
 */
function parseMinMax(value) {
  const match = value.match(/minmax\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
  if (!match) return null;
  return {
    min: match[1].trim(),
    max: match[2].trim(),
  };
}

/**
 * Parse repeat() function
 */
function parseRepeat(value) {
  const match = value.match(/repeat\(\s*([^,]+)\s*,\s*(.+)\s*\)/);
  if (!match) return null;
  return {
    count: match[1].trim(),
    pattern: match[2].trim(),
  };
}

/**
 * Tokenize a grid template string
 */
function tokenizeTemplate(template) {
  const tokens = [];
  let current = "";
  let parenDepth = 0;

  for (const char of template) {
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (char === " " && parenDepth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Calculate lane sizes from grid-template-columns/rows
 */
function calculateLaneSizes(
  template,
  containerSize,
  gap,
  fontSize,
  rootFontSize,
) {
  if (!template || template === "none" || template === "auto") {
    return null;
  }

  const availableSpace = containerSize;
  const lanes = [];
  let totalFr = 0;
  let fixedSpace = 0;

  // Parse the template
  const tokens = tokenizeTemplate(template);

  for (const token of tokens) {
    // Handle repeat()
    const repeatInfo = parseRepeat(token);
    if (repeatInfo) {
      const { count, pattern } = repeatInfo;
      const patternTokens = tokenizeTemplate(pattern);

      if (count === "auto-fill" || count === "auto-fit") {
        // Calculate how many repetitions fit
        let minSize = 0;

        for (const pt of patternTokens) {
          const minmax = parseMinMax(pt);
          if (minmax) {
            const minVal = parseLengthToPixels(
              minmax.min,
              containerSize,
              fontSize,
              rootFontSize,
            );
            if (minmax.min === "max-content" || minmax.min === "min-content") {
              minSize += 100; // Fallback estimate
            } else if (minVal !== null) {
              minSize += minVal;
            }
          } else {
            const size = parseLengthToPixels(
              pt,
              containerSize,
              fontSize,
              rootFontSize,
            );
            if (size !== null) {
              minSize += size;
            } else if (pt.endsWith("fr")) {
              minSize += 100; // Minimum fallback for fr units
            }
          }
        }

        // Calculate repetitions
        const patternCount = patternTokens.length;
        const gapCount = patternCount - 1;
        const minPatternSize = minSize + gapCount * gap;

        const reps = Math.max(
          1,
          Math.floor((availableSpace + gap) / (minPatternSize + gap)),
        );

        // Expand pattern
        for (let i = 0; i < reps; i++) {
          for (const pt of patternTokens) {
            const minmax = parseMinMax(pt);
            if (minmax) {
              const minVal = parseLengthToPixels(
                minmax.min,
                containerSize,
                fontSize,
                rootFontSize,
              );
              const maxVal = minmax.max.endsWith("fr")
                ? { fr: Number.parseFloat(minmax.max) }
                : parseLengthToPixels(
                    minmax.max,
                    containerSize,
                    fontSize,
                    rootFontSize,
                  );

              lanes.push({
                min: minVal || 0,
                max: maxVal,
                size: 0,
              });

              if (typeof maxVal === "object" && maxVal.fr) {
                totalFr += maxVal.fr;
              } else {
                // Only add to fixedSpace if max is NOT fr (non-flexible tracks)
                fixedSpace += minVal || 0;
              }
            } else if (pt.endsWith("fr")) {
              const fr = Number.parseFloat(pt);
              lanes.push({ min: 0, max: { fr }, size: 0 });
              totalFr += fr;
            } else {
              const size =
                parseLengthToPixels(
                  pt,
                  containerSize,
                  fontSize,
                  rootFontSize,
                ) || 0;
              lanes.push({ min: size, max: size, size });
              fixedSpace += size;
            }
          }
        }
      } else {
        // Fixed repeat count
        const reps = Number.parseInt(count, 10);
        for (let i = 0; i < reps; i++) {
          for (const pt of patternTokens) {
            const size = parseLengthToPixels(
              pt,
              containerSize,
              fontSize,
              rootFontSize,
            );
            if (pt.endsWith("fr")) {
              const fr = Number.parseFloat(pt);
              lanes.push({ min: 0, max: { fr }, size: 0 });
              totalFr += fr;
            } else if (size !== null) {
              lanes.push({ min: size, max: size, size });
              fixedSpace += size;
            }
          }
        }
      }
      continue;
    }

    // Handle minmax()
    const minmax = parseMinMax(token);
    if (minmax) {
      const minVal = parseLengthToPixels(
        minmax.min,
        containerSize,
        fontSize,
        rootFontSize,
      );
      const maxVal = minmax.max.endsWith("fr")
        ? { fr: Number.parseFloat(minmax.max) }
        : parseLengthToPixels(
            minmax.max,
            containerSize,
            fontSize,
            rootFontSize,
          );

      lanes.push({ min: minVal || 0, max: maxVal, size: 0 });
      if (typeof maxVal === "object" && maxVal.fr) {
        totalFr += maxVal.fr;
      } else {
        // Only add to fixedSpace if max is NOT fr (non-flexible tracks)
        fixedSpace += minVal || 0;
      }
      continue;
    }

    // Handle fr units
    if (token.endsWith("fr")) {
      const fr = Number.parseFloat(token);
      lanes.push({ min: 0, max: { fr }, size: 0 });
      totalFr += fr;
      continue;
    }

    // Handle fixed sizes
    const size = parseLengthToPixels(
      token,
      containerSize,
      fontSize,
      rootFontSize,
    );
    if (size !== null) {
      lanes.push({ min: size, max: size, size });
      fixedSpace += size;
    }
  }

  // Calculate final sizes
  const totalGaps = Math.max(0, lanes.length - 1) * gap;
  const flexSpace = Math.max(0, availableSpace - fixedSpace - totalGaps);
  const frUnit = totalFr > 0 ? flexSpace / totalFr : 0;

  for (const lane of lanes) {
    if (typeof lane.max === "object" && lane.max.fr) {
      lane.size = lane.min + frUnit * lane.max.fr;
    } else {
      lane.size = lane.min;
    }
  }

  return lanes.map((l) => l.size);
}

// ============================================================================
// STYLE & ITEM UTILITIES
// ============================================================================

/**
 * Get computed styles for grid-lanes properties
 */
function getGridLanesStyles(element) {
  const computed = globalThis.getComputedStyle(element);
  const fontSize =
    Number.parseFloat(computed.getPropertyValue("font-size")) || 16;
  const rootFontSize =
    Number.parseFloat(
      globalThis
        .getComputedStyle(document.documentElement)
        .getPropertyValue("font-size"),
    ) || 16;

  // Get gap values
  const gap =
    computed.getPropertyValue("gap") ||
    computed.getPropertyValue("grid-gap") ||
    "0px";
  let columnGap =
    computed.getPropertyValue("column-gap") ||
    computed.getPropertyValue("grid-column-gap") ||
    gap;
  let rowGap =
    computed.getPropertyValue("row-gap") ||
    computed.getPropertyValue("grid-row-gap") ||
    gap;

  // Handle combined gap shorthand like "24px 16px"
  if (gap.includes(" ")) {
    const [rg, cg] = gap.split(/\s+/);
    rowGap = rg;
    columnGap = cg;
  }

  // Parse flow-tolerance
  let tolerance = DEFAULT_TOLERANCE;
  const toleranceValue = computed.getPropertyValue("--flow-tolerance").trim();

  if (toleranceValue) {
    const parsed = parseLengthToPixels(
      toleranceValue,
      0,
      fontSize,
      rootFontSize,
    );
    if (parsed !== null) tolerance = parsed;
  }

  const gridTemplateColumns =
    computed.getPropertyValue("--grid-template-columns").trim() ||
    computed.getPropertyValue("grid-template-columns");
  const gridTemplateRows =
    computed.getPropertyValue("--grid-template-rows").trim() ||
    computed.getPropertyValue("grid-template-rows");

  return {
    gridTemplateColumns,
    gridTemplateRows,
    columnGap:
      parseLengthToPixels(
        String(columnGap).split(" ")[0],
        0,
        fontSize,
        rootFontSize,
      ) || 0,
    rowGap:
      parseLengthToPixels(
        String(rowGap).split(" ")[0],
        0,
        fontSize,
        rootFontSize,
      ) || 0,
    fontSize,
    rootFontSize,
    tolerance,
  };
}

/**
 * Get item placement properties
 */
function getItemStyles(element) {
  const computed = globalThis.getComputedStyle(element);
  const gridColumn = computed.gridColumn || computed.gridColumnStart;
  const gridRow = computed.gridRow || computed.gridRowStart;

  let columnSpan = 1;
  let columnStart = null;
  let columnEnd = null;
  let rowSpan = 1;
  let rowStart = null;
  let rowEnd = null;

  // Parse grid-column
  if (gridColumn && gridColumn !== "auto") {
    const spanMatch = gridColumn.match(/span\s+(\d+)/);
    if (spanMatch) {
      columnSpan = Number.parseInt(spanMatch[1], 10);
    } else if (gridColumn.includes("/")) {
      const [start, end] = gridColumn.split("/").map((s) => s.trim());
      columnStart = Number.parseInt(start, 10);
      columnEnd = Number.parseInt(end, 10);
      if (!Number.isNaN(columnStart) && !Number.isNaN(columnEnd)) {
        columnSpan = Math.abs(columnEnd - columnStart);
      }
    } else {
      const num = Number.parseInt(gridColumn, 10);
      if (!Number.isNaN(num)) {
        columnStart = num;
      }
    }
  }

  // Parse grid-row
  if (gridRow && gridRow !== "auto") {
    const spanMatch = gridRow.match(/span\s+(\d+)/);
    if (spanMatch) {
      rowSpan = Number.parseInt(spanMatch[1], 10);
    } else if (gridRow.includes("/")) {
      const [start, end] = gridRow.split("/").map((s) => s.trim());
      rowStart = Number.parseInt(start, 10);
      rowEnd = Number.parseInt(end, 10);
      if (!Number.isNaN(rowStart) && !Number.isNaN(rowEnd)) {
        rowSpan = Math.abs(rowEnd - rowStart);
      }
    } else {
      const num = Number.parseInt(gridRow, 10);
      if (!Number.isNaN(num)) {
        rowStart = num;
      }
    }
  }

  return {
    columnSpan,
    columnStart,
    columnEnd,
    rowSpan,
    rowStart,
    rowEnd,
  };
}

// ============================================================================
// STYLE CACHE MANAGEMENT
// ============================================================================

/**
 * Get computed style with caching to reduce redundant calls
 */
function catchedGetComputedStyle(elem, useCatch = true) {
  if (useCatch && styleMap.has(elem)) {
    return styleMap.get(elem);
  }
  const style = globalThis.getComputedStyle(elem);
  styleMap.set(elem, style);
  return style;
}

/**
 * Clear cached style for an element
 */
function removeCachedStyle(elem) {
  styleMap.delete(elem);
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Check if element has the grid-lanes polyfill marker
 */
function hasGridLanesProperty(elem) {
  return (
    catchedGetComputedStyle(elem)
      .getPropertyValue("--grid-lanes-polyfill")
      .trim() === "1"
  );
}

/**
 * Find all elements with --grid-lanes-polyfill down to the granular level.
 * Prefers children over parent elements. Note: nested grid-lanes are not
 * supported because the custom property cascades to all descendants.
 *
 * Uses TreeWalker for efficient traversal and routes through hasGridLanesProperty()
 * to leverage the catchedGetComputedStyle cache. Correctly handles subtree skipping.
 */
function findElements(root = document.body) {
  const results = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  let node = walker.nextNode(); // start from first child, skip root itself
  while (node) {
    if (hasGridLanesProperty(node)) {
      results.push(node);
      // Skip the entire subtree of this match by finding the next
      // node outside of it: try nextSibling, then bubble up ancestors.
      let next = null;
      let ancestor = node;
      while (ancestor && ancestor !== root) {
        walker.currentNode = ancestor;
        next = walker.nextSibling();
        if (next) break;
        ancestor = ancestor.parentElement;
      }
      node = next; // null means no more nodes in tree
    } else {
      node = walker.nextNode();
    }
  }
  return results;
}

/**
 * Process a subtree for grid-lanes containers
 */
function processSubtree(root, instances, options) {
  const containers = findElements(root);
  for (const container of containers) {
    if (!instances.has(container) && !container.hasAttribute(POLYFILL_ATTR)) {
      instances.set(container, new GridLanesLayout(container, options));
    }
  }
}

// ============================================================================
// GRID LANES LAYOUT CLASS
// ============================================================================

/**
 * Main Grid Lanes layout class
 */
class GridLanesLayout {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.isVertical = true; // true = waterfall (columns), false = brick (rows)
    this.lanes = [];
    this.laneHeights = [];
    this.resizeObserver = null;
    this.mutationObserver = null;

    this.init();
  }

  init() {
    // Mark as polyfilled
    this.container.setAttribute(POLYFILL_ATTR, "true");

    // Set up container styles
    this.container.style.position = "relative";
    this.container.style.display = "block";

    // Initial layout
    this.layout();

    // Set up observers
    this.setupObservers();
  }

  setupObservers() {
    // Debounce layout calls to avoid excessive recalculations
    let layoutTimeout = null;
    const debouncedLayout = () => {
      if (layoutTimeout) clearTimeout(layoutTimeout);
      layoutTimeout = setTimeout(() => this.layout(), 16);
    };

    // Resize observer for responsive layouts AND child size changes
    this.resizeObserver = new ResizeObserver((entries) => {
      // Check if it's the container or a child that resized
      for (const entry of entries) {
        if (
          entry.target === this.container ||
          entry.target.parentElement === this.container
        ) {
          debouncedLayout();
          break;
        }
      }
    });
    this.resizeObserver.observe(this.container);

    // Observe all direct children for size changes
    for (const child of this.container.children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        this.resizeObserver.observe(child);
      }
    }

    // Mutation observer for dynamic content
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldRelayout = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          // Observe new children
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.resizeObserver.observe(node);
              // Also watch for images in new nodes
              this.observeImages(node);
            }
          }
          shouldRelayout = true;
        } else if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          shouldRelayout = true;
        }
      }
      if (shouldRelayout) {
        debouncedLayout();
      }
    });
    this.mutationObserver.observe(this.container, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    // Observe all images for load events
    this.observeImages(this.container);
  }

  observeImages(root) {
    const images = root.querySelectorAll("img");
    for (const img of images) {
      if (!img.complete) {
        img.addEventListener("load", () => this.layout(), { once: true });
        img.addEventListener("error", () => this.layout(), { once: true });
      }
    }
  }

  layout() {
    const styles = getGridLanesStyles(this.container);
    const containerRect = this.container.getBoundingClientRect();

    // Determine direction based on which template is defined
    const hasColumns =
      styles.gridTemplateColumns &&
      styles.gridTemplateColumns !== "none" &&
      !styles.gridTemplateColumns.startsWith("auto");
    const hasRows =
      styles.gridTemplateRows &&
      styles.gridTemplateRows !== "none" &&
      !styles.gridTemplateRows.startsWith("auto");

    this.isVertical = hasColumns || !hasRows;

    // Calculate lane sizes
    if (this.isVertical) {
      this.lanes = calculateLaneSizes(
        styles.gridTemplateColumns,
        containerRect.width,
        styles.columnGap,
        styles.fontSize,
        styles.rootFontSize,
      ) || [containerRect.width];
    } else {
      this.lanes = calculateLaneSizes(
        styles.gridTemplateRows,
        containerRect.height,
        styles.rowGap,
        styles.fontSize,
        styles.rootFontSize,
      ) || [containerRect.height];
    }

    // Initialize lane positions (heights for vertical, widths for horizontal)
    this.laneHeights = Array.from({ length: this.lanes.length }, () => 0);

    // Get all direct children
    const items = [...this.container.children].filter(
      (el) =>
        el.nodeType === Node.ELEMENT_NODE &&
        globalThis.getComputedStyle(el).display !== "none",
    );

    // Separate explicitly placed items from auto-placed items
    const explicitItems = [];
    const autoItems = [];

    for (const item of items) {
      const itemStyles = getItemStyles(item);
      if (this.isVertical && itemStyles.columnStart !== null) {
        explicitItems.push({ element: item, styles: itemStyles });
      } else if (!this.isVertical && itemStyles.rowStart !== null) {
        explicitItems.push({ element: item, styles: itemStyles });
      } else {
        autoItems.push({ element: item, styles: itemStyles });
      }
    }

    // Place explicitly positioned items first
    for (const { element, styles: itemStyles } of explicitItems) {
      this.placeExplicitItem(element, itemStyles, styles);
    }

    // Place auto-positioned items
    for (const { element, styles: itemStyles } of autoItems) {
      this.placeAutoItem(element, itemStyles, styles);
    }

    // Set container height
    const containerHeight = Math.max(...this.laneHeights);
    this.container.style.minHeight = `${containerHeight}px`;
  }

  placeExplicitItem(element, itemStyles, containerStyles) {
    const gap = this.isVertical
      ? containerStyles.columnGap
      : containerStyles.rowGap;
    const crossGap = this.isVertical
      ? containerStyles.rowGap
      : containerStyles.columnGap;

    let laneIndex;
    let span;

    if (this.isVertical) {
      // Handle negative indices
      laneIndex = itemStyles.columnStart;
      if (laneIndex < 0) {
        laneIndex = this.lanes.length + laneIndex + 1;
      }
      laneIndex = Math.max(0, Math.min(laneIndex - 1, this.lanes.length - 1));
      span = itemStyles.columnSpan;
    } else {
      laneIndex = itemStyles.rowStart;
      if (laneIndex < 0) {
        laneIndex = this.lanes.length + laneIndex + 1;
      }
      laneIndex = Math.max(0, Math.min(laneIndex - 1, this.lanes.length - 1));
      span = itemStyles.rowSpan;
    }

    // Calculate position
    let position = 0;
    for (let i = 0; i < laneIndex; i++) {
      position += this.lanes[i] + gap;
    }

    // Calculate width (for spanning)
    let size = 0;
    const endLane = Math.min(laneIndex + span, this.lanes.length);
    for (let i = laneIndex; i < endLane; i++) {
      size += this.lanes[i];
      if (i < endLane - 1) size += gap;
    }

    // Get the tallest lane in the span
    let maxHeight = 0;
    for (let i = laneIndex; i < endLane; i++) {
      maxHeight = Math.max(maxHeight, this.laneHeights[i]);
    }

    // Position the element
    element.style.position = "absolute";

    if (this.isVertical) {
      element.style.left = `${position}px`;
      element.style.top = `${maxHeight > 0 ? maxHeight + crossGap : 0}px`;
      element.style.width = `${size}px`;
    } else {
      element.style.top = `${position}px`;
      element.style.left = `${maxHeight > 0 ? maxHeight + crossGap : 0}px`;
      element.style.height = `${size}px`;
      element.style.width = "";
    }

    // Update lane heights
    const itemRect = element.getBoundingClientRect();
    const itemSize = this.isVertical ? itemRect.height : itemRect.width;
    const newHeight = maxHeight + (maxHeight > 0 ? crossGap : 0) + itemSize;

    for (let i = laneIndex; i < endLane; i++) {
      this.laneHeights[i] = newHeight;
    }
  }

  placeAutoItem(element, itemStyles, containerStyles) {
    const gap = this.isVertical
      ? containerStyles.columnGap
      : containerStyles.rowGap;
    const crossGap = this.isVertical
      ? containerStyles.rowGap
      : containerStyles.columnGap;
    const tolerance = containerStyles.tolerance;
    const span = Math.min(
      this.isVertical ? itemStyles.columnSpan : itemStyles.rowSpan,
      this.lanes.length,
    );

    // Find the best lane(s) considering tolerance
    let bestLane = 0;
    let bestHeight = Infinity;

    for (let i = 0; i <= this.lanes.length - span; i++) {
      // Get the max height across the span
      let maxHeight = 0;
      for (let j = i; j < i + span; j++) {
        maxHeight = Math.max(maxHeight, this.laneHeights[j]);
      }

      // Use tolerance to determine if this is meaningfully better
      if (bestHeight - maxHeight > tolerance) {
        bestHeight = maxHeight;
        bestLane = i;
      }
      // Within tolerance: keep the current (earlier) bestLane — spec prefers earliest equivalent lane
    }

    // Calculate position
    let position = 0;
    for (let i = 0; i < bestLane; i++) {
      position += this.lanes[i] + gap;
    }

    // Calculate size (for spanning)
    let size = 0;
    const endLane = Math.min(bestLane + span, this.lanes.length);
    for (let i = bestLane; i < endLane; i++) {
      size += this.lanes[i];
      if (i < endLane - 1) size += gap;
    }

    // Position the element
    element.style.position = "absolute";

    if (this.isVertical) {
      element.style.left = `${position}px`;
      element.style.top = `${bestHeight > 0 ? bestHeight + crossGap : 0}px`;
      element.style.width = `${size}px`;
    } else {
      element.style.top = `${position}px`;
      element.style.left = `${bestHeight > 0 ? bestHeight + crossGap : 0}px`;
      element.style.height = `${size}px`;
      element.style.width = "";
    }

    // Update lane heights
    const itemRect = element.getBoundingClientRect();
    const itemSize = this.isVertical ? itemRect.height : itemRect.width;
    const newHeight = bestHeight + (bestHeight > 0 ? crossGap : 0) + itemSize;

    for (let i = bestLane; i < endLane; i++) {
      this.laneHeights[i] = newHeight;
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.container.removeAttribute(POLYFILL_ATTR);
    this.container.style.position = "";
    this.container.style.display = "";
    this.container.style.minHeight = "";

    // Reset item styles
    for (const item of this.container.children) {
      if (item.nodeType === Node.ELEMENT_NODE) {
        item.style.position = "";
        item.style.left = "";
        item.style.top = "";
        item.style.width = "";
        item.style.height = "";
      }
    }
  }

  refresh() {
    this.layout();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the polyfill on all grid-lanes elements in the document
 */
function init(options = {}) {
  // Check if native support exists
  if (supportsGridLanes() && !options.force) {
    console.log(
      `${POLYFILL_NAME}: Native support detected, polyfill not needed.`,
    );
    return { supported: true, instances: [] };
  }

  const instances = new Map();

  // Process existing containers
  const containers = findElements();

  for (const container of containers) {
    if (!container.hasAttribute(POLYFILL_ATTR)) {
      instances.set(container, new GridLanesLayout(container, options));
    }
  }

  // Watch for new stylesheets and elements
  // Debounce for ancestor attribute changes to avoid excessive relayouts
  let ancestorLayoutTimeout = null;
  const pendingAncestorInstances = new Map();
  const debouncedRelayoutAll = () => {
    if (ancestorLayoutTimeout) clearTimeout(ancestorLayoutTimeout);
    ancestorLayoutTimeout = setTimeout(() => {
      for (const [container, instance] of pendingAncestorInstances) {
        if (instances.has(container)) {
          removeCachedStyle(container);
          instance.refresh();
        }
      }
      pendingAncestorInstances.clear();
    }, 16);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        removeCachedStyle(mutation.target);
        // If the changed node is an ancestor of (or is) a container,
        // cascaded/inherited styles on the container may have changed.
        for (const [container] of instances) {
          if (mutation.target.contains(container)) {
            pendingAncestorInstances.set(container, instances.get(container));
          }
        }
        if (pendingAncestorInstances.size > 0) {
          debouncedRelayoutAll();
        }
      }

      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== node.ELEMENT_NODE) continue;

          processSubtree(node, instances, options);
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== node.ELEMENT_NODE) continue;
          if (instances.has(node)) {
            instances.get(node).destroy();
            instances.delete(node);
          }
          styleMap.delete(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  console.log(
    `${POLYFILL_NAME}: Initialized, ${instances.size} container(s) found.`,
  );

  return {
    supported: false,
    instances,
    observer,
    refresh() {
      for (const instance of instances.values()) {
        instance.refresh();
      }
    },
    destroy() {
      observer.disconnect();
      for (const instance of instances.values()) {
        instance.destroy();
      }
      instances.clear();
      // TODO: Ensure GC is triggered
    },
  };
}

/**
 * Apply layout to a specific element
 */
function apply(element, options = {}) {
  if (supportsGridLanes() && !options.force) {
    return null;
  }
  return new GridLanesLayout(element, options);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { supportsGridLanes, init, apply, GridLanesLayout };

export default {
  supportsGridLanes,
  init,
  apply,
  GridLanesLayout,
  version: "1.1.0",
};
