"use client";

/**
 * U+2060 WORD JOINER — an invisible, zero-width character that forbids a line
 * break on either side of it (UAX #14 LB11). Now that chips wrap, this is what
 * keeps the avatar glued to the first word of the label instead of being left
 * behind alone at the end of a line.
 */
const WORD_JOINER = "\u2060";

/**
 * Contents of a mention chip: the entity's avatar (when it has one) followed by
 * the label, joined so a wrap can never separate the two.
 */
export function MentionChipBody({
  avatar,
  children,
}: {
  avatar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {avatar}
      {avatar ? WORD_JOINER : null}
      {children}
    </>
  );
}
