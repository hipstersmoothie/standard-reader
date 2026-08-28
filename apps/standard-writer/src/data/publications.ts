/**
 * Shapes for the publication screens. Every value is read from the shared
 * Standard DB via `server/analytics.server` — there is no sample/demo data.
 * A publication's "newsletter" is its stream of published posts, mailed to
 * subscribers; Standard Writer authors nothing itself.
 */

export interface PublicationTheme {
  background: string;
  foreground: string;
  accent: string;
  accentForeground: string;
}

export interface Send {
  title: string;
  path: string;
  subject: string;
  /** Human-formatted send time (e.g. "Jul 21, 2026 · 3:00 PM"). */
  when: string;
  /** Send time as epoch ms — for sorting and date math, since `when` is display-only. */
  sentAtMs: number;
  recipients: number;
  openRate: number;
  clickRate: number;
  unsubs: number;
  bounces: number;
  /**
   * Real delivery detail, present only when a send has been recorded (see
   * newsletter_sends / newsletter_send_events). Both stay empty — an all-zero
   * curve, no links — until readers actually open and click, and the send
   * report renders an empty state rather than a modeled curve or sample links.
   */
  delivered?: number;
  opensByHour?: Array<number>;
  topLinks?: Array<{ url: string; count: number }>;
}

/** One month of the subscriber-growth series. */
export interface GrowthPoint {
  /** Short month label, e.g. "Jul". */
  month: string;
  /** Net confirmed subscribers at the end of that month. */
  subscribers: number;
}

export interface Publication {
  id: string;
  /** Publication AT-URI. */
  uri: string;
  name: string;
  /** Single-character fallback shown when the publication has no icon blob. */
  icon: string;
  /** The publication's `icon` blob on the CDN, or null when it has none. */
  iconUrl: string | null;
  url: string;
  desc: string;
  theme: PublicationTheme;
  subs: number;
  delta: number;
  openRate: number;
  clickRate: number;
  cadence: string;
  /**
   * The list's real size at the end of each of the last 12 months, oldest
   * first. Empty only when the publication has no subscriber history at all.
   */
  growth: Array<GrowthPoint>;
  sends: Array<Send>;
  /** Per-newsletter From display name, or null to use the instance default. */
  fromName: string | null;
  /** Per-newsletter From address, or null to use the instance default. */
  fromAddress: string | null;
  /**
   * Whether this publication is connected as a newsletter — i.e. whether its
   * posts get mailed. Every publication the author owns is listed either way;
   * this decides which of them have a subscriber list and a send history rather
   * than an invitation to start one.
   */
  newsletterConnected: boolean;
}
