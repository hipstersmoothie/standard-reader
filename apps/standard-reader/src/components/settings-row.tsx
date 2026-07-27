"use client";

import * as stylex from "@stylexjs/stylex";

import { settingRowStyles } from "./settings-row-styles";

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(settingRowStyles.row)}>
      <div>
        <p {...stylex.props(settingRowStyles.label)}>{label}</p>
        {description ? (
          <p {...stylex.props(settingRowStyles.description)}>{description}</p>
        ) : null}
      </div>
      <div {...stylex.props(settingRowStyles.control)}>{children}</div>
    </div>
  );
}
