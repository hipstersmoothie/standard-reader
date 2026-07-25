"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { GoogleFontMenuLabel } from "#/components/google-font-menu-label";
import { SizeContext } from "#/design-system/context";
import { googleFontsApi } from "#/integrations/tanstack-query/api-google-fonts.functions";

import { ComboBox, ComboBoxItem } from "../design-system/combobox";
import { spacing } from "../design-system/theme/spacing.stylex";

const styles = stylex.create({
  picker: {
    minWidth: {
      default: spacing["56"],
      "@media (max-width: 47.5rem)": "100%",
    },
    width: {
      default: spacing["56"],
      "@media (max-width: 47.5rem)": "100%",
    },
  },
});

type GoogleFontItem = {
  id: string;
  name: string;
};

export function ReadingCustomFontPicker({
  value,
  onChange,
  label,
  isDisabled = false,
}: {
  value: string;
  onChange: (family: string) => void;
  label?: string;
  isDisabled?: boolean;
}) {
  const { t } = useLingui();
  const [search, setSearch] = useState(value);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  const { data, isPending, isError } = useQuery({
    ...googleFontsApi.getGoogleFontFamiliesQueryOptions,
  });

  const items = useMemo(() => {
    const families = data?.families ?? [];
    const query = search.trim().toLowerCase();
    const filtered = query
      ? families.filter((family) => family.toLowerCase().includes(query))
      : families;

    const mapped: Array<GoogleFontItem> = filtered.map((family) => ({
      id: family,
      name: family,
    }));

    if (
      value &&
      !mapped.some((item) => item.id === value) &&
      isValidSelection(value, families)
    ) {
      mapped.unshift({ id: value, name: value });
    }

    return mapped;
  }, [data?.families, search, value]);

  return (
    <ComboBox
      label={label}
      aria-label={label == null ? t`Google Font` : undefined}
      // Sized to match the rest of a settings row; `lg` stood a head above the
      // segmented controls and switches beside it.
      size="md"
      placeholder={t`Search Google Fonts`}
      items={items}
      inputValue={search}
      onInputChange={setSearch}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key == null) return;
        const family = String(key);
        setSearch(family);
        onChange(family);
      }}
      isDisabled={isDisabled || isPending || isError}
      allowsEmptyCollection
      isVirtualized
      style={styles.picker}
    >
      {(item: GoogleFontItem) => (
        <SizeContext value="lg">
          <ComboBoxItem id={item.id} textValue={item.name}>
            <GoogleFontMenuLabel name={item.name} />
          </ComboBoxItem>
        </SizeContext>
      )}
    </ComboBox>
  );
}

function isValidSelection(
  value: string,
  families: ReadonlyArray<string>,
): boolean {
  return families.includes(value);
}
