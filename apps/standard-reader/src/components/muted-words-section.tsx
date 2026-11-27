"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { Form } from "@standard-reader/design-system/form";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { Tag, TagGroup } from "@standard-reader/design-system/tag-group";
import { TextField } from "@standard-reader/design-system/text-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { MutedWordRow } from "#/integrations/tanstack-query/api-mutes.functions";
import {
  MUTED_WORD_LIMIT,
  mutesApi,
} from "#/integrations/tanstack-query/api-mutes.functions";
import {
  MAX_MUTED_WORD_LENGTH,
  MAX_MUTED_WORDS,
  normalizeMutedWord,
} from "#/lib/muted-words";

/**
 * Settings → Muted → Muted words.
 *
 * Words are app-private (never a repo record), so unlike the people and
 * publication lists beside it this section never needs the mute-write scope —
 * any signed-in reader can add and remove words.
 */
export function MutedWordsSection({
  words,
  isLoading,
}: {
  words: ReadonlyArray<MutedWordRow>;
  isLoading: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const normalizedDraft = normalizeMutedWord(draft);
  const atLimit = words.length >= MAX_MUTED_WORDS;
  const alreadyMuted =
    normalizedDraft != null &&
    words.some((row) => row.word === normalizedDraft);

  // A muted word changes every feed and discovery surface, not just this list.
  const invalidateEverything = () => void queryClient.invalidateQueries();

  const add = useMutation({
    mutationFn: async (word: string) => mutesApi.muteWord({ data: { word } }),
    onSuccess: () => {
      setDraft("");
      invalidateEverything();
    },
    onError: (error) => {
      toasts.add({
        title: t`Couldn't mute that word`,
        description:
          error instanceof Error && error.message === MUTED_WORD_LIMIT
            ? t`You can mute up to ${MAX_MUTED_WORDS} words. Remove one to add another.`
            : t`Try a word or phrase with at least one letter or number in it.`,
      });
    },
  });

  const remove = useMutation({
    mutationFn: async (word: string) => mutesApi.unmuteWord({ data: { word } }),
    onSuccess: invalidateEverything,
    onError: () => {
      toasts.add({
        title: t`Something went wrong`,
        description: t`We couldn't unmute that word. Try again?`,
      });
    },
  });

  const pendingRemoval = remove.isPending ? remove.variables : undefined;
  const chips = words
    .filter((row) => row.word !== pendingRemoval)
    .map((row) => ({ id: row.word }));

  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.heading)}>
        <Trans>Muted words</Trans>
      </h2>
      <p {...stylex.props(styles.note)}>
        <Trans>
          Hide articles whose title or description, and publications whose name
          or description, contain a word or phrase. Article text isn't checked,
          so a passing mention won't hide anything. Whole words only:
          “president” won't hide “presidential”. End a word with * to match
          everything that starts with it — “elect*” covers “election” and
          “electoral”. Muted words are private: they're stored by Standard
          Reader, not published to your repo.
        </Trans>
      </p>

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalizedDraft || alreadyMuted || atLimit) return;
          add.mutate(normalizedDraft);
        }}
        style={styles.form}
      >
        <Flex gap="sm" align="end" wrap>
          <TextField
            label={t`Word or phrase`}
            placeholder={t`e.g. elections`}
            value={draft}
            onChange={setDraft}
            maxLength={MAX_MUTED_WORD_LENGTH}
            isDisabled={atLimit}
            disablePasswordManagers
            style={styles.field}
          />
          <Button
            type="submit"
            variant="secondary"
            isPending={add.isPending}
            isDisabled={!normalizedDraft || alreadyMuted || atLimit}
          >
            <Trans>Mute word</Trans>
          </Button>
        </Flex>
      </Form>

      {isLoading ? (
        <div aria-busy="true" aria-label={t`Loading muted words`}>
          <Skeleton variant="rectangle" height="2rem" width="100%" />
        </div>
      ) : chips.length === 0 ? (
        <p {...stylex.props(styles.note)}>
          <Trans>You haven't muted any words.</Trans>
        </p>
      ) : (
        <TagGroup
          aria-label={t`Muted words`}
          items={chips}
          onRemove={(keys) => {
            for (const key of keys) remove.mutate(String(key));
          }}
          style={styles.chips}
        >
          {(chip: { id: string }) => <Tag>{chip.id}</Tag>}
        </TagGroup>
      )}
    </section>
  );
}

const styles = stylex.create({
  section: {
    marginBlockEnd: verticalSpace["2xl"],
  },
  heading: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBlock: spacing["0"],
  },
  note: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    marginBlock: verticalSpace.md,
  },
  form: {
    marginBlockEnd: verticalSpace.md,
  },
  field: {
    flexGrow: 1,
    minWidth: spacing["0"],
  },
  chips: {
    marginBlock: verticalSpace.md,
  },
});
