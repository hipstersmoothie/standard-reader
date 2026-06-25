"use client";

import type { ReadingTypographyPreference } from "#/lib/reading-typography";
import type { ThemeMode } from "#/lib/theme";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { invalidateReadQueries } from "#/components/reader/read-optimistic";
import { ButtonLink } from "#/components/router-links";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { DEFAULT_CUSTOM_GOOGLE_FONT } from "#/lib/google-fonts";
import { AMERICAN_ENGLISH_VOICES } from "#/lib/page-reader/voice-catalog";
import { isReaderVoicePreference } from "#/lib/reader-voice";
import {
  READING_BODY_FONTS,
  READING_FONT_SIZES,
  READING_MEASURES,
  readingBodyFontLabel,
  readingFontSizeLabel,
  readingMeasureLabel,
} from "#/lib/reading-typography";
import { isThemeMode } from "#/lib/theme";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";
import { useOpenLinks } from "#/lib/use-open-links";
import { useReaderVoice } from "#/lib/use-reader-voice";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { useTheme } from "#/lib/use-theme";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { ChevronRight, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { Flex } from "../design-system/flex";
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

const MOBILE = "@media (max-width: 47.5rem)";

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

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
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
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
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
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
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
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
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
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
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
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
});

function TypographySegmentedControl<T extends string>({
  value,
  options,
  label,
  onChange,
  style,
}: {
  value: T;
  options: ReadonlyArray<T>;
  label: (option: T) => string;
  onChange: (next: T) => void;
  style?: stylex.StyleXStyles;
}) {
  const [selected, setSelected] = useState(value);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const selectedKeys = useMemo(() => new Set([selected]), [selected]);

  const handleSelectionChange = useCallback(
    (keys: Set<React.Key> | "all") => {
      const key = keys === "all" ? undefined : String([...keys][0]);
      if (
        typeof key === "string" &&
        (options as ReadonlyArray<string>).includes(key)
      ) {
        const next = key as T;
        setSelected(next);
        requestAnimationFrame(() => onChange(next));
      }
    },
    [onChange, options],
  );

  return (
    <SegmentedControl
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      style={style}
    >
      {options.map((option) => (
        <SegmentedControlItem key={option} id={option}>
          {label(option)}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

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
            Delete
          </Button>
        }
      >
        <AlertDialogHeader>{dialogTitle}</AlertDialogHeader>
        <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancelButton isDisabled={isPending}>
            Cancel
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
  const queryClient = useQueryClient();
  const labelers = useQuery(labelerApi.getLabelersQueryOptions());
  const { mode, setMode } = useTheme();
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

  const deleteHistoryMutation = useMutation(
    readerApi.deleteAllReadHistoryMutationOptions(),
  );
  const deleteBookmarksMutation = useMutation(
    readerApi.deleteAllBookmarksMutationOptions(),
  );
  const deleteListsMutation = useMutation(
    listApi.deleteAllListsMutationOptions(),
  );

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
        kicker="Account"
        title="Settings"
        dek="Appearance, reading preferences, and personal data."
      />

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Appearance</h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label="Theme"
            description="Choose light, dark, or match your system setting."
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
                    {label}
                  </Flex>
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </SettingRow>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Behavior</h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label="Open posts externally"
            description="When on, links open on the original website instead of the in-app reader."
          >
            <Switch
              isSelected={openExternally}
              onChange={setOpenExternally}
              aria-label="Open posts externally"
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label="Open collections in magazine"
            description="When on, collection posts open in the magazine edition instead of the reader view."
          >
            <Switch
              isSelected={openInMagazine}
              onChange={setOpenInMagazine}
              aria-label="Open collections in magazine"
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label="Track reading history"
            description="When on, articles you open are recorded as public read records in your AT Protocol repository."
          >
            <Switch
              isSelected={trackReading}
              onChange={setTrackReading}
              aria-label="Track reading history"
            />
          </SettingRow>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Reading</h2>
        <div {...stylex.props(styles.settingGroup)}>
          <ReadingSettingsPreview voicePreference={voice} />
          <SettingRow label="Text size">
            <TypographySegmentedControl
              value={typography.fontSize}
              options={READING_FONT_SIZES}
              label={readingFontSizeLabel}
              onChange={setFontSize}
              style={styles.segmentedControl}
            />
          </SettingRow>
          <Separator />
          <SettingRow label="Column width">
            <TypographySegmentedControl
              value={typography.measure}
              options={READING_MEASURES}
              label={readingMeasureLabel}
              onChange={setMeasure}
              style={styles.segmentedControl}
            />
          </SettingRow>
          <Separator />
          <SettingRow label="Body font">
            <TypographySegmentedControl
              value={typography.bodyFont}
              options={READING_BODY_FONTS}
              label={readingBodyFontLabel}
              onChange={setBodyFont}
              style={styles.segmentedControl}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label="Google Font"
            description={
              typography.bodyFont === "custom"
                ? "Search and pick any family from the Google Fonts catalog."
                : "Select Custom above to choose a Google Font."
            }
          >
            <ReadingCustomFontPicker
              value={typography.customFontFamily ?? DEFAULT_CUSTOM_GOOGLE_FONT}
              onChange={setCustomFontFamily}
              isDisabled={typography.bodyFont !== "custom"}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            label="Listen aloud voice"
            description="The voice used when you listen to an article with read aloud."
          >
            <Select
              size="lg"
              aria-label="Reader voice"
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
                textValue="Auto"
                prefix={<Sparkles size={14} />}
              >
                Auto
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
        <h2 {...stylex.props(styles.sectionHeading)}>Moderation</h2>
        <div {...stylex.props(styles.settingGroup)}>
          <SettingRow
            label="Labelers"
            description="Subscribe to labelers to flag, blur, or hide content as you read."
          >
            <ButtonLink to="/labelers" variant="secondary" size="sm">
              Browse labelers
            </ButtonLink>
          </SettingRow>
          <Separator />
          {(labelers.data?.length ?? 0) === 0 ? (
            <p {...stylex.props(styles.labelerEmpty)}>No labelers subscribed</p>
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
                    <ChevronRight
                      size={16}
                      aria-hidden
                      {...stylex.props(styles.labelerChevron)}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Personal data</h2>
        <p {...stylex.props(styles.deletionIntro)}>
          Permanently remove data stored in your account. These actions delete
          records from your AT Protocol repository and cannot be undone.
        </p>
        <div {...stylex.props(styles.settingGroup)}>
          <DataDeletionRow
            label="Reading history"
            description="All articles you have marked as read."
            dialogTitle="Delete all reading history?"
            dialogDescription="Every read record in your repository will be removed. Articles will appear unread again across the app. This cannot be undone."
            confirmLabel="Delete history"
            isPending={deleteHistoryMutation.isPending}
            onConfirm={onDeleteHistory}
          />
          <Separator />
          <DataDeletionRow
            label="Bookmarks"
            description="All articles you have saved for later."
            dialogTitle="Delete all bookmarks?"
            dialogDescription="Every saved article will be removed from your repository. Your Saved for later list will be empty. This cannot be undone."
            confirmLabel="Delete bookmarks"
            isPending={deleteBookmarksMutation.isPending}
            onConfirm={onDeleteBookmarks}
          />
          <Separator />
          <DataDeletionRow
            label="Publication lists"
            description="All publication lists you created in this app."
            dialogTitle="Delete all lists?"
            dialogDescription="Every list you own will be removed from your account. Anyone who saved your lists will no longer see them in their sidebar. This cannot be undone."
            confirmLabel="Delete lists"
            isPending={deleteListsMutation.isPending}
            onConfirm={onDeleteLists}
          />
        </div>
      </section>
    </ReaderContent>
  );
}
