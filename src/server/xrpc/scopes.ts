import { scope as atprotoScope } from "@atcute/oauth-node-client";
import { APP_NSID, STANDARD_NSID } from "#/lib/atproto/nsids";

/** OAuth repo scope strings for write procedures (`getSession.scopes`). */
export const XRPC_WRITE_SCOPES = {
  subscription: atprotoScope.repo({
    collection: [STANDARD_NSID.subscription],
  }),
  recommend: atprotoScope.repo({
    collection: [STANDARD_NSID.recommend],
  }),
  read: atprotoScope.repo({
    collection: [APP_NSID.read],
  }),
  bookmark: atprotoScope.repo({
    collection: [APP_NSID.bookmark],
  }),
  list: atprotoScope.repo({
    collection: [APP_NSID.list],
  }),
  listSave: atprotoScope.repo({
    collection: [APP_NSID.listSave],
  }),
  labelerSubscription: atprotoScope.repo({
    collection: [APP_NSID.labelerSubscription],
  }),
} as const;
