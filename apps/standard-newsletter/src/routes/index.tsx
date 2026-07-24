import { Button } from "@standard-reader/design-system/button";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { Slider } from "@standard-reader/design-system/slider";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { common } from "../common-styles";
import { I, Ico, icon } from "../components/icons";
import { PubGlyph } from "../components/ui";
import { fmt } from "../lib/format";
import { motion } from "../motion-styles";
import { showcasePublicationsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(showcasePublicationsQueryOptions()),
  component: Home,
});

const styles = stylex.create({
  page: {
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    height: stylex.firstThatWorks("100dvh", "100vh"),
    overflow: "auto",
  },
  // The marketing page runs slightly wider than the app's 1000px measure so the
  // two-column bands have room to breathe.
  wrap: {
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "1040px",
    paddingInlineEnd: spacing["10"],
    paddingInlineStart: spacing["10"],
  },

  header: {
    backdropFilter: "saturate(1.1) blur(10px)",
    // The bar sits over scrolling content, so it is the page ground at 88%
    // rather than a flat fill.
    backgroundColor: `color-mix(in srgb, ${uiColor.bgSubtle} 88%, transparent)`,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    rowGap: gap["2xl"],
  },
  wordmark: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    // Between `xl` and `2xl` — the wordmark is set to sit just above the nav
    // controls without becoming a heading.
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  wordmarkAccent: { color: primaryColor.solid1 },
  headerActions: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
  },

  hero: {
    backgroundImage: `radial-gradient(120% 100% at 80% -10%, ${primaryColor.component1} 0%, transparent 55%)`,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  heroInner: {
    alignItems: "center",
    columnGap: spacing["12"],
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    paddingBlockEnd: spacing["20"],
    paddingBlockStart: spacing["20"],
    rowGap: spacing["12"],
  },
  heroTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["6xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tighter,
    lineHeight: lineHeight.none,
    marginBlockEnd: verticalSpace["5xl"],
    marginBlockStart: 0,
    textWrap: "balance",
  },
  heroBody: {
    color: primaryColor.text1,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.base,
    marginBlockEnd: spacing["8"],
    marginBlockStart: 0,
    maxWidth: "480px",
  },
  heroActions: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    rowGap: gap.xl,
  },

  pizzazz: {
    alignItems: "center",
    columnGap: gap.xs,
    display: "flex",
    justifyContent: "center",
    rowGap: gap.xs,
  },
  pubStack: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xl,
  },
  pubCard: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    // A long, soft drop that lifts the card off the wash without a visible edge.
    boxShadow: `0 10px 30px -20px color-mix(in srgb, ${uiColor.text2} 50%, transparent)`,
    columnGap: gap.xl,
    display: "flex",
    paddingBlockEnd: verticalSpace.lg,
    paddingBlockStart: verticalSpace.lg,
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingInlineStart: horizontalSpace.lg,
    rowGap: gap.xl,
  },
  pubCardName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    whiteSpace: "nowrap",
  },
  arrow: {
    color: primaryColor.solid1,
    paddingInlineEnd: horizontalSpace.xs,
    paddingInlineStart: horizontalSpace.xs,
  },
  envelope: {
    alignItems: "center",
    backgroundColor: primaryColor.solid1,
    borderRadius: radius.xl,
    // A cast shadow in the accent's own hue, so the tile reads as lit rather
    // than pasted on.
    boxShadow: `0 22px 44px -18px color-mix(in srgb, ${primaryColor.solid1} 75%, transparent)`,
    color: primaryColor.textContrast,
    display: "flex",
    height: spacing["28"],
    justifyContent: "center",
    width: spacing["28"],
  },

  band: {
    backgroundColor: uiColor.bg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  bandInner: {
    alignItems: "center",
    columnGap: spacing["16"],
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    paddingBlockEnd: spacing["16"],
    paddingBlockStart: spacing["16"],
    rowGap: spacing["16"],
  },
  bandTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginBottom: verticalSpace["3xl"],
  },
  bandBody: {
    color: primaryColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  hostRow: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    rowGap: gap["2xl"],
  },
  hostTitle: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  hostSub: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginTop: verticalSpace.xxs,
  },
  hostFoot: {
    alignItems: "center",
    color: primaryColor.text1,
    columnGap: gap.lg,
    display: "flex",
    fontSize: fontSize.sm,
    paddingTop: verticalSpace["4xl"],
    rowGap: gap.lg,
  },

  steps: {
    paddingBlockEnd: verticalSpace.md,
    paddingBlockStart: spacing["14"],
  },
  stepsLabel: {
    marginBottom: verticalSpace["5xl"],
  },
  stepsGrid: {
    columnGap: spacing["8"],
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    rowGap: spacing["8"],
  },
  step: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xl,
  },
  stepHead: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    rowGap: gap.xl,
  },
  stepNumber: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  stepTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  stepBody: {
    color: primaryColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
  },

  pricing: {
    paddingBlockEnd: spacing["24"],
    paddingBlockStart: spacing["20"],
  },
  pricingHead: {
    alignItems: "baseline",
    columnGap: gap.xl,
    display: "flex",
    marginBottom: spacing["8"],
    rowGap: gap.xl,
  },
  pricingGrid: {
    alignItems: "center",
    columnGap: spacing["16"],
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    paddingTop: spacing["11"],
    rowGap: spacing["16"],
  },
  priceLine: {
    alignItems: "baseline",
    columnGap: gap.md,
    display: "flex",
    marginBottom: verticalSpace.sm,
    rowGap: gap.md,
  },
  price: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["7xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tighter,
    lineHeight: lineHeight.none,
  },
  priceUnit: {
    color: uiColor.text1,
    fontSize: fontSize.base,
  },
  pricingBody: {
    color: primaryColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: spacing["6"],
    marginBlockStart: spacing["5"],
    maxWidth: "400px",
  },
  freePill: {
    alignItems: "center",
    backgroundColor: primaryColor.component1,
    borderRadius: radius.full,
    color: primaryColor.text1,
    columnGap: gap.md,
    display: "inline-flex",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingBlockEnd: verticalSpace.md,
    paddingBlockStart: verticalSpace.md,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.md,
  },
  pricingExample: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginTop: verticalSpace["4xl"],
  },

  calculator: {
    borderInlineStartColor: uiColor.border1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    display: "flex",
    flexDirection: "column",
    paddingInlineStart: spacing["16"],
    rowGap: gap["2xl"],
  },
  calcHead: {
    alignItems: "baseline",
    display: "flex",
    justifyContent: "space-between",
  },
  calcLabel: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  calcValue: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  slider: {
    width: "100%",
  },
  ticks: {
    color: uiColor.text1,
    display: "flex",
    fontSize: fontSize.xs,
    justifyContent: "space-between",
  },
  total: {
    alignItems: "baseline",
    columnGap: gap.sm,
    display: "flex",
    marginTop: verticalSpace.md,
    rowGap: gap.sm,
  },
  totalValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["5xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tighter,
    lineHeight: lineHeight.none,
  },
  totalUnit: {
    color: uiColor.text1,
    fontSize: fontSize.base,
  },
  ctaSlot: {
    marginTop: verticalSpace.sm,
  },
});

