/**
 * Static sample data standing in for the (future) analytics store. Each
 * publication's "newsletter" is its stream of published posts, mailed to
 * subscribers — Standard Newsletter authors nothing itself.
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
   * newsletter_sends / newsletter_send_events). Absent on sample data and on
   * posts that haven't been mailed yet — the send report falls back to a modeled
   * curve/links in that case.
   */
  delivered?: number;
  opensByHour?: Array<number>;
  topLinks?: Array<{ url: string; count: number }>;
}

export interface Publication {
  id: string;
  /** Publication AT-URI. Present for DB-backed publications; absent for sample data. */
  uri?: string;
  name: string;
  icon: string;
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

export const PUBS: Array<Publication> = [
  {
    id: "marginalia",
    name: "The Marginalia Dispatch",
    icon: "§",
    url: "marginaliadispatch.com",
    desc: "Loose essays on reading, writing, and owning what you publish.",
    theme: {
      background: "#fcf9f5",
      foreground: "#3e332e",
      accent: "#ad7f58",
      accentForeground: "#ffffff",
    },
    subs: 8420,
    delta: 312,
    openRate: 58.2,
    clickRate: 9.4,
    cadence: "Weekly",
    growth: [
      6100, 6280, 6510, 6720, 6980, 7210, 7420, 7690, 7880, 8010, 8180, 8420,
    ],
    sends: [
      {
        title: "You Own the Press",
        path: "you-own-the-press",
        subject: "You Own the Press — a note on signed records",
        when: "Jul 21, 2026 · 9:02 AM",
        recipients: 8390,
        openRate: 61.4,
        clickRate: 11.2,
        unsubs: 14,
        bounces: 22,
      },
      {
        title: "Notes on a Vanishing Coastline",
        path: "vanishing-coastline",
        subject: "Measuring a shoreline in fence posts",
        when: "Jun 6, 2026 · 8:30 AM",
        recipients: 7980,
        openRate: 57.9,
        clickRate: 8.6,
        unsubs: 21,
        bounces: 18,
      },
      {
        title: "The Quiet Return of the Essay",
        path: "quiet-return-of-the-essay",
        subject: "The quiet return of the personal essay",
        when: "May 2, 2026 · 9:00 AM",
        recipients: 7610,
        openRate: 55.1,
        clickRate: 9.9,
        unsubs: 12,
        bounces: 15,
      },
      {
        title: "On Keeping a Commonplace Book",
        path: "commonplace-book",
        subject: "Why I keep a commonplace book",
        when: "Apr 4, 2026 · 8:45 AM",
        recipients: 7180,
        openRate: 59.3,
        clickRate: 7.8,
        unsubs: 9,
        bounces: 11,
      },
    ],
  },
  {
    id: "signals",
    name: "Signals",
    icon: "S",
    url: "signals.example",
    desc: "Short notes on the open social web and the AT Protocol.",
    theme: {
      background: "#ffffff",
      foreground: "#1a1a1a",
      accent: "#2b6cb0",
      accentForeground: "#ffffff",
    },
    subs: 2140,
    delta: 86,
    openRate: 47.5,
    clickRate: 6.1,
    cadence: "Biweekly",
    growth: [
      1180, 1240, 1320, 1410, 1490, 1580, 1690, 1780, 1870, 1980, 2054, 2140,
    ],
    sends: [
      {
        title: "The Repo as Canon",
        path: "repo-as-canon",
        subject: "The repo as canon",
        when: "Jul 10, 2026 · 7:00 AM",
        recipients: 2120,
        openRate: 49.8,
        clickRate: 7.2,
        unsubs: 6,
        bounces: 8,
      },
      {
        title: 'What "Own Your Data" Actually Means',
        path: "own-your-data",
        subject: "Beyond the slogan: own your data",
        when: "Jun 28, 2026 · 7:00 AM",
        recipients: 2060,
        openRate: 46.1,
        clickRate: 5.4,
        unsubs: 8,
        bounces: 6,
      },
      {
        title: "Lexicons, Plainly",
        path: "lexicons-plainly",
        subject: "Lexicons, plainly",
        when: "Jun 14, 2026 · 7:00 AM",
        recipients: 1990,
        openRate: 45.2,
        clickRate: 5.9,
        unsubs: 5,
        bounces: 5,
      },
    ],
  },
  {
    id: "ferment",
    name: "Field & Ferment",
    icon: "F",
    url: "fieldferment.co",
    desc: "Seasonal notes on cooking, foraging, and the slow kitchen.",
    theme: {
      background: "#f3f6f1",
      foreground: "#22311f",
      accent: "#3f7d4e",
      accentForeground: "#ffffff",
    },
    subs: 3760,
    delta: 198,
    openRate: 62.1,
    clickRate: 12.3,
    cadence: "Weekly",
    growth: [
      2210, 2380, 2560, 2740, 2910, 3080, 3220, 3360, 3480, 3590, 3690, 3760,
    ],
    sends: [
      {
        title: "A Field Guide to Slow Mornings",
        path: "slow-mornings",
        subject: "Small rituals before the feed gets to you",
        when: "Jul 18, 2026 · 6:30 AM",
        recipients: 3740,
        openRate: 64.8,
        clickRate: 14.1,
        unsubs: 7,
        bounces: 9,
      },
      {
        title: "Preserving the Last of the Summer",
        path: "preserving-summer",
        subject: "Preserving the last of the summer",
        when: "Jul 4, 2026 · 6:30 AM",
        recipients: 3660,
        openRate: 61.2,
        clickRate: 11.8,
        unsubs: 10,
        bounces: 7,
      },
      {
        title: "On Sourdough & Patience",
        path: "sourdough-patience",
        subject: "On sourdough and patience",
        when: "Jun 20, 2026 · 6:30 AM",
        recipients: 3540,
        openRate: 60.4,
        clickRate: 10.9,
        unsubs: 6,
        bounces: 6,
      },
    ],
  },
];

export function findPublication(id: string): Publication | undefined {
  return PUBS.find((p) => p.id === id);
}
