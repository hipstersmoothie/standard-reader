import * as stylex from "@stylexjs/stylex";

import { Badge } from "#/design-system/badge";

const styles = stylex.create({
  link: {
    color: "inherit",
    textDecoration: "none",
  },
});

export function SifaResumeChip({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...stylex.props(styles.link)}
    >
      <Badge size="sm" variant="default">
        Resume
      </Badge>
    </a>
  );
}