function Step({
  n,
  icon: glyph,
  title,
  body,
}: {
  n: number;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div {...stylex.props(styles.step)}>
      <div {...stylex.props(styles.stepHead)}>
        <div {...stylex.props(common.chip, common.chipMd)}>
          <Ico d={glyph} s={18} />
        </div>
        <span {...stylex.props(styles.stepNumber)}>0{n}</span>
      </div>
      <div {...stylex.props(styles.stepTitle)}>{title}</div>
      <div {...stylex.props(styles.stepBody)}>{body}</div>
    </div>
  );
}

function Wrap({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.wrap)}>{children}</div>;
}

const HOSTING_ROWS = [
  {
    icon: I.grid,
    t: "On a hosted platform",
    s: "Publishing through Standard Writer or any client.",
  },
  {
    icon: I.book,
    t: "Self-hosted",
    s: "Publishing on your own, wherever it lives.",
  },
];

function Home() {
  const navigate = useNavigate();
  const { data: pubs } = useSuspenseQuery(showcasePublicationsQueryOptions());
  const goDashboard = () => navigate({ to: "/dashboard" });
  const [calcEmails, setCalcEmails] = useState(50_000);
  const price = Math.max(0, Math.ceil((calcEmails - 1000) / 1000));

  return (
    <div {...stylex.props(styles.page)}>
      {/* HEADER */}
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.wrap, styles.headerInner)}>
          <div {...stylex.props(styles.wordmark)}>
            Standard{" "}
            <span {...stylex.props(styles.wordmarkAccent)}>Newsletter</span>
          </div>
          <span {...stylex.props(common.pushEnd, styles.headerActions)}>
            <Button variant="tertiary" size="sm" onPress={goDashboard}>
              Log in
            </Button>
            <Button variant="primary" size="sm" onPress={goDashboard}>
              Get started
            </Button>
          </span>
        </div>
      </div>

      {/* HERO */}
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.wrap, styles.heroInner)}>
          <div>
            <h1 {...stylex.props(styles.heroTitle)}>
              Every post you publish, delivered to inboxes.
            </h1>
            <p {...stylex.props(styles.heroBody)}>
              Turn any standard.site publication into a newsletter. We mail each
              post you publish to your subscribers and hand you the readership
              analytics — you never write a second version.
            </p>
            <div {...stylex.props(styles.heroActions)}>
              <Button variant="primary" size="lg" onPress={goDashboard}>
                <span {...stylex.props(common.buttonContent)}>
                  Open dashboard
                  <Ico d={I.chevR} s={17} w={2} />
                </span>
              </Button>
              {/* Real publications only — with an empty DB there is nothing
                  to point at, so the secondary CTA drops out rather than
                  linking to a placeholder. */}
              {pubs.length > 0 ? (
                <Button
                  variant="tertiary"
                  size="lg"
                  onPress={() =>
                    navigate({ to: "/p/$pubId", params: { pubId: pubs[0].id } })
                  }
                >
                  See a publication
                </Button>
              ) : null}
            </div>
          </div>

          {/* pizzazz: publications -> envelope */}
          <div {...stylex.props(styles.pizzazz)}>
            {/* Real publications only. With none to show, the cards and the
                arrow drop out and the envelope stands alone rather than
                pointing at an empty column. */}
            <div {...stylex.props(styles.pubStack)}>
              {pubs.slice(0, 3).map((p, i) => (
                <div
                  key={p.id}
                  {...stylex.props(
                    styles.pubCard,
                    motion.rise,
                    motion.stagger(i),
                  )}
                >
                  <PubGlyph pub={p} size="md" />
                  <div {...stylex.props(styles.pubCardName)}>{p.name}</div>
                </div>
              ))}
            </div>
            {pubs.length > 0 ? (
              <div {...stylex.props(styles.arrow)}>
                <Ico d={I.chevR} s={26} w={2} />
              </div>
            ) : null}
            <div {...stylex.props(styles.envelope, motion.float)}>
              <Ico d={I.mail} s={52} w={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* ANY PUBLICATION */}
      <div {...stylex.props(styles.band)}>
        <div {...stylex.props(styles.wrap, styles.bandInner)}>
          <div>
            <div {...stylex.props(common.sectionLabel)}>
              Works with any standard.site publication
            </div>
            <div {...stylex.props(styles.bandTitle)}>
              It doesn’t matter where your publication lives.
            </div>
            <p {...stylex.props(styles.bandBody)}>
              Whether you write on one of the hosted platforms or publish
              everything yourself, your posts stay yours and stay portable. If
              it’s a standard.site publication, it can become a newsletter — no
              migration, no export, no lock-in.
            </p>
          </div>
          <div>
            {HOSTING_ROWS.map((r) => (
              <div
                key={r.t}
                {...stylex.props(common.ruleAbove, styles.hostRow)}
              >
                <div {...stylex.props(common.chip, common.chipMd)}>
                  <Ico d={r.icon} s={19} />
                </div>
                <div {...stylex.props(common.flexFill)}>
                  <div {...stylex.props(styles.hostTitle)}>{r.t}</div>
                  <div {...stylex.props(styles.hostSub)}>{r.s}</div>
                </div>
                <Ico d={I.check} s={19} style={[icon.positive, icon.fixed]} />
              </div>
            ))}
            <div {...stylex.props(common.ruleAbove, styles.hostFoot)}>
              <span>Your posts</span>
              <Ico d={I.chevR} s={16} style={icon.accent} />
              <span>your subscribers</span>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <Wrap>
        <div {...stylex.props(styles.steps)}>
          <div {...stylex.props(common.sectionLabel, styles.stepsLabel)}>
            How it works
          </div>
          <div {...stylex.props(styles.stepsGrid)}>
            <Step
              n={1}
              icon={I.book}
              title="Connect a publication"
              body="Point us at any standard.site publication you own. We pick up your posts automatically — nothing to re-upload."
            />
            <Step
              n={2}
              icon={I.send}
              title="Posts become sends"
              body="Each new post is mailed to that publication’s subscribers, styled to match. You write once; we handle delivery."
            />
            <Step
              n={3}
              icon={I.eye}
              title="Watch it land"
              body="Opens, clicks, growth, and per-send reports across every publication — all in one dashboard."
            />
          </div>
        </div>
      </Wrap>

      {/* PRICING */}
      <Wrap>
        <div {...stylex.props(styles.pricing)}>
          <div {...stylex.props(styles.pricingHead)}>
            <div {...stylex.props(common.sectionLabel)}>Pricing</div>
            <span {...stylex.props(common.meta, common.pushEnd)}>
              Pay for what you send · every publication included
            </span>
          </div>
          <div {...stylex.props(common.ruleAbove, styles.pricingGrid)}>
            <div>
              <div {...stylex.props(styles.priceLine)}>
                <span {...stylex.props(styles.price)}>$1</span>
                <span {...stylex.props(styles.priceUnit)}>
                  / 1,000 emails sent
                </span>
              </div>
              <p {...stylex.props(styles.pricingBody)}>
                You’re only billed for emails that actually go out. Send to one
                publication or ten — the rate is the same, and it stays linear
                at any volume.
              </p>
              <div {...stylex.props(styles.freePill)}>
                <Ico d={I.check} s={16} w={2.2} />
                First 1,000 emails free every month
              </div>
              <div {...stylex.props(styles.pricingExample)}>
                e.g. a weekly send to 10,000 readers ≈ 43,000 emails/mo ≈ $42.
              </div>
            </div>
            <div {...stylex.props(styles.calculator)}>
              <div {...stylex.props(styles.calcHead)}>
                <span {...stylex.props(styles.calcLabel)}>
                  Estimate your bill
                </span>
                <span {...stylex.props(styles.calcValue)}>
                  {fmt(calcEmails)} emails / mo
                </span>
              </div>
              {/* The value is already printed above in the row's own type, so
                  the slider's built-in output stays off — but the thumb still
                  announces it. */}
              <Slider
                aria-label="Emails sent per month"
                minValue={0}
                maxValue={500_000}
                step={1000}
                value={calcEmails}
                onChange={setCalcEmails}
                showValueLabel={false}
                style={styles.slider}
              />
              <div {...stylex.props(styles.ticks)}>
                <span>0</span>
                <span>250k</span>
                <span>500k</span>
              </div>
              <div {...stylex.props(styles.total)}>
                <span {...stylex.props(styles.totalValue)}>${price}</span>
                <span {...stylex.props(styles.totalUnit)}>/ month</span>
              </div>
              <div {...stylex.props(styles.ctaSlot)}>
                <Button variant="primary" size="md" onPress={goDashboard}>
                  Get started
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Wrap>
    </div>
  );
}
