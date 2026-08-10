"use client";

import { useLingui } from "@lingui/react/macro";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { size } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useCompactNav } from "#/lib/use-media-query";
import { usePullGesture } from "#/lib/use-pull-gesture";

/** Mirrors the `DESKTOP` breakpoint in `app-shell.tsx`. */
const DESKTOP = "@media (min-width: 60rem)";

type RefreshHandler = () => Promise<unknown>;

/**
 * One page at a time owns the pull gesture. The registry is a store rather than
 * context state on purpose: the handler changes on every navigation, and pushing
 * that through context would re-render the whole shell — sidebar, nav and all —
 * a second time after each route commits. Only the indicator subscribes.
 */
interface PullToRefreshStore {
  getHandler: () => RefreshHandler | null;
  register: (handler: RefreshHandler) => () => void;
  subscribe: (listener: () => void) => () => void;
}

function createPullToRefreshStore(): PullToRefreshStore {
  let handler: RefreshHandler | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getHandler: () => handler,
    register(next) {
      handler = next;
      emit();
      return () => {
        // A route that has already been replaced must not clear its successor's
        // handler — during a transition both are mounted for a moment.
        if (handler !== next) return;
        handler = null;
        emit();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const PullToRefreshContext = createContext<PullToRefreshStore | null>(null);

export function PullToRefreshProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [store] = useState(createPullToRefreshStore);
  return (
    <PullToRefreshContext.Provider value={store}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

/**
 * Refetch whatever the page is currently showing: the route's loaders plus every
 * query mounted under it, which on this app also covers the shell's own unread
 * counts and subscription list. Scroll position and local UI state survive,
 * which a document reload would not.
 */
function useDefaultRefresh(): RefreshHandler {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async () =>
      Promise.all([
        router.invalidate(),
        queryClient.refetchQueries({ type: "active" }),
      ]),
    [queryClient, router],
  );
}

/**
 * Opt a page into pull-to-refresh. Call it from the route component; the
 * gesture is live for as long as that component is mounted, and only at the
 * widths where the shell shows its compact chrome.
 *
 * Pass a handler to refresh something specific — otherwise the page refetches
 * its own route data (see {@link useDefaultRefresh}).
 */
// eslint-disable-next-line react/only-export-components -- consumed by route components
export function usePullToRefresh(handler?: RefreshHandler): void {
  const store = useContext(PullToRefreshContext);
  const fallback = useDefaultRefresh();
  // Read through a ref so a handler that changes identity every render — most
  // inline arrow functions do — doesn't churn the registration.
  const latest = useRef<RefreshHandler>(handler ?? fallback);
  latest.current = handler ?? fallback;

  useEffect(() => {
    if (!store) return;
    return store.register(async () => latest.current());
  }, [store]);
}

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  // Zero-height and in normal flow, directly under the mobile top bar: the
  // gesture only runs at a scroll offset of 0, so the chip is pinned to the
  // viewport for as long as it is on screen without any of the layer promotion
  // an actually-fixed element would cost (see the note on `dock` in app-shell).
  lane: {
    display: { [DESKTOP]: "none", default: "flex" },
    height: 0,
    justifyContent: "center",
    // The chip is a status indicator, never a target — taps belong to the page
    // underneath it.
    pointerEvents: "none",
    position: "relative",
    zIndex: 14,
  },
  chip: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadow.lg,
    color: uiColor.text1,
    display: "flex",
    height: size["4xl"],
    // Centred by its own insets rather than the lane's `justify-content`: the
    // static position of an absolutely positioned flex child is a corner of the
    // spec engines have disagreed about, and this reads the same in both
    // writing directions.
    insetInlineEnd: 0,
    insetInlineStart: 0,
    justifyContent: "center",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    // Resting state. The gesture writes transform/opacity inline while it runs
    // and strips them again when it lands.
    opacity: 0,
    position: "absolute",
    top: 0,
    width: size["4xl"],
  },
  // Far enough to let go: the chip picks up the accent so the change of state is
  // visible without looking away from the page.
  chipArmed: {
    borderColor: primaryColor.border2,
    color: primaryColor.text2,
  },
  icon: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  },
  iconSpinning: {
    animationDuration: animationDuration.indeterminateCycle,
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  srOnly: {
    borderWidth: 0,
    clipPath: "inset(50%)",
    height: spacing.px,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: spacing.px,
  },
});

/** Stand-ins for when the shell isn't there at all — embeds render standalone. */
const noopSubscribe = () => () => {};
const noopHandler = () => null;

/**
 * The pull indicator. Mounted once by the shell, just below the mobile top bar;
 * it does nothing at all until a page registers a refresh handler.
 *
 * Deliberately not marked `aria-busy` — the perf suite treats a cleared
 * `aria-busy` as "the page is ready" (`perf/lib/measure.ts`), and a refresh the
 * reader asked for is not part of that first-paint contract.
 */
export function PullToRefreshLane() {
  const { t } = useLingui();
  const store = useContext(PullToRefreshContext);
  const handler = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getHandler ?? noopHandler,
    noopHandler,
  );
  const compactNav = useCompactNav();
  const { chipRef, iconRef, phase } = usePullGesture({
    enabled: compactNav && handler !== null,
    onRefresh: handler,
  });

  return (
    <div {...stylex.props(styles.lane)}>
      <div
        ref={chipRef}
        aria-hidden
        data-phase={phase}
        {...stylex.props(styles.chip, phase === "armed" && styles.chipArmed)}
      >
        <span
          ref={iconRef}
          {...stylex.props(
            styles.icon,
            phase === "refreshing" && styles.iconSpinning,
          )}
        >
          <RefreshCw size={18} />
        </span>
      </div>
      <span role="status" {...stylex.props(styles.srOnly)}>
        {phase === "refreshing" ? t`Refreshing` : ""}
      </span>
    </div>
  );
}
