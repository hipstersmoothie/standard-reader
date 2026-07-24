import { Alert } from "@standard-reader/design-system/alert";
import { Button } from "@standard-reader/design-system/button";
import {
  primaryColor,
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
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
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { common } from "../common-styles";
import { CsvDropZone } from "../components/csv-drop-zone";
import { I, Ico, icon } from "../components/icons";
import { PubAvatar } from "../components/ui";
import { fmt } from "../lib/format";
import { motion } from "../motion-styles";
import type { ConnectablePublicationData } from "../server/analytics";
import {
  connectPublicationFn,
  connectablePublicationsQueryOptions,
} from "../server/analytics";

export const Route = createFileRoute("/_app/connect")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(connectablePublicationsQueryOptions()),
  component: CreateFlow,
});

const STEP_LABELS = ["Choose", "How it works", "Import list", "Done"];

const styles = stylex.create({
  back: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderStyle: "none",
    borderWidth: 0,
    color: uiColor.text1,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: fontSize.sm,
    marginBottom: spacing["7"],
    paddingBlockEnd: 0,
    paddingBlockStart: 0,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    rowGap: gap.sm,
  },

  stepper: {
    alignItems: "center",
    display: "flex",
    marginBottom: spacing["10"],
  },
  stepGroup: { display: "contents" },
  step: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
  },
  bullet: {
    alignItems: "center",
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 0,
    display: "flex",
    flexGrow: 0,
    flexShrink: 0,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    height: spacing["7"],
    justifyContent: "center",
    width: spacing["7"],
  },
  bulletDone: {
    backgroundColor: primaryColor.solid1,
    color: primaryColor.textContrast,
  },
  bulletCurrent: {
    backgroundColor: primaryColor.component1,
    borderColor: primaryColor.solid1,
    borderWidth: 1,
    color: primaryColor.text1,
  },
  bulletTodo: {
    backgroundColor: "transparent",
    borderColor: uiColor.border1,
    borderWidth: 1,
    color: uiColor.text1,
  },
  stepLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    whiteSpace: "nowrap",
  },
  stepLabelCurrent: {
    color: uiColor.text2,
    fontWeight: fontWeight.semibold,
  },
  stepLabelOther: { color: uiColor.text1 },
  stepRule: {
    backgroundColor: uiColor.border1,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    height: 1,
    marginInlineEnd: horizontalSpace["3xl"],
    marginInlineStart: horizontalSpace["3xl"],
  },

  empty: {
    paddingBlockEnd: spacing["12"],
    paddingBlockStart: spacing["12"],
    paddingInlineEnd: spacing["10"],
    paddingInlineStart: spacing["10"],
    textAlign: "center",
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    marginBottom: verticalSpace.md,
  },
  emptyBody: {
    color: uiColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "420px",
  },

  stepTitle: {
    marginBottom: verticalSpace.md,
  },
  stepIntro: {
    marginBlockEnd: spacing["7"],
    marginBlockStart: 0,
  },

  list: {
    marginBottom: spacing["8"],
  },
  choice: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    borderStyle: "none",
    borderWidth: 0,
    columnGap: gap["2xl"],
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    rowGap: gap["2xl"],
    textAlign: "left",
    width: "100%",
  },
  choiceSelected: {
    backgroundColor: primaryColor.component1,
  },
  choiceName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
  },
  choiceUrl: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    marginTop: verticalSpace.xxs,
  },
  radio: {
    borderColor: uiColor.border2,
    borderRadius: radius.full,
    borderStyle: "solid",
    // 1.5px unselected → a 7px ring when selected: the thick ring *is* the
    // filled state, so it steps outside the border scale by design.
    borderWidth: "1.5px",
    flexGrow: 0,
    flexShrink: 0,
    height: spacing["6"],
    width: spacing["6"],
  },
  radioSelected: {
    borderColor: primaryColor.solid1,
    borderWidth: "7px",
  },

  howRow: {
    alignItems: "flex-start",
    columnGap: gap["2xl"],
    display: "flex",
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    rowGap: gap["2xl"],
  },
  howTitle: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: verticalSpace.xxs,
  },
  howBody: {
    color: primaryColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  howHead: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    marginBottom: verticalSpace.md,
    rowGap: gap.xl,
  },

  navRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  navRowEnd: {
    display: "flex",
    justifyContent: "flex-end",
  },

  dropSlot: {
    marginBottom: spacing["6"],
  },
  optIn: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.lg,
    display: "flex",
    fontSize: fontSize.xs,
    marginBottom: spacing["8"],
    rowGap: gap.lg,
  },
  alertSlot: {
    marginBottom: verticalSpace["4xl"],
  },

  done: {
    paddingTop: spacing["8"],
    textAlign: "center",
  },
  doneMark: {
    color: primaryColor.solid1,
    height: spacing["20"],
    marginBlockEnd: spacing["7"],
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    width: spacing["20"],
  },
  doneTitle: {
    marginBottom: verticalSpace.xl,
  },
  doneBody: {
    color: primaryColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: verticalSpace.md,
    marginBlockStart: 0,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "440px",
  },
  doneImported: {
    alignItems: "center",
    color: successColor.text1,
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.sm,
    marginBottom: verticalSpace.md,
    rowGap: gap.sm,
  },
  doneNote: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginBottom: verticalSpace.md,
  },
  doneActions: {
    columnGap: gap.xl,
    display: "flex",
    justifyContent: "center",
    marginTop: spacing["7"],
    rowGap: gap.xl,
  },
});

