"use client";

import { useLingui } from "@lingui/react/macro";
import { toasts } from "@standard-reader/design-system/toast";
import { useEffect, useState } from "react";

import { DEFAULT_LOCALE, LOCALE_LABELS } from "#/lib/locale";
import { useLocale } from "#/lib/use-locale";
import { useLocaleHint } from "#/lib/use-locale-hint";

import { LanguageDialog } from "./language-dialog";

/**
 * Once-per-reader indicator that announces the auto-detected interface language
 * (negotiated from `Accept-Language`) and offers a way to switch. Mirrors
 * `AtstoreReviewPrompt`: a transient toast that can open a dialog.
 *
 * Works for guests and signed-in readers alike — the "seen" flag persists to a
 * cookie for guests and to `user.locale_hint_seen` when signed in — so the
 * indicator only ever shows one time. The module-level guard additionally keeps
 * it from re-firing on remounts within a single session (e.g. React strict
 * mode, route changes).
 *
 * Readers who resolve to the default language (English) see nothing — there's
 * no non-default default to announce — and their hint stays unmarked so it can
 * still fire if their detected language later changes.
 */
let hasShownLanguageHint = false;

export function LanguageHintPrompt() {
  const { t } = useLingui();
  const { locale } = useLocale();
  const { shouldShow, markSeen } = useLocaleHint();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!shouldShow) return;
    // Don't nudge readers who already resolved to the default language — there's
    // nothing to announce. Leave the hint unmarked so it can still fire if their
    // detected language later changes to a non-default one.
    if (locale === DEFAULT_LOCALE) return;
    if (hasShownLanguageHint) return;
    hasShownLanguageHint = true;

    // Persist immediately so the indicator never shows again, even if the
    // reader ignores the toast or reloads before it auto-dismisses.
    markSeen();

    const language = LOCALE_LABELS[locale];
    toasts.add(
      {
        title: t`Reading in ${language}`,
        description: t`We picked this language from your browser. You can switch it anytime.`,
        action: {
          label: t`Change language`,
          variant: "primary",
          onPress: () => setDialogOpen(true),
        },
      },
      { timeout: 15_000 },
    );
  }, [shouldShow, markSeen, locale, t]);

  return <LanguageDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} />;
}
