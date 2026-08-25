"use client";

import { useLingui } from "@lingui/react/macro";
import {
  animationDuration,
  animationTimingFunction,
} from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { mediaQueries } from "@standard-reader/design-system/theme/media-queries.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { size } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { rootRouteId, useRouter } from "@tanstack/react-router";
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

import { isShellQuery } from "#/integrations/tanstack-query/shell-queries";
import { useCompactNav } from "#/lib/use-media-query";
import { useOnlineStatus } from "#/lib/use-online-status";
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
 * Refetch what the page is showing, and only that: the route's own loaders plus
 * the queries it mounted. Scroll position and local UI state survive, which a
 * document reload would not.
 *
 * The shell is deliberately left alone. Its loaders re-fetch the session and
 * every saved preference, and its queries back the sidebar — none of which is
 * what a reader is asking for when they pull down on a feed, and all of which
 * costs a round trip they wait on. `isShellQuery` and the two shell route ids
 * below are the whole boundary.
 */
function useDefaultRefresh(): RefreshHandler {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async () =>
      Promise.all([
        router.invalidate({
          filter: (match) => !SHELL_ROUTE_IDS.has(match.routeId),
        }),
        queryClient.refetchQueries({
          type: "active",
          predicate: (query) => !isShellQuery(query.queryKey),
        }),
      ]),
    [queryClient, router],
  );
}

/** The matches that render the shell around every page, not the page itself. */
const SHELL_ROUTE_IDS = new Set<string>([rootRouteId, "/_layout"]);

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

/**
 * The reduced-motion stand-in for the spinner. The reader still needs to see
 * that the refresh is running, so the signal stays — it just stops rotating,
 * which is the part the preference is actually about.
 */
const breathe = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.4 },
  "100%": { opacity: 1 },
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
  // Flat and bordered, not floating: the page opens a gap and the chip is what
  // is behind it, so a drop shadow would claim an elevation it doesn't have.
  // A raised fill plus the warm tonal border does the separating instead — the
  // system's resting vocabulary.
  chip: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    // The icon is the whole content of the indicator, so it takes the ink step
    // rather than the muted one reserved for secondary text.
    color: uiColor.text2,
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
  // Far enough to let go, and then for as long as the refresh runs. This is the
  // one moment the reader has to perceive, at 44px, under their own thumb — so
  // it takes the accent the way a selected filter chip does (subtle fill, not
  // just an outline), legible in peripheral vision without shouting.
  //
  // It has to hold through `refreshing` as well as `armed`: a quick pull crosses
  // the threshold and commits within a few frames, and dropping the accent at
  // the hand-off turns the whole thing into a flash of colour that's gone before
  // it means anything. The accent says "committed" — it leaves when the work
  // does.
  chipEngaged: {
    backgroundColor: primaryColor.component1,
    borderColor: primaryColor.border2,
    // `text1`, not `text2`: in this theme the accent's `text2` step is a warm
    // near-black — the same ink the resting chip already uses, so arming would
    // have changed nothing. `text1` is the camel the palette calls accent text.
    color: primaryColor.text1,
  },
  icon: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  },
  // The pull itself keeps moving under `prefers-reduced-motion` — it is the
  // reader's own finger, and a gesture that doesn't follow the hand is broken,
  // not calm. This spin is the part that runs on its own, so it is the part
  // that gives way: the icon fades in place instead of rotating.
  iconSpinning: {
    animationDuration: animationDuration.indeterminateCycle,
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      [mediaQueries.reducedMotion]: breathe,
    },
    animationTimingFunction: {
      default: "linear",
      [mediaQueries.reducedMotion]: animationTimingFunction.easeInOut,
    },
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
 * `contentRef` is the page the gesture drags: the shell's content column, which
 * travels down with the finger and reveals this lane's chip in the gap it opens.
 *
 * Deliberately not marked `aria-busy` — the perf suite treats a cleared
 * `aria-busy` as "the page is ready" (`perf/lib/measure.ts`), and a refresh the
 * reader asked for is not part of that first-paint contract.
 */
export function PullToRefreshLane({
  contentRef,
}: {
  contentRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useLingui();
  const store = useContext(PullToRefreshContext);
  const handler = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getHandler ?? noopHandler,
    noopHandler,
  );
  const compactNav = useCompactNav();
  const online = useOnlineStatus();
  const { chipRef, iconRef, phase } = usePullGesture({
    contentRef,
    // Refreshing offline can only refetch what is already on the device, and
    // the refetch fails — so the gesture's whole reward is an error. Disabled
    // rather than silently no-op'd, so the chip never appears and the reader
    // isn't told the pull did something.
    enabled: compactNav && handler !== null && online,
    onRefresh: handler,
  });

  // Armed and refreshing are one continuous state to the eye: the reader
  // committed, and the app is doing it.
  const engaged = phase === "armed" || phase === "refreshing";

  return (
    <div {...stylex.props(styles.lane)}>
      <div
        ref={chipRef}
        aria-hidden
        data-phase={phase}
        {...stylex.props(styles.chip, engaged && styles.chipEngaged)}
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
