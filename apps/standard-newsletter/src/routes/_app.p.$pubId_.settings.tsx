import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { Button } from "@standard-reader/design-system/button";
import { TextField } from "@standard-reader/design-system/text-field";
import {
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import { fontSize } from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";

import { common } from "../common-styles";
import { I, Ico } from "../components/icons";
import {
  SettingRow,
  SettingsActionRow,
  SettingsSection,
} from "../components/settings";
import type { Publication } from "../data/publications";
import {
  disconnectPublicationFn,
  publicationsQueryOptions,
  senderDefaultsQueryOptions,
  updateSenderFn,
} from "../server/analytics";

export const Route = createFileRoute("/_app/p/$pubId_/settings")({
  loader: async ({ context, params }) => {
    const [pubs] = await Promise.all([
      context.queryClient.ensureQueryData(publicationsQueryOptions()),
      context.queryClient.ensureQueryData(senderDefaultsQueryOptions()),
    ]);
    if (!pubs.some((p) => p.id === params.pubId)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PubSettings,
});

const styles = stylex.create({
  // Settings is a single column of labelled rows, so it reads at a narrower
  // measure than the analytics screens.
  measure: { maxWidth: "760px" },
  head: {
    marginBlockEnd: spacing["9"],
    marginBlockStart: spacing["3.5"],
  },
  title: {
    fontSize: fontSize["3xl"],
  },
  subtitle: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginTop: verticalSpace.sm,
  },
  saved: {
    alignItems: "center",
    color: successColor.text1,
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.sm,
    rowGap: gap.sm,
  },
});

function PubSettings() {
  const { pubId } = Route.useParams();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const pub = pubs.find((p) => p.id === pubId);
  if (!pub) return null;

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadTight,
          styles.measure,
        )}
      >
        <Link
          to="/p/$pubId"
          params={{ pubId }}
          {...stylex.props(common.backLink)}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {pub.name}
        </Link>

        <div {...stylex.props(styles.head)}>
          <h1 {...stylex.props(common.pageTitle, styles.title)}>Settings</h1>
          <div {...stylex.props(styles.subtitle)}>
            How {pub.name} reaches its subscribers.
          </div>
        </div>

        <SenderSettings pub={pub} />
        <RemoveSection pub={pub} />
      </div>
    </div>
  );
}

/**
 * Per-newsletter From identity. Both fields fall back to the instance default
 * (shown as the placeholder) when left blank, so an author only overrides what
 * they want to change. Saving validates the address shape server-side; it must
 * also be on a verified Resend domain to actually deliver.
 */
function SenderSettings({ pub }: { pub: Publication }) {
  const queryClient = useQueryClient();
  const { data: defaults } = useSuspenseQuery(senderDefaultsQueryOptions());
  const [name, setName] = useState(pub.fromName ?? "");
  const [address, setAddress] = useState(pub.fromAddress ?? "");

  const dirty =
    name !== (pub.fromName ?? "") || address !== (pub.fromAddress ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateSenderFn({
        data: { publicationUri: pub.uri, fromName: name, fromAddress: address },
      }),
    onSuccess: async (result) => {
      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ["publications"] });
      }
    },
  });
  const invalidAddress =
    save.data && !save.data.ok && save.data.reason === "invalid-address";

  return (
    <SettingsSection label="Sender">
      <SettingRow
        label="From name"
        description="The name subscribers see in their inbox. Leave blank to use the default."
        field
      >
        <TextField
          aria-label="From name"
          value={name}
          onChange={setName}
          placeholder={defaults.fromName}
        />
      </SettingRow>
      <SettingRow
        label="From address"
        description="Where this newsletter is sent from. Must be on a verified sending domain; leave blank to use the default."
        field
      >
        <TextField
          aria-label="From address"
          value={address}
          onChange={setAddress}
          placeholder={defaults.fromAddress}
          type="email"
          autoComplete="off"
          validationState={invalidAddress ? "invalid" : undefined}
          errorMessage={
            invalidAddress
              ? "That doesn’t look like a valid email address."
              : undefined
          }
        />
      </SettingRow>
      <SettingsActionRow>
        {save.data?.ok && !dirty ? (
          <span {...stylex.props(styles.saved)}>
            <Ico d={I.check} s={14} w={2.2} />
            Saved
          </span>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          isPending={save.isPending}
          isDisabled={!dirty}
          onPress={() => save.mutate()}
        >
          Save
        </Button>
      </SettingsActionRow>
    </SettingsSection>
  );
}

/**
 * Disconnect ("remove") a newsletter. Confirms first because the publication
 * leaves the app — but it's non-destructive to the data: the subscriber list and
 * past sends are kept, so adding it again later resumes. On success the cache is
 * invalidated and we return to the dashboard, since this publication's pages no
 * longer exist.
 */
function RemoveSection({ pub }: { pub: Publication }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      disconnectPublicationFn({ data: { publicationUri: pub.uri } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["publications"] });
      navigate({ to: "/dashboard" });
    },
  });

  return (
    <SettingsSection label="Mailing">
      <SettingRow
        label="Remove newsletter"
        description="Stop mailing new posts and take this publication off your dashboard. Its subscriber list and past sends are kept."
      >
        <AlertDialog
          trigger={
            <Button variant="critical-outline" size="sm">
              Remove
            </Button>
          }
        >
          <AlertDialogHeader>Remove {pub.name}?</AlertDialogHeader>
          <AlertDialogDescription>
            New posts from {pub.name} will stop being mailed and it leaves your
            dashboard. Its subscriber list and past sends are kept — you can add
            it again anytime.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancelButton isDisabled={remove.isPending} />
            <AlertDialogActionButton
              variant="critical"
              closeOnPress={false}
              isPending={remove.isPending}
              onPress={() => remove.mutate()}
            >
              Remove newsletter
            </AlertDialogActionButton>
          </AlertDialogFooter>
        </AlertDialog>
      </SettingRow>
    </SettingsSection>
  );
}
