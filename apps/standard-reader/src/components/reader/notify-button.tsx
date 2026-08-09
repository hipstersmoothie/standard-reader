"use client";

import { useLingui } from "@lingui/react/macro";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { toasts } from "@standard-reader/design-system/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { useState } from "react";

import { IconButtonLink } from "#/components/router-links";
import { pushApi } from "#/integrations/tanstack-query/api-push.functions";
import type { PushSubjectTypeInput } from "#/integrations/tanstack-query/api-push.functions";
import { ensurePushDevice, pushCapability } from "#/pwa/push";
import { useLoginSearch } from "#/utils/use-login-search";

import { IosInstallPrompt } from "./ios-install-prompt";

/**
 * "Notify me when this posts" — the bell shown next to Subscribe on a
 * publication page and next to Follow on an author page.
 *
 * Deliberately independent of subscribing/following: turning it on doesn't
 * change your feed, and you don't have to subscribe to be notified.
 *
 * Permission is requested from this press and nowhere else. That's a hard
 * requirement rather than a preference — Safari only honours
 * `requestPermission()` from a user gesture, and a `denied` in Chrome blocks the
 * origin for months, so prompting on load would be a one-way door for anyone who
 * dismissed it without reading.
 */
export function NotifyButton({
  subjectType,
  subject,
  signedIn,
  size = "md",
  variant = "secondary",
}: {
  subjectType: PushSubjectTypeInput;
  /** Publication AT-URI, or an author DID. */
  subject: string;
  signedIn: boolean;
  size?: "sm" | "md" | "lg";
  /** Match the surrounding control group. On a publication page the group takes
   * the publication's own accent when the reader hasn't subscribed, so leaving
   * this at the default made the bell the one button that ignored the theme. */
  variant?: "primary" | "secondary";
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const loginSearch = useLoginSearch();
  const [iosPromptOpen, setIosPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const statusKey = ["push", "notify", subjectType, subject] as const;
  const { data: status } = useQuery({
    ...pushApi.getNotifyStatusQueryOptions({ subjectType, subject }),
    enabled: signedIn,
  });
  const enabled = status?.enabled ?? false;

  const setTopic = useMutation(pushApi.setNotifyTopicMutationOptions());

  const iconSize = size === "lg" ? 18 : size === "md" ? 17 : 15;

  const toggle = async (next: boolean) => {
    // Optimistic — the bell flips instantly and rolls back on failure.
    const previous = queryClient.getQueryData(statusKey);
    queryClient.setQueryData(statusKey, { enabled: next });
    try {
      await setTopic.mutateAsync({ subjectType, subject, enabled: next });
      // Settings shows a running count of sources.
      await queryClient.invalidateQueries({ queryKey: ["push", "status"] });
    } catch {
      queryClient.setQueryData(statusKey, previous);
      toasts.add({
        description: t`Your notification setting didn’t save. Try again?`,
        title: t`Something went wrong`,
      });
    }
  };

  const onPress = async () => {
    // Turning off needs neither permission nor a device — just drop the row.
    if (enabled) {
      await toggle(false);
      return;
    }

    const capability = pushCapability();
    if (capability === "needs-ios-install") {
      setIosPromptOpen(true);
      return;
    }
    if (capability === "unsupported") {
      toasts.add({
        description: t`This browser doesn’t support web notifications.`,
        title: t`Notifications aren’t available here`,
      });
      return;
    }

    setPending(true);
    try {
      const result = await ensurePushDevice();
      if (result.status === "needs-ios-install") {
        setIosPromptOpen(true);
        return;
      }
      if (result.status === "denied") {
        toasts.add({
          description: t`Notifications are blocked for this site. You can turn them back on in your browser settings.`,
          title: t`Notifications are blocked`,
        });
        return;
      }
      if (result.status === "not-configured") {
        toasts.add({
          description: t`Notifications aren’t switched on for this site yet.`,
          title: t`Notifications aren’t available`,
        });
        return;
      }
      if (result.status === "timed-out") {
        toasts.add({
          description: t`Your browser didn’t finish setting up notifications. Reloading the page usually fixes it.`,
          title: t`That took too long`,
        });
        return;
      }
      if (result.status !== "ready") {
        toasts.add({
          description: t`We couldn’t set up notifications on this device. Try again?`,
          title: t`Something went wrong`,
        });
        return;
      }
      await toggle(true);
    } finally {
      setPending(false);
    }
  };

  if (!signedIn) {
    return (
      <IconButtonLink
        to="/login"
        search={loginSearch}
        variant={variant}
        size={size}
        label={t`Notify me about new posts`}
      >
        <Bell size={iconSize} aria-hidden />
      </IconButtonLink>
    );
  }

  return (
    <>
      <IconButton
        variant={variant}
        size={size}
        label={
          enabled ? t`Turn off notifications` : t`Notify me about new posts`
        }
        isDisabled={pending || setTopic.isPending}
        onPress={() => {
          void onPress();
        }}
      >
        {enabled ? (
          <BellRing size={iconSize} aria-hidden />
        ) : (
          <Bell size={iconSize} aria-hidden />
        )}
      </IconButton>

      <IosInstallPrompt
        isOpen={iosPromptOpen}
        onOpenChange={setIosPromptOpen}
      />
    </>
  );
}
