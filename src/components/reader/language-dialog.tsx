"use client";

import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import type { Locale } from "#/lib/locale";
import { LOCALE_LABELS, LOCALES, PSEUDO_LOCALE, isLocale } from "#/lib/locale";
import { useLocale } from "#/lib/use-locale";

/** The pseudo-locale is a translation-coverage tool, not a language to ship. */
export const LOCALE_OPTIONS: ReadonlyArray<Locale> = LOCALES.filter(
  (locale) => locale !== PSEUDO_LOCALE || import.meta.env.DEV,
);

/**
 * Language picker in a dialog. The switching surface for readers who don't have
 * the full Settings screen — guests (via the sidebar globe button) and the
 * one-time language indicator both open this. Writes go through
 * {@link useLocale}, which persists to the cookie (guests) and the account
 * (signed in), so the choice sticks either way.
 */
export function LanguageDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { locale, setLocale } = useLocale();

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <Trans>Choose your language</Trans>
      </DialogHeader>
      <DialogDescription>
        <Trans>
          The language used for the reader interface. Articles are shown in the
          language they were written in.
        </Trans>
      </DialogDescription>
      <DialogBody>
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
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onPress={() => onOpenChange(false)}>
          <Trans>Done</Trans>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
