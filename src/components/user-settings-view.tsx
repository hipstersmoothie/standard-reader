"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useCallback, useState } from "react";

import { invalidateReadQueries } from "#/components/reader/read-optimistic";
import { ButtonLink } from "#/components/router-links";
import { DirectionalIcon } from "#/design-system/directional-icon";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { DEFAULT_CUSTOM_GOOGLE_FONT } from "#/lib/google-fonts";
import type { Locale } from "#/lib/locale";
import { LOCALE_LABELS, LOCALES, PSEUDO_LOCALE, isLocale } from "#/lib/locale";
import { AMERICAN_ENGLISH_VOICES } from "#/lib/page-reader/voice-catalog";
import { isReaderVoicePreference } from "#/lib/reader-voice";
import type { ReadingTypographyPreference } from "#/lib/reading-typography";
import {
  READING_BODY_FONTS,
  READING_FONT_SIZES,
  READING_MEASURES,
  readingBodyFontLabel,
  readingFontSizeLabel,
  readingMeasureLabel,
} from "#/lib/reading-typography";
import type { ThemeMode } from "#/lib/theme";
import { isThemeMode } from "#/lib/theme";
import { useCountOldPostsAsUnread } from "#/lib/use-count-old-posts-as-unread";
import { useLocale } from "#/lib/use-locale";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";
import { useOpenLinks } from "#/lib/use-open-links";
import { useReaderVoice } from "#/lib/use-reader-voice";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { useTheme } from "#/lib/use-theme";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../design-system/alert-dialog";
import { Avatar } from "../design-system/avatar";
import { Button } from "../design-system/button";
import { Dialog, DialogBody, DialogHeader } from "../design-system/dialog";
import { Flex } from "../design-system/flex";
import { ProgressCircle } from "../design-system/progress-circle";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { Select, SelectItem } from "../design-system/select";
import { Separator } from "../design-system/separator";
import { Switch } from "../design-system/switch";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";
import { Masthead, ReaderContent } from "./reader/primitives";
import { ReadingCustomFontPicker } from "./reading-custom-font-picker";
import { ReadingSettingsPreview } from "./reading-settings-preview";
import { TypographySegmentedControl } from "./typography-segmented-control";

const MOBILE = "@media (max-width: 47.5rem)";

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: MessageDescriptor;
  icon: React.ComponentType<{ size?: number | string }>;
}> = [
  { id: "light", label: msg`Light`, icon: Sun },
  { id: "dark", label: msg`Dark`, icon: Moon },
  { id: "system", label: msg`System`, icon: Monitor },
];

/** The pseudo-locale is a translation-coverage tool, not a language to ship. */
const LOCALE_OPTIONS: ReadonlyArray<Locale> = LOCALES.filter(
  (locale) => locale !== PSEUDO_LOCALE || import.meta.env.DEV,
);

const styles = stylex.create({
  section: {
    marginTop: verticalSpace["7xl"],
  },
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    marginBottom: verticalSpace["3xl"],
  },
  settingGroup: {
    borderColor: uiColor.border1,
    borderRadius: spacing["2"],
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  settingRow: {
    alignItems: {
      [MOBILE]: "stretch",
      default: "center",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      [MOBILE]: "column",
      default: "row",
    },
    justifyContent: "space-between",
    rowGap: gap["lg"],
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  settingLabel: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.xs,
    marginTop: verticalSpace.none,
  },
  settingDescription: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "42ch",
  },
  settingControl: {
    flexShrink: 0,
    width: {
      [MOBILE]: "100%",
      default: "auto",
    },
  },
  labelerList: {
    gap: gap.xs,
    paddingBlock: verticalSpace.md,
    display: "flex",
    flexDirection: "column",
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  labelerLink: {
    borderRadius: radius.md,
    paddingBlock: verticalSpace.sm,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": uiColor.component2 },
    color: uiColor.text2,
    columnGap: gap.md,
    display: "flex",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    justifyContent: "space-between",
    paddingInlineStart: horizontalSpace.md,
    paddingInlineEnd: horizontalSpace.md,
  },
  labelerMain: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    minWidth: 0,
  },
  labelerName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  labelerChevron: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  labelerEmpty: {
    marginBlock: verticalSpace.none,
    paddingBlock: verticalSpace["xl"],
    color: uiColor.text1,
    fontSize: fontSize.sm,
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
  },
  segmentedControl: {
    width: {
      [MOBILE]: "100%",
      default: "auto",
    },
  },
  voiceSelect: {
    minWidth: {
      [MOBILE]: "100%",
      default: spacing["56"],
    },
    width: {
      [MOBILE]: "100%",
      default: spacing["56"],
    },
  },
  deletionRow: {
    alignItems: {
      [MOBILE]: "stretch",
      default: "center",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      [MOBILE]: "column",
      default: "row",
    },
    justifyContent: "space-between",
    rowGap: gap["lg"],
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  deletionIntro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace.none,
    maxWidth: "52ch",
  },
  digestPreviewBody: {
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    paddingInlineStart: horizontalSpace.none,
    paddingInlineEnd: horizontalSpace.none,
  },
  digestPreviewContainer: {
    minHeight: "70vh",
    position: "relative",
    width: "100%",
  },
  digestPreviewFrame: {
    borderWidth: 0,
    display: "block",
    height: "70vh",
    width: "100%",
  },
  digestPreviewFrameLoading: {
    opacity: 0,
  },
  digestPreviewSpinner: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    position: "absolute",
  },
});

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.settingRow)}>
      <div>
        <p {...stylex.props(styles.settingLabel)}>{label}</p>
        {description ? (
          <p {...stylex.props(styles.settingDescription)}>{description}</p>
        ) : null}
      </div>
      <div {...stylex.props(styles.settingControl)}>{children}</div>
    </div>
  );
}

