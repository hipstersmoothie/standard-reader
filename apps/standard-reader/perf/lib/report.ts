import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { LoadMeasurement } from "./measure.ts";
import { sharedRouteId } from "./targets.ts";

const RESULTS_DIR = path.join(process.cwd(), "perf", "results");

export interface PerfComparisonPair {
  id: string;
  path: string;
  budgetMs: number;
  guest: LoadMeasurement | null;
  signedIn: LoadMeasurement | null;
  deltaMs: number | null;
}

export function writePerfReport(
  measurements: Array<LoadMeasurement>,
  meta: Record<string, string | number | boolean>,
): string {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const mode = typeof meta.mode === "string" ? meta.mode : "run";
  const outfile = path.join(
    RESULTS_DIR,
    `load-regression-${mode}-${timestamp}.json`,
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    ...meta,
    measurements,
    slowest: [...measurements].toSorted((a, b) => b.ms - a.ms).slice(0, 10),
    failures: measurements.filter((row) => row.overBudget),
  };

  writeFileSync(outfile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const latestMode = path.join(RESULTS_DIR, `latest-${mode}.json`);
  writeFileSync(latestMode, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return outfile;
}

export function writePerfComparisonReport(
  guest: Array<LoadMeasurement>,
  signedIn: Array<LoadMeasurement>,
  meta: Record<string, string | number | boolean>,
): string {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const guestByRoute = new Map(
    guest.map((row) => [sharedRouteId(row.id), row] as const),
  );
  const signedInByRoute = new Map(
    signedIn.map((row) => [sharedRouteId(row.id), row] as const),
  );

  const sharedIds = [...guestByRoute.keys()].toSorted();

  const pairs: Array<PerfComparisonPair> = sharedIds.map((id) => {
    const guestRow = guestByRoute.get(id) ?? null;
    const signedInRow = signedInByRoute.get(id) ?? null;
    const budgetMs = guestRow?.budgetMs ?? signedInRow?.budgetMs ?? 0;
    const deltaMs =
      guestRow && signedInRow ? signedInRow.ms - guestRow.ms : null;

    return {
      id,
      path: guestRow?.path ?? signedInRow?.path ?? "",
      budgetMs,
      guest: guestRow,
      signedIn: signedInRow,
      deltaMs,
    };
  });

  const signedInOnly = signedIn.filter(
    (row) => !guestByRoute.has(sharedRouteId(row.id)),
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    ...meta,
    pairs,
    signedInOnly,
    guestCount: guest.length,
    signedInCount: signedIn.length,
    sharedRouteCount: pairs.length,
  };

  const outfile = path.join(RESULTS_DIR, "latest-comparison.json");
  writeFileSync(outfile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const latest = path.join(RESULTS_DIR, "latest.json");
  writeFileSync(latest, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return outfile;
}

export function formatMeasurementLine(row: LoadMeasurement): string {
  const flag = row.overBudget ? "SLOW" : "ok";
  return `[${flag}] ${row.name}: ${row.ms}ms (budget ${row.budgetMs}ms) — ${row.path}`;
}
