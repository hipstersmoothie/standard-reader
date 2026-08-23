import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { SiteStyle } from "./styles";

/**
 * How each style is described in the picker. Message descriptors rather than
 * strings so the copy is translated at render time, in the reader's locale,
 * rather than at module load in whatever locale happened to be active.
 */
export const SITE_STYLE_COPY: Record<
  SiteStyle,
  { name: MessageDescriptor; description: MessageDescriptor }
> = {
  broadsheet: {
    name: msg`Broadsheet`,
    description: msg`A newspaper front page: a masthead over a lead story, with the rest of the archive set in columns beneath it.`,
  },
  journal: {
    name: msg`Journal`,
    description: msg`One quiet column, dated entries, and a lot of white space. Reads like a notebook left open.`,
  },
  gallery: {
    name: msg`Gallery`,
    description: msg`A grid of covers. Best when the work is what the reader should see first — comics, photo essays, anything illustrated.`,
  },
  marquee: {
    name: msg`Marquee`,
    description: msg`A full-height opening title, then selected work and a compact index. The most site-like of the four.`,
  },
};
