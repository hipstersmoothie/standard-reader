import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getReaderDidForRequest } from "#/middleware/auth-session.server";
import { observe } from "#/server/observability/log";

import { dbMiddleware } from "./db-middleware";

/**
 * Web push: device registration and per-source notification opt-ins.
 *
 * All of this is app-owned DB state with no AT Proto record behind it — see the
 * doc comment on `src/db/schema/push.ts` for why. Nothing here talks to a PDS,
 * so every handler is a plain DB read/write against the session's DID.
 *
 * Note that these are API endpoints reachable independently of the UI that calls
 * them, so each handler that touches a reader's rows checks the session itself
 * rather than relying on a route guard.
 */

/** What a reader can ask to be notified about. */
export const PUSH_SUBJECT_TYPE = ["publication", "author"] as const;
export type PushSubjectTypeInput = (typeof PUSH_SUBJECT_TYPE)[number];

const subjectInput = z.object({
  subjectType: z.enum(PUSH_SUBJECT_TYPE),
  /** Publication AT-URI, or an author DID. */
  subject: z.string().min(1).max(512),
});

const deviceInput = z.object({
  endpoint: z.string().min(1).max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).nullish(),
});

/**
 * The VAPID public key the browser binds its subscription to. Deliberately a
 * server function rather than a `VITE_`-prefixed env var: those are inlined at
 * build time, which would mean the key has to exist on every machine that
 * builds the app, not just the ones that run it.
 *
 * Returns `null` when push isn't configured, so the UI can present itself as
 * unavailable instead of erroring.
 */
const getPushConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => {
    const { pushConfig } = await import("#/server/push/config");
    return { publicKey: pushConfig.canRegister ? pushConfig.publicKey : null };
  },
);

const getPushConfigQueryOptions = queryOptions({
  queryKey: ["push", "config"] as const,
  queryFn: () => getPushConfig(),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Record (or refresh) this browser's push endpoint. Keyed on `endpoint`, which
 * is the identity of a push subscription — re-registering the same browser
 * updates the keys and `lastSeenAt` rather than accumulating rows.
 *
 * The `ownerDid` is taken from the session, never from the client: otherwise
 * anyone could point another reader's notifications at their own endpoint.
 */
const registerPushDevice = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(deviceInput)
  .handler(
    observe("push.registerDevice", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        throw new Error("Sign in to enable notifications.");
      }
      span.set("did", did);

      const values = {
        endpoint: data.endpoint,
        ownerDid: did,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
        failureCount: 0,
        lastSeenAt: sql`now()`,
      };

      await context.db
        .insert(context.schema.pushDevices)
        .values(values)
        .onConflictDoUpdate({
          target: context.schema.pushDevices.endpoint,
          set: values,
        });

      return { ok: true as const };
    }),
  );

/** Forget this browser. Topics are left alone — the reader may still be getting
 * notifications on another device. */
const unregisterPushDevice = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(z.object({ endpoint: z.string().min(1).max(2048) }))
  .handler(
    observe("push.unregisterDevice", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { ok: true as const };
      span.set("did", did);

      await context.db
        .delete(context.schema.pushDevices)
        .where(
          and(
            eq(context.schema.pushDevices.endpoint, data.endpoint),
            eq(context.schema.pushDevices.ownerDid, did),
          ),
        );

      return { ok: true as const };
    }),
  );

/**
 * State for the settings section: whether *this* browser is registered, and how
 * many sources the reader is subscribed to overall (across every device).
 */
const getPushStatus = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(
    z.object({ endpoint: z.string().min(1).max(2048).nullish() }).optional(),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      deviceRegistered: boolean;
      deviceCount: number;
      topicCount: number;
    }> => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { deviceRegistered: false, deviceCount: 0, topicCount: 0 };
      }

      const [devices, topics] = await Promise.all([
        context.db
          .select({ endpoint: context.schema.pushDevices.endpoint })
          .from(context.schema.pushDevices)
          .where(eq(context.schema.pushDevices.ownerDid, did)),
        context.db
          .select({ n: count() })
          .from(context.schema.pushTopics)
          .where(eq(context.schema.pushTopics.ownerDid, did)),
      ]);

      const endpoint = data?.endpoint ?? null;
      return {
        deviceRegistered:
          endpoint != null && devices.some((d) => d.endpoint === endpoint),
        deviceCount: devices.length,
        topicCount: topics[0]?.n ?? 0,
      };
    },
  );