function CreateFlow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: connectable } = useSuspenseQuery(
    connectablePublicationsQueryOptions(),
  );

  const [step, setStep] = useState(0);
  // Hold the whole chosen publication, not just its uri: finishing invalidates
  // the publications cache, which drops the now-connected publication out of
  // `connectable`, so a `connectable.find(...)` lookup would go null exactly
  // when the Done step needs it.
  const [chosen, setChosen] = useState<ConnectablePublicationData | null>(null);
  const [emails, setEmails] = useState<Array<string>>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  // Connect (opt-in) is required and idempotent; the CSV import is best-effort,
  // so a failed import still lands on the celebration step with a note rather
  // than trapping the author after the publication is already connected.
  const finish = useMutation({
    mutationFn: async (): Promise<{ importError: string | null }> => {
      if (!chosen) throw new Error("no-publication");
      const res = await connectPublicationFn({
        data: { publicationUri: chosen.uri },
      });
      if (!res.ok) throw new Error(res.reason ?? "connect-failed");

      let importError: string | null = null;
      if (emails.length > 0) {
        try {
          const r = await fetch("/api/subscribers/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              publicationUri: chosen.uri,
              emails,
              spaceName: chosen.name,
            }),
          });
          const j = (await r.json()) as { ok?: boolean; error?: string };
          if (!j.ok) importError = j.error ?? "import-failed";
        } catch {
          importError = "network";
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["publications"] });
      return { importError };
    },
    onSuccess: () => setStep(3),
  });

  const back = () =>
    step === 0 ? navigate({ to: "/dashboard" }) : setStep((s) => s - 1);

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadRoomy,
          common.measureNarrow,
        )}
      >
        <button type="button" onClick={back} {...stylex.props(styles.back)}>
          <Ico d={I.chevL} s={15} w={1.9} />
          {step === 0 ? "Dashboard" : "Back"}
        </button>

        {step < 3 ? <Stepper step={step} labels={STEP_LABELS} /> : null}

        {step === 0 ? (
          <ChooseStep
            connectable={connectable}
            chosenUri={chosen?.uri ?? null}
            onChoose={setChosen}
            onContinue={() => setStep(1)}
          />
        ) : null}

        {step === 1 && chosen ? (
          <HowItWorksStep
            pub={chosen}
            onBack={back}
            onNext={() => setStep(2)}
          />
        ) : null}

        {step === 2 && chosen ? (
          <ImportStep
            pub={chosen}
            emails={emails}
            fileName={fileName}
            onFile={(name, addrs) => {
              setFileName(name);
              setEmails(addrs);
            }}
            onClear={() => {
              setFileName(null);
              setEmails([]);
            }}
            onBack={back}
            onFinish={() => finish.mutate()}
            pending={finish.isPending}
            failed={finish.isError}
          />
        ) : null}

        {step === 3 && chosen ? (
          <DoneStep
            pub={chosen}
            imported={emails.length}
            importError={finish.data?.importError ?? null}
            onOpen={() =>
              navigate({ to: "/p/$pubId", params: { pubId: chosen.id } })
            }
            onDashboard={() => navigate({ to: "/dashboard" })}
          />
        ) : null}
      </div>
    </div>
  );
}

