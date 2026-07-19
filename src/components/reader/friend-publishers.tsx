"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import type { FriendPublisher } from "#/integrations/tanstack-query/api-discover.functions";

import { Avatar } from "../../design-system/avatar";
import { Flex } from "../../design-system/flex";
import { Skeleton } from "../../design-system/skeleton";
import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import { AuthorProfileLink } from "./author-profile-link";
import { friendDisplayName, initials } from "./format";

const styles = stylex.create({
  group: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace.lg,
  },
  personRow: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    minWidth: 0,
  },
  personLink: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexGrow: 1,
    minWidth: 0,
    textDecoration: "none",
  },
  personMeta: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    rowGap: spacing["0.5"],
  },
  personName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  personHandle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
  },
  personAction: {
    flexShrink: 0,
  },
  pubs: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // The person's writing is the point; publications sit in a quieter well so
  // the eye runs down the list of people first.
  pubsInset: {
    backgroundColor: uiColor.bgSubtle,
  },
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  skeletonPerson: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    paddingBottom: verticalSpace.md,
  },
  skeletonPubs: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    paddingBottom: verticalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace.xl,
    rowGap: verticalSpace.md,
  },
});

/**
 * One person you follow on Bluesky, with the publications they write. The
 * person is the heading and the publications hang beneath: the reader is
 * looking for "who that I follow writes here", not for loose publications.
 *
 * `action` is the person-level control (Follow on the live surface, a
 * select-all toggle in onboarding) and `children` the publication rows, so the
 * same grouping serves both without either owning the other's write model.
 */
export function FriendPublisherGroup({
  person,
  action,
  children,
}: {
  person: FriendPublisher;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const name = friendDisplayName(person);

  return (
    <section {...stylex.props(styles.group)}>
      <div {...stylex.props(styles.personRow)}>
        <AuthorProfileLink authorRef={person.did} linkStyle={styles.personLink}>
          <Avatar
            src={person.avatarUrl ?? undefined}
            alt={name}
            size="lg"
            fallback={initials(name)}
          />
          <span {...stylex.props(styles.personMeta)}>
            <span dir="auto" {...stylex.props(styles.personName)}>
              {name}
            </span>
            {person.handle ? (
              <span dir="auto" {...stylex.props(styles.personHandle)}>
                @{person.handle}
              </span>
            ) : null}
          </span>
        </AuthorProfileLink>
        {action ? (
          <div {...stylex.props(styles.personAction)}>{action}</div>
        ) : null}
      </div>
      <div {...stylex.props(styles.pubs, styles.pubsInset)}>{children}</div>
    </section>
  );
}

/** Count line beneath a friends heading: "6 people · 8 publications". */
export function FriendPublishersSummary({
  people,
  publicationCount,
}: {
  people: number;
  publicationCount: number;
}) {
  return (
    <p {...stylex.props(styles.note)}>
      <Plural
        value={people}
        one="# person you follow"
        other="# people you follow"
      />
      {" · "}
      <Plural
        value={publicationCount}
        one="# publication"
        other="# publications"
      />
    </p>
  );
}

/**
 * Shown when the Bluesky AppView didn't answer. Distinct from the empty state
 * on purpose — "we couldn't check" must never read as "you know nobody here".
 */
export function FriendPublishersDegradedNote() {
  return (
    <p {...stylex.props(styles.note)}>
      <Trans>
        Bluesky didn't answer in time, so this list may be incomplete. Reload to
        try again.
      </Trans>
    </p>
  );
}

export function FriendPublishersSkeleton({ groups = 3 }: { groups?: number }) {
  const { t } = useLingui();
  return (
    <Flex direction="column" gap="5xl" aria-label={t`Loading`} aria-busy>
      {Array.from({ length: groups }, (_, index) => (
        <div key={index} aria-hidden>
          <div {...stylex.props(styles.skeletonPerson)}>
            <Skeleton variant="circle" size="lg" />
            <Flex direction="column" gap="sm">
              <Skeleton
                variant="rectangle"
                height={spacing["5"]}
                width={spacing["32"]}
              />
              <Skeleton
                variant="rectangle"
                height={spacing["3.5"]}
                width={spacing["24"]}
              />
            </Flex>
          </div>
          <div {...stylex.props(styles.skeletonPubs)}>
            <Skeleton variant="rectangle" height={spacing["5"]} width="46%" />
            <Skeleton variant="rectangle" height={spacing["4"]} width="88%" />
          </div>
        </div>
      ))}
    </Flex>
  );
}
