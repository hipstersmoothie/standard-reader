import { toasts } from "#/design-system/toast";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getQueryClient } from "#/integrations/tanstack-query/query-client";

/**
 * Key of the currently visible reauth toast, if any. A user whose stored OAuth
 * session predates a newly-requested scope will fail every write against the new
 * collection, so we de-dupe to a single toast instead of stacking one per
 * attempt.
 */
let reauthToastKey: string | null = null;

/** Send the reader back through OAuth so the new scopes get granted. */
async function reauthorize(handle: string | null): Promise<void> {
  if (globalThis.window === undefined) return;
  const { location } = globalThis;
  const redirect = location.pathname + location.search + location.hash;

  // Without a known handle we can't pre-fill authorize; the login page lets the
  // reader pick a saved handle, which re-grants the full current scope.
  if (!handle) {
    location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    return;
  }

  try {
    const { authorizationUrl } = await auth.authorize({
      data: { handle, redirect },
    });
    location.href = authorizationUrl;
  } catch {
    location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
  }
}

/**
 * Prompt a signed-in reader to reconnect their account after the app starts
 * requesting permissions their existing session was never granted. Called from
 * the global mutation error handler when a write fails with a missing-scope
 * error (see {@link isAtprotoScopeMissingError}).
 */
export function showReauthToast(): void {
  if (globalThis.window === undefined) return;
  if (reauthToastKey !== null) return;

  const handle =
    getQueryClient().getQueryData(user.getSessionQueryOptions.queryKey)?.user
      ?.handle ?? null;

  reauthToastKey = toasts.add(
    {
      variant: "warning",
      title: "Reconnect your account",
      description:
        "Standard Reader needs updated permissions to save that. Sign in again to continue.",
      action: {
        label: "Reconnect",
        variant: "primary",
        onPress: () => {
          void reauthorize(handle);
        },
      },
    },
    {
      onClose: () => {
        reauthToastKey = null;
      },
    },
  );
}
