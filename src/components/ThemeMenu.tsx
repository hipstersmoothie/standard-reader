import * as stylex from "@stylexjs/stylex";
import { Monitor, Moon, Sun } from "lucide-react";

import type { ThemeMode } from "#/lib/theme";

import { MenuItem, SubMenu } from "#/design-system/menu";
import { uiColor } from "#/design-system/theme/color.stylex";
import { isThemeMode } from "#/lib/theme";
import { useTheme } from "#/lib/use-theme";

const styles = stylex.create({
  currentMode: {
    color: uiColor.text1,
  },
});

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

function ThemeMenuItems({ onSelect }: { onSelect: (next: ThemeMode) => void }) {
  return THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
    <MenuItem
      key={id}
      id={id}
      prefix={<Icon size={16} />}
      onAction={() => {
        if (isThemeMode(id)) onSelect(id);
      }}
    >
      {label}
    </MenuItem>
  ));
}

export function ThemeSubMenu() {
  const { mode, setMode } = useTheme();
  const currentLabel =
    THEME_OPTIONS.find((option) => option.id === mode)?.label ?? "System";

  return (
    <SubMenu
      trigger={
        <MenuItem
          suffix={
            <span {...stylex.props(styles.currentMode)}>{currentLabel}</span>
          }
        >
          Theme
        </MenuItem>
      }
      selectionMode="single"
      selectedKeys={new Set([mode])}
      disallowEmptySelection
    >
      <ThemeMenuItems onSelect={setMode} />
    </SubMenu>
  );
}
