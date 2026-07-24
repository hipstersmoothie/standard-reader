import { Button } from "@standard-reader/design-system/button";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";

import { CsvDropZone } from "../components/csv-drop-zone";
import { I, Ico } from "../components/icons";
import { publicationsQueryOptions } from "../server/analytics";
import { C, NEG, POS, R, fmt } from "../theme";

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
        body: JSON.stringify({ publicationUri: pub.uri, emails }),
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
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 720, margin: "0 auto", padding: "30px 40px 90px" }}
      >
        <Link
          to="/p/$pubId/subscribers"
          params={{ pubId }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.mut,
            textDecoration: "none",
          }}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {pub.name} subscribers
        </Link>

        <h1
          style={{
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 32,
            letterSpacing: "-0.02em",
            margin: "16px 0 8px",
            color: C.t12,
          }}
        >
          Import subscribers
        </h1>
        <p
          style={{
            fontSize: 14.5,
            color: C.mut,
            margin: "0 0 26px",
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          Already have subscribers from another tool? Upload a CSV and we’ll add
          them to {pub.name} — saved to your publication’s subscriber-list
          record, data you own.
        </p>

        {state === "done" ? (
          <div
            style={{
              border: `1px solid ${C.b6}`,
              borderRadius: R.lg,
              background: C.warm,
              padding: "28px 26px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                fontWeight: 600,
                color: C.t12,
                marginBottom: 6,
              }}
            >
              <Ico d={I.check} s={18} w={2.2} style={{ color: POS }} />
              {fmt(count)} {count === 1 ? "subscriber" : "subscribers"} imported
            </div>
            <p
              style={{
                fontSize: 13.5,
                color: C.mut,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Imported readers are single opt-in — we’ll send a one-time
              confirmation before their first issue.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
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

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12.5,
                color: C.mut,
                margin: "22px 0 30px",
              }}
            >
              <Ico d={I.check} s={15} style={{ color: POS, flex: "none" }} />
              Imported readers are single opt-in — we’ll send them a one-time
              confirmation before their first issue.
            </div>

            {state === "error" ? (
              <div
                style={{
                  fontSize: 13,
                  color: NEG,
                  marginBottom: 18,
                  lineHeight: 1.6,
                }}
              >
                {error === "no-happyview"
                  ? "Subscriber import isn’t available yet — permissioned storage isn’t configured for this instance."
                  : error === "no-session"
                    ? "Your sign-in session expired. Sign in again and retry."
                    : error === "not-owner" || error === "unauthenticated"
                      ? "Import failed. Check that you own this publication and try again."
                      : `Import failed: ${error ?? "unknown error"}`}
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