function getPushStatusQueryOptions(endpoint: string | null) {
  return queryOptions({
    queryKey: ["push", "status", endpoint] as const,
    queryFn: () => getPushStatus({ data: { endpoint } }),
    staleTime: 30_000,
  });
}

/** Is the bell on for this publication / author? */
const getNotifyStatus = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(subjectInput)
  .handler(async ({ data, context }): Promise<{ enabled: boolean }> => {
    const did = await getReaderDidForRequest(getRequest());
    if (!did) return { enabled: false };

    const rows = await context.db
      .select({ subject: context.schema.pushTopics.subject })
      .from(context.schema.pushTopics)
      .where(
        and(
          eq(context.schema.pushTopics.ownerDid, did),
          eq(context.schema.pushTopics.subjectType, data.subjectType),
          eq(context.schema.pushTopics.subject, data.subject),
        ),
      )
      .limit(1);

    return { enabled: rows.length > 0 };
  });

function getNotifyStatusQueryOptions(input: z.input<typeof subjectInput>) {
  return queryOptions({
    queryKey: ["push", "notify", input.subjectType, input.subject] as const,
    queryFn: () => getNotifyStatus({ data: input }),
    staleTime: 60_000,
  });
}

/** Turn the bell on or off for one source. */
const setNotifyTopic = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(subjectInput.extend({ enabled: z.boolean() }))
  .handler(
    observe("push.setNotifyTopic", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        throw new Error("Sign in to enable notifications.");
      }
      span.set("did", did);
      span.set("subjectType", data.subjectType);
      span.set("enabled", data.enabled);

      if (data.enabled) {
        await context.db
          .insert(context.schema.pushTopics)
          .values({
            ownerDid: did,
            subjectType: data.subjectType,
            subject: data.subject,
          })
          .onConflictDoNothing();
      } else {
        await context.db
          .delete(context.schema.pushTopics)
          .where(
            and(
              eq(context.schema.pushTopics.ownerDid, did),
              eq(context.schema.pushTopics.subjectType, data.subjectType),
              eq(context.schema.pushTopics.subject, data.subject),
            ),
          );
      }

      return { enabled: data.enabled };
    }),
  );

function setNotifyTopicMutationOptions() {
  return mutationOptions({
    mutationKey: ["push", "setNotifyTopic"] as const,
    mutationFn: (input: z.input<typeof subjectInput> & { enabled: boolean }) =>
      setNotifyTopic({ data: input }),
  });
}

/**
 * The global off switch: drop every device and every opt-in for this reader.
 * Deliberately blunt — the settings surface is minimal by design, so this is the
 * escape hatch for "stop, all of it".
 */
const disableAllPush = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(
    observe("push.disableAll", async ({ context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { ok: true as const };
      span.set("did", did);

      await Promise.all([
        context.db
          .delete(context.schema.pushDevices)
          .where(eq(context.schema.pushDevices.ownerDid, did)),
        context.db
          .delete(context.schema.pushTopics)
          .where(eq(context.schema.pushTopics.ownerDid, did)),
      ]);

      return { ok: true as const };
    }),
  );

function disableAllPushMutationOptions() {
  return mutationOptions({
    mutationKey: ["push", "disableAll"] as const,
    mutationFn: () => disableAllPush(),
  });
}

export const pushApi = {
  disableAllPush,
  disableAllPushMutationOptions,
  getNotifyStatus,
  getNotifyStatusQueryOptions,
  getPushConfig,
  getPushConfigQueryOptions,
  getPushStatus,
  getPushStatusQueryOptions,
  registerPushDevice,
  setNotifyTopic,
  setNotifyTopicMutationOptions,
  unregisterPushDevice,
};
