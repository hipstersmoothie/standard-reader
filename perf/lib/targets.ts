import {
  perfBaseUrl,
  perfBudgetMultiplier,
  perfDefaultTimeoutMs,
} from "./config.ts";
import { loadPerfFixtures } from "./fixtures.ts";

export type PerfAuthMode = "guest" | "signed-in";

export interface PerfTarget {
  /** Stable id for reports (e.g. `home`, `tag.feed`). */
  id: string;
  /** Human label in failure output. */
  name: string;
  /** Path + query (no origin). */
  path: string;
  auth: PerfAuthMode;
  /** Max wall-clock ms until the view is ready. */
  budgetMs: number;
  timeoutMs: number;
  /** When false, skip instead of fail if fixture env is missing. */
  required?: boolean;
}

interface SharedRouteDef {
  id: string;
  name: string;
  path: string;
  budgetMs: number;
  required?: boolean;
}

function scaleBudget(ms: number): number {
  return Math.round(ms * perfBudgetMultiplier());
}

function perfTarget(
  partial: Omit<PerfTarget, "timeoutMs"> & { timeoutMs?: number },
): PerfTarget {
  return {
    timeoutMs: partial.timeoutMs ?? perfDefaultTimeoutMs(),
    required: partial.required ?? true,
    ...partial,
    budgetMs: scaleBudget(partial.budgetMs),
  };
}

/** Routes measured for both guest and signed-in sessions (same path + budget). */
function sharedRouteDefs(): Array<SharedRouteDef> {
  const fixtures = loadPerfFixtures();

  const routes: Array<SharedRouteDef> = [
    {
      id: "home",
      name: "Home",
      path: "/",
      budgetMs: 3500,
    },
    {
      id: "latest.subscriptions",
      name: "Latest (subscriptions)",
      path: "/latest",
      budgetMs: 4000,
    },
    {
      id: "latest.trending",
      name: "Latest (trending)",
      path: "/latest?filter=trending",
      budgetMs: 4500,
    },
    {
      id: "discover",
      name: "Discover",
      path: "/discover",
      budgetMs: 5000,
    },
    {
      id: "search",
      name: "Search",
      path: `/search?q=${encodeURIComponent(fixtures.searchQuery)}`,
      budgetMs: 4000,
    },
    {
      id: "about",
      name: "About",
      path: "/about",
      budgetMs: 2500,
    },
    {
      id: "tag.feed",
      name: `Tag feed (${fixtures.tag})`,
      path: `/tag/${encodeURIComponent(fixtures.tag)}`,
      budgetMs: 5500,
    },
    {
      id: "tag.publications",
      name: `Tag publications (${fixtures.tag})`,
      path: `/tag/${encodeURIComponent(fixtures.tag)}?view=publications`,
      budgetMs: 5500,
    },
  ];

  if (fixtures.publicationPath) {
    routes.push({
      id: "publication",
      name: "Publication profile",
      path: fixtures.publicationPath,
      budgetMs: 3500,
      required: false,
    });
  }

  if (fixtures.articlePath) {
    routes.push({
      id: "article",
      name: "Article",
      path: fixtures.articlePath,
      budgetMs: 4500,
      required: false,
    });
  }

  return routes;
}

function sharedTargets(auth: PerfAuthMode): Array<PerfTarget> {
  const signedIn = auth === "signed-in";

  return sharedRouteDefs().map((route) =>
    perfTarget({
      id: signedIn ? `${route.id}.signed-in` : route.id,
      name: signedIn ? `${route.name} (signed in)` : route.name,
      path: route.path,
      auth,
      budgetMs: route.budgetMs,
      required: route.required,
    }),
  );
}

/** Signed-in-only routes (no guest counterpart). */
function signedInOnlyTargets(): Array<PerfTarget> {
  const fixtures = loadPerfFixtures();

  const targets = [
    perfTarget({
      id: "saved",
      name: "Saved for later",
      path: "/saved",
      auth: "signed-in",
      budgetMs: 5000,
    }),
    perfTarget({
      id: "history",
      name: "Reading history",
      path: "/history",
      auth: "signed-in",
      budgetMs: 5000,
    }),
    perfTarget({
      id: "likes",
      name: "Likes",
      path: "/likes",
      auth: "signed-in",
      budgetMs: 5000,
    }),
    perfTarget({
      id: "collections",
      name: "Collections",
      path: "/collections",
      auth: "signed-in",
      budgetMs: 5000,
    }),
  ];

  if (fixtures.collectionEditPath) {
    targets.push(
      perfTarget({
        id: "collections.edit",
        name: "Collection editor",
        path: fixtures.collectionEditPath,
        auth: "signed-in",
        budgetMs: 5000,
        required: false,
      }),
    );
  }

  return targets;
}

/** Guest-visible routes — always run in CI. */
export function guestTargets(): Array<PerfTarget> {
  void perfBaseUrl();
  return sharedTargets("guest");
}

/** Signed-in routes — skipped when perf auth credentials are unset. */
export function signedInTargets(): Array<PerfTarget> {
  return [...sharedTargets("signed-in"), ...signedInOnlyTargets()];
}

export function allTargets(): Array<PerfTarget> {
  return [...guestTargets(), ...signedInTargets()];
}

export function targetUrl(target: PerfTarget): string {
  return `${perfBaseUrl()}${target.path}`;
}

/** Base route id shared by guest + signed-in targets (strips `.signed-in`). */
export function sharedRouteId(targetId: string): string {
  return targetId.replace(/\.signed-in$/, "");
}