function Stepper({ step, labels }: { step: number; labels: Array<string> }) {
  return (
    <div {...stylex.props(styles.stepper)}>
      {labels.map((l, i) => (
        <div
          key={l}
          {...stylex.props(styles.stepGroup)}
          aria-current={i === step ? "step" : undefined}
        >
          <div {...stylex.props(styles.step)}>
            <div
              {...stylex.props(
                styles.bullet,
                i < step && styles.bulletDone,
                i === step && styles.bulletCurrent,
                i > step && styles.bulletTodo,
              )}
            >
              {i < step ? <Ico d={I.check} s={14} w={2.4} /> : i + 1}
            </div>
            <span
              {...stylex.props(
                styles.stepLabel,
                i === step ? styles.stepLabelCurrent : styles.stepLabelOther,
              )}
            >
              {l}
            </span>
          </div>
          {i < labels.length - 1 ? (
            <div {...stylex.props(styles.stepRule)} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChooseStep({
  connectable,
  chosenUri,
  onChoose,
  onContinue,
}: {
  connectable: Array<ConnectablePublicationData>;
  chosenUri: string | null;
  onChoose: (pub: ConnectablePublicationData) => void;
  onContinue: () => void;
}) {
  if (connectable.length === 0) {
    return (
      <div {...stylex.props(common.card, styles.empty)}>
        <div {...stylex.props(styles.emptyTitle)}>No publications to add</div>
        <p {...stylex.props(styles.emptyBody)}>
          Every standard.site publication you own is already a newsletter — or
          you don’t have one yet. Create one in Standard Writer, or any
          standard.site client, and it’ll show up here.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1 {...stylex.props(common.pageTitleSm, styles.stepTitle)}>
        Which publication becomes a newsletter?
      </h1>
      <p {...stylex.props(common.pageIntro, styles.stepIntro)}>
        Pick any standard.site publication you own. We’ll mail each new post to
        its subscribers — you keep writing exactly where you do now.
      </p>
      <div {...stylex.props(common.ruleAbove, styles.list)}>
        {connectable.map((p) => {
          const selected = chosenUri === p.uri;
          return (
            <button
              key={p.uri}
              type="button"
              onClick={() => onChoose(p)}
              aria-pressed={selected}
              {...stylex.props(
                common.ruleBelow,
                styles.choice,
                selected && styles.choiceSelected,
              )}
            >
              <PubAvatar
                name={p.name}
                icon={p.icon}
                iconUrl={p.iconUrl}
                size="lg"
              />
              <div {...stylex.props(common.flexFill)}>
                <div {...stylex.props(styles.choiceName)}>{p.name}</div>
                <div {...stylex.props(styles.choiceUrl)}>{p.url}</div>
              </div>
              <div
                {...stylex.props(
                  styles.radio,
                  selected && styles.radioSelected,
                )}
              />
            </button>
          );
        })}
      </div>
      <div {...stylex.props(styles.navRowEnd)}>
        <Button
          variant="primary"
          size="md"
          isDisabled={!chosenUri}
          onPress={onContinue}
        >
          <span {...stylex.props(common.buttonContent)}>
            Continue
            <Ico d={I.chevR} s={16} w={2} />
          </span>
        </Button>
      </div>
    </div>
  );
}

const HOW_ROWS: Array<{ icon: string; t: string; s: string }> = [
  {
    icon: I.send,
    t: "New posts become sends",
    s: "Each time you publish to this publication, we email it to every subscriber — styled to match.",
  },
  {
    icon: I.mail,
    t: "Your existing posts stay put",
    s: "We don’t touch past posts. Only what you publish from here on goes out, unless you choose to send an older one.",
  },
  {
    icon: I.eye,
    t: "You get the analytics",
    s: "Opens, clicks, growth, unsubscribes, and a per-send report land in this dashboard automatically.",
  },
  {
    icon: I.users,
    t: "Subscribers are yours",
    s: "Export the list any time. No lock-in, no re-permissioning — it’s your audience.",
  },
];

function HowItWorksStep({
  pub,
  onBack,
  onNext,
}: {
  pub: ConnectablePublicationData;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <div {...stylex.props(styles.howHead)}>
        <PubAvatar
          name={pub.name}
          icon={pub.icon}
          iconUrl={pub.iconUrl}
          size="md"
        />
        <h1 {...stylex.props(common.pageTitleSm)}>
          Here’s what turning on {pub.name} does
        </h1>
      </div>
      <p {...stylex.props(common.pageIntro, styles.stepIntro)}>
        No new writing tools, no second draft. Everything runs off the posts you
        already publish.
      </p>
      <div {...stylex.props(common.ruleAbove, styles.list)}>
        {HOW_ROWS.map((r) => (
          <div
            key={r.t}
            {...stylex.props(common.ruleBelow, styles.howRow)}
          >
            <div {...stylex.props(common.chip, common.chipMd)}>
              <Ico d={r.icon} s={18} />
            </div>
            <div>
              <div {...stylex.props(styles.howTitle)}>{r.t}</div>
              <div {...stylex.props(styles.howBody)}>{r.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div {...stylex.props(styles.navRow)}>
        <Button variant="tertiary" size="md" onPress={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" onPress={onNext}>
          <span {...stylex.props(common.buttonContent)}>
            Got it
            <Ico d={I.chevR} s={16} w={2} />
          </span>
        </Button>
      </div>
    </div>
  );
}

function ImportStep({
  pub,
  emails,
  fileName,
  onFile,
  onClear,
  onBack,
  onFinish,
  pending,
  failed,
}: {
  pub: ConnectablePublicationData;
  emails: Array<string>;
  fileName: string | null;
  onFile: (name: string, emails: Array<string>) => void;
  onClear: () => void;
  onBack: () => void;
  onFinish: () => void;
  pending: boolean;
  failed: boolean;
}) {
  return (
    <div>
      <h1 {...stylex.props(common.pageTitleSm, styles.stepTitle)}>
        Bring an existing list?
      </h1>
      <p {...stylex.props(common.pageIntro, styles.stepIntro)}>
        Already have subscribers from another tool? Upload a CSV and we’ll add
        them to {pub.name}. You can always do this later — it’s optional.
      </p>

      <div {...stylex.props(styles.dropSlot)}>
        <CsvDropZone
          emails={emails}
          fileName={fileName}
          onFile={onFile}
          onClear={onClear}
        />
      </div>

      <div {...stylex.props(styles.optIn)}>
        <Ico d={I.check} s={15} style={[icon.positive, icon.fixed]} />
        Imported readers are single opt-in — we’ll send them a one-time
        confirmation before their first issue.
      </div>

      {failed ? (
        <div {...stylex.props(styles.alertSlot)}>
          <Alert variant="critical" title="That didn’t finish">
            Something went wrong finishing up. Please try again.
          </Alert>
        </div>
      ) : null}

      <div {...stylex.props(styles.navRow)}>
        <Button
          variant="tertiary"
          size="md"
          isDisabled={pending}
          onPress={onBack}
        >
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          isPending={pending}
          onPress={onFinish}
        >
          {emails.length > 0 ? "Import & finish" : "Finish"}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  pub,
  imported,
  importError,
  onOpen,
  onDashboard,
}: {
  pub: ConnectablePublicationData;
  imported: number;
  importError: string | null;
  onOpen: () => void;
  onDashboard: () => void;
}) {
  const importedOk = imported > 0 && !importError;
  return (
    <div {...stylex.props(styles.done)}>
      <div
        {...stylex.props(
          common.chip,
          common.chipRound,
          styles.doneMark,
          motion.float,
        )}
      >
        <Ico d={I.sparkle} s={40} w={1.6} />
      </div>
      <h1 {...stylex.props(common.pageTitle, styles.doneTitle)}>
        {pub.name} is a newsletter.
      </h1>
      <p {...stylex.props(styles.doneBody)}>
        The next post you publish goes straight to your subscribers. We’ll track
        how it lands and show you everything here.
      </p>
      {importedOk ? (
        <div {...stylex.props(styles.doneImported)}>
          <Ico d={I.check} s={15} w={2.2} />
          {fmt(imported)} imported{" "}
          {imported === 1 ? "contact is" : "contacts are"} confirming now
        </div>
      ) : null}
      {imported > 0 && importError ? (
        <div {...stylex.props(styles.doneNote)}>
          Your list wasn’t imported — you can add it later from Settings.
        </div>
      ) : null}
      <div {...stylex.props(styles.doneActions)}>
        <Button variant="primary" size="lg" onPress={onOpen}>
          <span {...stylex.props(common.buttonContent)}>
            Go to {pub.name}
            <Ico d={I.chevR} s={17} w={2} />
          </span>
        </Button>
        <Button variant="tertiary" size="lg" onPress={onDashboard}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