function DataDeletionRow({
  label,
  description,
  dialogTitle,
  dialogDescription,
  confirmLabel,
  isPending,
  onConfirm,
}: {
  label: string;
  description: string;
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel: string;
  isPending: boolean;
  onConfirm: (close: () => void) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div {...stylex.props(styles.deletionRow)}>
      <div>
        <p {...stylex.props(styles.settingLabel)}>{label}</p>
        <p {...stylex.props(styles.settingDescription)}>{description}</p>
      </div>
      <AlertDialog
        isOpen={open}
        onOpenChange={setOpen}
        trigger={
          <Button variant="critical-outline" onPress={() => setOpen(true)}>
            <Trans>Delete</Trans>
          </Button>
        }
      >
        <AlertDialogHeader>{dialogTitle}</AlertDialogHeader>
        <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancelButton isDisabled={isPending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancelButton>
          <AlertDialogActionButton
            variant="critical"
            closeOnPress={false}
            isPending={isPending}
            onPress={() => onConfirm(() => setOpen(false))}
          >
            {confirmLabel}
          </AlertDialogActionButton>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  );
}

export function UserSettingsView() {
  const { t, i18n } = useLingui();
  const queryClient = useQueryClient();
  const labelers = useQuery(labelerApi.getLabelersQueryOptions());
  const { mode, setMode } = useTheme();
  const { locale, setLocale } = useLocale();
  const { preference: voice, setPreference: setVoice } = useReaderVoice();
  const { preference: typography, setPreference: setTypography } =
    useReadingTypography();
  const setFontSize = useCallback(
    (nextFontSize: ReadingTypographyPreference["fontSize"]) => {
      setTypography({ fontSize: nextFontSize });
    },
    [setTypography],
  );
  const setMeasure = useCallback(
    (measure: ReadingTypographyPreference["measure"]) => {
      setTypography({ measure });
    },
    [setTypography],
  );
  const setBodyFont = useCallback(
    (bodyFont: ReadingTypographyPreference["bodyFont"]) => {
      if (bodyFont === "custom") {
        setTypography({
          bodyFont: "custom",
          customFontFamily:
            typography.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT,
        });
        return;
      }
      setTypography({ bodyFont, customFontFamily: undefined });
    },
    [setTypography, typography.customFontFamily],
  );
  const setCustomFontFamily = useCallback(
    (customFontFamily: string) => {
      setTypography({ bodyFont: "custom", customFontFamily });
    },
    [setTypography],
  );
  const { openExternally, setOpenExternally } = useOpenLinks();
  const { openInMagazine, setOpenInMagazine } = useOpenCollectionsInMagazine();
  const { enabled: trackReading, setEnabled: setTrackReading } =
    useTrackReadingHistory();
  const { enabled: countOldAsUnread, setEnabled: setCountOldAsUnread } =
    useCountOldPostsAsUnread();

  const deleteHistoryMutation = useMutation(
    readerApi.deleteAllReadHistoryMutationOptions(),
  );
  const deleteBookmarksMutation = useMutation(
    readerApi.deleteAllBookmarksMutationOptions(),
  );
  const deleteListsMutation = useMutation(
    listApi.deleteAllListsMutationOptions(),
  );

  const digestStatusQuery = useQuery(user.getWeeklyDigestStatusQueryOptions);
  // "On" requires both the opt-in flag AND the actually-granted email scope —
  // if the opt-in re-auth never completed, the toggle reads off so re-enabling
  // re-runs the authorize flow.
  const digestEnabled = Boolean(
    digestStatusQuery.data?.enabled && digestStatusQuery.data?.hasEmailScope,
  );
  const digestEmail = digestStatusQuery.data?.email ?? null;

  const enableDigestMutation = useMutation({
    mutationFn: async () => {
      const redirect = globalThis.location
        ? globalThis.location.pathname + globalThis.location.search
        : "/settings";
      const result = await auth.upgradeToWeeklyDigest({ data: { redirect } });
      // Full navigation to the PDS authorize screen — grants `transition:email`
      // and returns to `redirect`; the callback captures the email.
      globalThis.location.href = result.authorizationUrl;
    },
  });
  const disableDigestMutation = useMutation({
    mutationFn: async () => auth.disableWeeklyDigest(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: user.getWeeklyDigestStatusQueryOptions.queryKey,
      });
    },
  });
  const digestPending =
    enableDigestMutation.isPending || disableDigestMutation.isPending;
  const [digestDialogOpen, setDigestDialogOpen] = useState(false);
  const [digestPreviewOpen, setDigestPreviewOpen] = useState(false);
  const [digestPreviewLoading, setDigestPreviewLoading] = useState(true);

  const onToggleDigest = (next: boolean) => {
    // Turning on requests the `transition:email` scope (a full PDS re-auth), so
    // confirm first and explain why. Turning off just clears the flag — no
    // re-auth, no dialog.
    if (next) setDigestDialogOpen(true);
    else disableDigestMutation.mutate();
  };

  const onDeleteHistory = (close: () => void) => {
    deleteHistoryMutation.mutate(undefined, {
      onSuccess: () => {
        close();
        invalidateReadQueries(queryClient);
      },
    });
  };

  const onDeleteBookmarks = (close: () => void) => {
    deleteBookmarksMutation.mutate(undefined, {
      onSuccess: () => {
        close();
        void queryClient.invalidateQueries({ queryKey: ["reader", "saved"] });
        void queryClient.invalidateQueries({
          queryKey: ["reader", "bookmarkStatus"],
        });
        void queryClient.invalidateQueries({
          queryKey: feedApi.getSidebarQueryOptions().queryKey,
        });
      },
    });
  };

  const onDeleteLists = (close: () => void) => {
    deleteListsMutation.mutate(undefined, {
      onSuccess: () => {
        close();
        void queryClient.invalidateQueries({ queryKey: ["reader", "lists"] });
        void queryClient.invalidateQueries({
          queryKey: feedApi.getSidebarQueryOptions().queryKey,
        });
      },
    });
  };

  return (
    <ReaderContent>
      <Masthead
        kicker={<Trans>Account</Trans>}
        title={<Trans>Settings</Trans>}
        dek={<Trans>Appearance, reading preferences, and personal data.</Trans>}
      />

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Appearance</Trans>
        </h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label={t`Theme`}
            description={t`Choose light, dark, or match your system setting.`}
          >
            <SegmentedControl
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys: Set<React.Key> | "all") => {
                const key = keys === "all" ? undefined : String([...keys][0]);
                if (isThemeMode(key)) setMode(key);
              }}
              style={styles.segmentedControl}
            >
              {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
                <SegmentedControlItem key={id} id={id}>
                  <Flex align="center" gap="xs">
                    <Icon size={14} />
                    {i18n._(label)}
                  </Flex>
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </SettingRow>
          <Separator />
          <SettingRow
            label={t`Language`}
            description={t`The language used for the reader interface. Articles are shown in the language they were written in.`}
          >
            <Select
              size="lg"
              aria-label={t`Language`}
              selectedKey={locale}
              onSelectionChange={(key) => {
                if (key == null) return;
                const next = String(key);
                if (isLocale(next)) setLocale(next);
              }}
            >
              {LOCALE_OPTIONS.map((option) => (
                <SelectItem
                  key={option}
                  id={option}
                  textValue={LOCALE_LABELS[option]}
                >
                  {LOCALE_LABELS[option]}
                </SelectItem>
              ))}
            </Select>
          </SettingRow>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Behavior</Trans>
        </h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label={t`Open posts externally`}
            description={t`When on, links open on the original website instead of the in-app reader.`}
          >
            <Switch
              isSelected={openExternally}
              onChange={setOpenExternally}
              aria-label={t`Open posts externally`}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label={t`Open collections in magazine`}
            description={t`When on, collection posts open in the magazine edition instead of the reader view.`}
          >
            <Switch
              isSelected={openInMagazine}
              onChange={setOpenInMagazine}
              aria-label={t`Open collections in magazine`}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label={t`Track reading history`}
            description={t`When on, articles you open are recorded as public read records in your account.`}
          >
            <Switch
              isSelected={trackReading}
              onChange={setTrackReading}
              aria-label={t`Track reading history`}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label={t`Mark old posts as unread`}
            description={t`When on, everything a publication has ever posted counts as unread the moment you subscribe. Turn off to only mark posts published after you subscribe as new — older posts stay unread but lose their dot.`}
          >
            <Switch
              isSelected={countOldAsUnread}
              onChange={setCountOldAsUnread}
              aria-label={t`Mark old posts as unread`}
            />
          </SettingRow>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Weekly digest</Trans>
        </h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label={t`Weekly digest email`}
            description={
              digestEnabled && digestEmail
                ? t`On — delivered to ${digestEmail}. The best of the publications you subscribe to, plus a couple worth discovering.`
                : t`A weekly email with the best of what you subscribe to, plus a couple of publications worth discovering. Turning this on asks your PDS to share your email address.`
            }
          >
            <Flex align="center" gap="md">
              <Dialog
                size="lg"
                isOpen={digestPreviewOpen}
                onOpenChange={setDigestPreviewOpen}
                trigger={
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setDigestPreviewLoading(true);
                      setDigestPreviewOpen(true);
                    }}
                  >
                    <Trans>Preview</Trans>
                  </Button>
                }
              >
                <DialogHeader>
                  <Trans>Your weekly digest</Trans>
                </DialogHeader>
                <DialogBody style={styles.digestPreviewBody}>
                  {digestPreviewOpen ? (
                    <div {...stylex.props(styles.digestPreviewContainer)}>
                      {digestPreviewLoading ? (
                        <div {...stylex.props(styles.digestPreviewSpinner)}>
                          <ProgressCircle
                            isIndeterminate
                            size="lg"
                            aria-label={t`Loading digest preview`}
                          />
                        </div>
                      ) : null}
                      {/* oxlint-disable-next-line iframe-has-title --
                          the title IS set below; the rule can't statically
                          resolve a tagged-template expression. */}
                      <iframe
                        title={t`Weekly digest preview`}
                        src="/api/digest/preview"
                        onLoad={() => setDigestPreviewLoading(false)}
                        {...stylex.props(
                          styles.digestPreviewFrame,
                          digestPreviewLoading &&
                            styles.digestPreviewFrameLoading,
                        )}
                      />
                    </div>
                  ) : null}
                </DialogBody>
              </Dialog>
              <Switch
                isSelected={digestEnabled}
                onChange={onToggleDigest}
                isDisabled={digestPending || digestStatusQuery.isLoading}
                aria-label={t`Weekly digest email`}
              />
            </Flex>
          </SettingRow>
          <AlertDialog
            isOpen={digestDialogOpen}
            onOpenChange={setDigestDialogOpen}
            trigger={null}
          >
            <AlertDialogHeader>
              <Trans>Enable the weekly digest</Trans>
            </AlertDialogHeader>
            <AlertDialogDescription>
              <Trans>
                To email your digest, Standard Reader needs your account email
                address. We'll ask your PDS to share it — you'll be sent to your
                login to approve the request, then brought right back here. Your
                email is used only to send the weekly digest, and you can turn
                it off any time.
              </Trans>
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancelButton
                isDisabled={enableDigestMutation.isPending}
              >
                <Trans>Not now</Trans>
              </AlertDialogCancelButton>
              <AlertDialogActionButton
                closeOnPress={false}
                isPending={enableDigestMutation.isPending}
                onPress={() => enableDigestMutation.mutate()}
              >
                <Trans>Continue to approve</Trans>
              </AlertDialogActionButton>
            </AlertDialogFooter>
          </AlertDialog>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Reading</Trans>
        </h2>
        <div {...stylex.props(styles.settingGroup)}>
          <ReadingSettingsPreview voicePreference={voice} />
          <SettingRow label={t`Text size`}>
            <TypographySegmentedControl
              value={typography.fontSize}
              options={READING_FONT_SIZES}
              label={readingFontSizeLabel}
              onChange={setFontSize}
              style={styles.segmentedControl}
            />
          </SettingRow>
          <Separator />
          <SettingRow label={t`Column width`}>
            <TypographySegmentedControl
              value={typography.measure}
              options={READING_MEASURES}
              label={readingMeasureLabel}
              onChange={setMeasure}
              style={styles.segmentedControl}
            />
          </SettingRow>
          <Separator />
          <SettingRow label={t`Body font`}>
            <TypographySegmentedControl
              value={typography.bodyFont}
              options={READING_BODY_FONTS}
              label={readingBodyFontLabel}
              onChange={setBodyFont}
              style={styles.segmentedControl}
            />
          </SettingRow>
          {typography.bodyFont === "custom" && (
            <>
              <Separator />
              <SettingRow
                label={t`Google Font`}
                description={t`Search and pick any family from the Google Fonts catalog.`}
              >
                <ReadingCustomFontPicker
                  value={
                    typography.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT
                  }
                  onChange={setCustomFontFamily}
                />
              </SettingRow>
            </>
          )}
          <Separator />
          <SettingRow
            label={t`Listen aloud voice`}
            description={t`The voice used when you listen to an article with read aloud.`}
          >
            <Select
              size="lg"
              aria-label={t`Reader voice`}
              selectedKey={voice}
              style={styles.voiceSelect}
              onSelectionChange={(key) => {
                if (key == null) return;
                const next = String(key);
                if (isReaderVoicePreference(next)) setVoice(next);
              }}
            >
              <SelectItem
                id="auto"
                textValue={t`Auto`}
                prefix={<Sparkles size={14} />}
              >
                <Trans>Auto</Trans>
              </SelectItem>
              {AMERICAN_ENGLISH_VOICES.map((voiceOption) => (
                <SelectItem
                  key={voiceOption.id}
                  id={voiceOption.id}
                  textValue={`${voiceOption.name} (${voiceOption.overallGrade})`}
                >
                  {voiceOption.name} ({voiceOption.overallGrade})
                </SelectItem>
              ))}
            </Select>
          </SettingRow>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Moderation</Trans>
        </h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label={t`Labelers`}
            description={t`Subscribe to labelers to flag, blur, or hide content as you read.`}
          >
            <ButtonLink to="/labelers" variant="secondary" size="sm">
              <Trans>Browse labelers</Trans>
            </ButtonLink>
          </SettingRow>
          <Separator />
          {(labelers.data?.length ?? 0) === 0 ? (
            <p {...stylex.props(styles.labelerEmpty)}>
              <Trans>No labelers subscribed</Trans>
            </p>
          ) : (
            <div {...stylex.props(styles.labelerList)}>
              {labelers.data?.map((card) => {
                const name = card.displayName ?? card.did;
                const fallback = name
                  .replace(/^did:\w+:/, "")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <Link
                    key={card.did}
                    to="/labelers/$did"
                    params={{ did: card.did }}
                    {...stylex.props(styles.labelerLink)}
                  >
                    <span {...stylex.props(styles.labelerMain)}>
                      <Avatar
                        size="sm"
                        src={card.avatar}
                        fallback={fallback}
                        alt={name}
                      />
                      <span {...stylex.props(styles.labelerName)}>{name}</span>
                    </span>
                    <DirectionalIcon
                      as={ChevronRight}
                      size={16}
                      style={styles.labelerChevron}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Personal data</Trans>
        </h2>
        <p {...stylex.props(styles.deletionIntro)}>
          <Trans>
            Permanently remove data stored in your account. These actions delete
            records from your account and cannot be undone.
          </Trans>
        </p>
        <div {...stylex.props(styles.settingGroup)}>
          <DataDeletionRow
            label={t`Reading history`}
            description={t`All articles you have marked as read.`}
            dialogTitle={t`Delete all reading history?`}
            dialogDescription={t`Every read record in your repository will be removed. Articles will appear unread again across the app. This cannot be undone.`}
            confirmLabel={t`Delete history`}
            isPending={deleteHistoryMutation.isPending}
            onConfirm={onDeleteHistory}
          />
          <Separator />
          <DataDeletionRow
            label={t`Bookmarks`}
            description={t`All articles you have saved for later.`}
            dialogTitle={t`Delete all bookmarks?`}
            dialogDescription={t`Every saved article will be removed from your repository. Your Saved for later list will be empty. This cannot be undone.`}
            confirmLabel={t`Delete bookmarks`}
            isPending={deleteBookmarksMutation.isPending}
            onConfirm={onDeleteBookmarks}
          />
          <Separator />
          <DataDeletionRow
            label={t`Publication lists`}
            description={t`All publication lists you created in this app.`}
            dialogTitle={t`Delete all lists?`}
            dialogDescription={t`Every list you own will be removed from your account. Anyone who saved your lists will no longer see them in their sidebar. This cannot be undone.`}
            confirmLabel={t`Delete lists`}
            isPending={deleteListsMutation.isPending}
            onConfirm={onDeleteLists}
          />
        </div>
      </section>
    </ReaderContent>
  );
}
