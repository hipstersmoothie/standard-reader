/**
 * Shapes for the analytics screens. Every value is read from the shared reader
 * DB via `server/analytics.server` — there is no sample/demo data. Each
 * publication's "newsletter" is its stream of published posts, mailed to
 * subscribers; Standard Newsletter authors nothing itself.
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
  when: string;
  recipients: number;
  openRate: number;
  clickRate: number;
  unsubs: number;
  bounces: number;
  /**
   * Real delivery detail, present only when a send has been recorded (see
   * newsletter_sends / newsletter_send_events). Absent on posts that haven't
   * been mailed yet — the send report falls back to a modeled curve/links in
   * that case.
   */
  delivered?: number;
  opensByHour?: Array<number>;
  topLinks?: Array<{ url: string; count: number }>;
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
  growth: Array<number>;
  sends: Array<Send>;
}

export const MONTHS = [
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
];
