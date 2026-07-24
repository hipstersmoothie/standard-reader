import { Alert } from "@standard-reader/design-system/alert";
import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";

import { common } from "../common-styles";
import { CsvDropZone } from "../components/csv-drop-zone";
import { I, Ico, icon } from "../components/icons";
import { fmt } from "../lib/format";
import { publicationsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/_app/p/$pubId_/subscribers/import")({
  loader: async ({ context, params }) => {
    const pubs = await context.queryClient.ensureQueryData(
      publicationsQueryOptions(),
    );
    if (!pubs.some((p) => p.id === params.pubId)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ImportSubscribersPage,
});

type State = "idle" | "importing" | "done" | "error";

/** What actually went wrong, in the author's terms rather than the API's. */
function importErrorMessage(error: string | null): string {
  switch (error) {
    case "no-happyview": {
      return "Subscriber import isn’t available yet — permissioned storage isn’t configured for this instance.";
    }
    case "no-session": {
      return "Your sign-in session expired. Sign in again and retry.";
    }
    case "not-owner":
    case "unauthenticated": {
      return "Import failed. Check that you own this publication and try again.";
    }
    default: {
      return `Import failed: ${error ?? "unknown error"}`;
    }
  }
}

const styles = stylex.create({
  title: {
    fontSize: fontSize["3xl"],
    marginBlockEnd: verticalSpace.md,
    marginBlockStart: verticalSpace["3xl"],
  },
  intro: {
    marginBlockEnd: spacing["7"],
    maxWidth: "520px",
  },

  done: {
    paddingBlockEnd: spacing["7"],
    paddingBlockStart: spacing["7"],
    paddingInlineEnd: horizontalSpace["6xl"],
    paddingInlineStart: horizontalSpace["6xl"],
  },
  doneHead: {
    alignItems: "center",
    color: uiColor.text2,
    columnGap: gap.md,
    display: "inline-flex",
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: verticalSpace.sm,
    rowGap: gap.md,
  },
  doneBody: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  doneActions: {
    columnGap: gap.lg,
    display: "flex",
    marginTop: verticalSpace["4xl"],
    rowGap: gap.lg,
  },

  optIn: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.lg,
    display: "flex",
    fontSize: fontSize.xs,
    marginBlockEnd: spacing["8"],
    marginBlockStart: spacing["6"],
    rowGap: gap.lg,
  },
  error: {
    marginBottom: verticalSpace["4xl"],
  },
});

function ImportSubscribersPage() {
  const { pubId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const pub = pubs.find((p) => p.id === pubId);

  const [emails, setEmails] = useState<Array<string>>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!pub) return null;

  const onImport = async () => {
    if (emails.length === 0) return;
    setState("importing");
    setError(null);
    try {
      const res = await fetch("/api/subscribers/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicationUri: pub.uri,
          emails,
          spaceName: pub.name,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        count?: number;
        error?: string;
        skipped?: string;
        message?: string;
      } | null;
      if (json?.ok) {
        setCount(json.count ?? emails.length);
        setState("done");
        setEmails([]);
        setFileName(null);
        await queryClient.invalidateQueries({
          queryKey: ["publications", "subscribers", pubId],
        });
        await queryClient.invalidateQueries({ queryKey: ["publications"] });
      } else {
        setError(
          json?.message ?? json?.error ?? json?.skipped ?? "import-failed",
        );
        setState("error");
      }
    } catch {
      setError("network");
      setState("error");
    }
  };

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadTight,
          common.measureNarrow,
        )}
      >
        <Link
          to="/p/$pubId/subscribers"
          params={{ pubId }}
          {...stylex.props(common.backLink)}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {pub.name} subscribers
        </Link>

        <h1 {...stylex.props(common.pageTitle, styles.title)}>
          Import subscribers
        </h1>
        <p {...stylex.props(common.pageIntro, styles.intro)}>
          Already have subscribers from another tool? Upload a CSV and we’ll add
          them to {pub.name} — saved to your publication’s subscriber-list
          record, data you own.
        </p>

        {state === "done" ? (
          <div {...stylex.props(common.card, styles.done)}>
            <div {...stylex.props(styles.doneHead)}>
              <Ico d={I.check} s={18} w={2.2} style={icon.positive} />
              {fmt(count)} {count === 1 ? "subscriber" : "subscribers"} imported
            </div>
            <p {...stylex.props(styles.doneBody)}>
              Imported readers are single opt-in — we’ll send a one-time
              confirmation before their first issue.
            </p>
            <div {...stylex.props(styles.doneActions)}>
              <Button
                variant="primary"
                size="sm"
                onPress={() =>
                  navigate({ to: "/p/$pubId/subscribers", params: { pubId } })
                }
              >
                View subscribers
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                onPress={() => setState("idle")}
              >
                Import more
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CsvDropZone
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
            />

            <div {...stylex.props(styles.optIn)}>
              <Ico
                d={I.check}
                s={15}
                style={[icon.positive, icon.fixed]}
              />
              Imported readers are single opt-in — we’ll send them a one-time
              confirmation before their first issue.
            </div>

            {state === "error" ? (
              <div {...stylex.props(styles.error)}>
                <Alert variant="critical" title="Import didn’t finish">
                  {importErrorMessage(error)}
                </Alert>
              </div>
            ) : null}

            <Button
              variant="primary"
              size="md"
              isPending={state === "importing"}
              isDisabled={emails.length === 0}
              onPress={onImport}
            >
              {emails.length > 0
                ? `Import ${fmt(emails.length)} ${emails.length === 1 ? "subscriber" : "subscribers"}`
                : "Import"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
