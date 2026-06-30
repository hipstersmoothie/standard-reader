import { createServerFn } from "@tanstack/react-start";
import {
  loadApiDocsFixturesAsync,
  loadApiDocsPageData,
} from "#/server/api-docs/fixtures.server";
import {
  runApiDocsExamples,
  runXrpcExample,
} from "#/server/api-docs/run-example.server";
import { z } from "zod";

const runExampleInput = z.object({
  nsid: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  useSessionAuth: z.boolean().optional(),
});

export const runApiDocsExample = createServerFn({ method: "POST" })
  .validator(runExampleInput)
  .handler(async ({ data }) =>
    runXrpcExample(data.nsid, {
      params: data.params,
      body: data.body,
      useSessionAuth: data.useSessionAuth,
    }),
  );

export const loadApiDocsExamples = createServerFn({ method: "GET" }).handler(
  async () => runApiDocsExamples(),
);

export const getApiDocsFixtures = createServerFn({ method: "GET" }).handler(
  async () => loadApiDocsFixturesAsync(),
);

export const getApiDocsPageData = createServerFn({ method: "GET" }).handler(
  async () => loadApiDocsPageData(),
);
