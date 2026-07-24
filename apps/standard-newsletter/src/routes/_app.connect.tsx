import { Button } from "@standard-reader/design-system/button";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { I, Ico } from "../components/icons";
import { PubAvatar } from "../components/ui";
import type { ConnectablePublicationData } from "../server/analytics";
import {
  connectPublicationFn,
  connectablePublicationsQueryOptions,
} from "../server/analytics";
import { C, POS, R, fmt } from "../theme";

export const Route = createFileRoute("/_app/connect")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(connectablePublicationsQueryOptions()),
  component: CreateFlow,
});

const STEP_LABELS = ["Choose", "How it works", "Import list", "Done"];

/** Pull unique, lowercased email addresses out of pasted text or a CSV. */
function extractEmails(text: string): Array<string> {
  const found = text.match(/[^\s,;<>()"]+@[^\s,;<>()"]+\.[^\s,;<>()"]+/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

function CreateFlow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: connectable } = useSuspenseQuery(
    connectablePublicationsQueryOptions(),
  );

  const [step, setStep] = useState(0);
  const [chosenUri, setChosenUri] = useState<string | null>(null);
  const [emails, setEmails] = useState<Array<string>>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const chosen = connectable.find((p) => p.uri === chosenUri) ?? null;

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
            body: JSON.stringify({ publicationUri: chosen.uri, emails }),
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
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 720, margin: "0 auto", padding: "40px 40px 90px" }}
      >
        <button
          type="button"
          onClick={back}
          style={{
            font: "inherit",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.mut,
            marginBottom: 26,
            padding: 0,
          }}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {step === 0 ? "Dashboard" : "Back"}
        </button>

        {step < 3 ? <Stepper step={step} labels={STEP_LABELS} /> : null}

        {step === 0 ? (
          <ChooseStep
            connectable={connectable}
            chosenUri={chosenUri}
            onChoose={setChosenUri}
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
            error={
              finish.isError && finish.failureReason
                ? String(finish.failureReason.message ?? "")
                : null
            }
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        marginBottom: 40,
      }}
    >
      {labels.map((l, i) => (
        <div
          key={l}
          style={{ display: "contents" }}
          aria-current={i === step ? "step" : undefined}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: R.full,
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12.5,
                fontWeight: 600,
                background:
                  i < step ? C.a9 : i === step ? C.sel5 : "transparent",
                color: i < step ? C.onAccent : i === step ? C.a11 : C.mut,
                border:
                  i === step
                    ? `1px solid ${C.a9}`
                    : i > step
                      ? `1px solid ${C.b6}`
                      : "none",
              }}
            >
              {i < step ? <Ico d={I.check} s={14} w={2.4} /> : i + 1}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: i === step ? 600 : 500,
                color: i === step ? C.t12 : C.mut,
                whiteSpace: "nowrap",
              }}
            >
              {l}
            </span>
          </div>
          {i < labels.length - 1 ? (
            <div
              style={{ flex: 1, height: 1, background: C.b6, margin: "0 16px" }}
            />
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
  onChoose: (uri: string) => void;
  onContinue: () => void;
}) {
  if (connectable.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${C.b6}`,
          borderRadius: R.lg,
          background: C.warm,
          padding: "48px 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: C.serif,
            fontSize: 21,
            fontWeight: 500,
            color: C.t12,
            marginBottom: 8,
          }}
        >
          No publications to add
        </div>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.6,
            color: C.mut,
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          Every standard.site publication you own is already a newsletter — or
          you don’t have one yet. Create one in Standard Writer, or any
          standard.site client, and it’ll show up here.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1
        style={{
          fontFamily: C.serif,
          fontWeight: 500,
          fontSize: 30,
          letterSpacing: "-0.02em",
          margin: "0 0 8px",
          color: C.t12,
        }}
      >
        Which publication becomes a newsletter?
      </h1>
      <p
        style={{
          fontSize: 14.5,
          color: C.mut,
          margin: "0 0 26px",
          lineHeight: 1.6,
        }}
      >
        Pick any standard.site publication you own. We’ll mail each new post to
        its subscribers — you keep writing exactly where you do now.
      </p>
      <div style={{ borderTop: `1px solid ${C.b6}`, marginBottom: 30 }}>
        {connectable.map((p) => {
          const selected = chosenUri === p.uri;
          return (
            <button
              key={p.uri}
              type="button"
              onClick={() => onChoose(p.uri)}
              style={{
                font: "inherit",
                textAlign: "left",
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 15,
                padding: "15px 12px",
                borderBottom: `1px solid ${C.b6}`,
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                background: selected ? C.sel5 : "transparent",
              }}
            >
              <PubAvatar
                name={p.name}
                icon={p.icon}
                iconUrl={p.iconUrl}
                size="lg"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: C.serif,
                    fontSize: 17,
                    fontWeight: 500,
                    color: C.t12,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.mut,
                    fontFamily: C.mono,
                    marginTop: 2,
                  }}
                >
                  {p.url}
                </div>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: R.full,
                  flex: "none",
                  border: selected
                    ? `7px solid ${C.a9}`
                    : `1.5px solid ${C.b7}`,
                }}
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="primary"
          size="md"
          isDisabled={!chosenUri}
          onPress={onContinue}
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          marginBottom: 8,
        }}
      >
        <PubAvatar
          name={pub.name}
          icon={pub.icon}
          iconUrl={pub.iconUrl}
          size="md"
        />
        <h1
          style={{
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: "-0.02em",
            margin: 0,
            color: C.t12,
          }}
        >
          Here’s what turning on {pub.name} does
        </h1>
      </div>
      <p
        style={{
          fontSize: 14.5,
          color: C.mut,
          margin: "0 0 28px",
          lineHeight: 1.6,
        }}
      >
        No new writing tools, no second draft. Everything runs off the posts you
        already publish.
      </p>
      <div style={{ borderTop: `1px solid ${C.b6}`, marginBottom: 30 }}>
        {HOW_ROWS.map((r) => (
          <div
            key={r.t}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 15,
              padding: "17px 12px",
              borderBottom: `1px solid ${C.b6}`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: R.md,
                background: C.sel5,
                color: C.a11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
            >
              <Ico d={r.icon} s={18} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.t12,
                  marginBottom: 3,
                }}
              >
                {r.t}
              </div>
              <div style={{ fontSize: 13.5, color: C.a11, lineHeight: 1.55 }}>
                {r.s}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="tertiary" size="md" onPress={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" onPress={onNext}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
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
  error,
}: {
  pub: ConnectablePublicationData;
  emails: Array<string>;
  fileName: string | null;
  onFile: (name: string, emails: Array<string>) => void;
  onClear: () => void;
  onBack: () => void;
  onFinish: () => void;
  pending: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const ingest = async (file: File) => {
    const text = await file.text();
    onFile(file.name, extractEmails(text));
  };

  return (
    <div>
      <h1
        style={{
          fontFamily: C.serif,
          fontWeight: 500,
          fontSize: 28,
          letterSpacing: "-0.02em",
          margin: "0 0 8px",
          color: C.t12,
        }}
      >
        Bring an existing list?
      </h1>
      <p
        style={{
          fontSize: 14.5,
          color: C.mut,
          margin: "0 0 26px",
          lineHeight: 1.6,
        }}
      >
        Already have subscribers from another tool? Upload a CSV and we’ll add
        them to {pub.name}. You can always do this later — it’s optional.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void ingest(file);
        }}
      />

      {emails.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void ingest(file);
          }}
          style={{
            border: `1.5px dashed ${dragOver ? C.a9 : C.b7}`,
            borderRadius: R.lg,
            padding: "40px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: C.warm,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: R.md,
              background: C.sel5,
              color: C.a11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <Ico d={I.upload} s={22} />
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: C.t12,
              marginBottom: 4,
            }}
          >
            Drop a CSV here, or click to browse
          </div>
          <div style={{ fontSize: 13, color: C.mut }}>
            One email per row. Name and signup date optional.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            border: `1px solid ${C.b6}`,
            borderRadius: R.md,
            padding: "16px 18px",
            background: C.warm,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: R.md,
              background: C.sel5,
              color: C.a11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            <Ico d={I.file} s={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.t12 }}>
              {fileName}
            </div>
            <div
              style={{
                fontSize: 13,
                color: POS,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <Ico d={I.check} s={14} w={2.4} />
              {fmt(emails.length)} valid{" "}
              {emails.length === 1 ? "address" : "addresses"} ready to import
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            style={{
              font: "inherit",
              border: "none",
              background: "transparent",
              fontSize: 13,
              color: C.mut,
              cursor: "pointer",
              flex: "none",
            }}
          >
            Remove
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: C.mut,
          marginBottom: 30,
        }}
      >
        <Ico d={I.check} s={15} style={{ color: POS, flex: "none" }} />
        Imported readers are single opt-in — we’ll send them a one-time
        confirmation before their first issue.
      </div>

      {error ? (
        <div
          style={{
            fontSize: 13,
            color: C.mut,
            marginBottom: 18,
          }}
        >
          Something went wrong finishing up. Please try again.
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
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
    <div style={{ textAlign: "center", padding: "30px 0 0" }}>
      <div
        className="sn-float"
        style={{
          width: 82,
          height: 82,
          borderRadius: R.full,
          background: C.sel5,
          color: C.a9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 26px",
        }}
      >
        <Ico d={I.sparkle} s={40} w={1.6} />
      </div>
      <h1
        style={{
          fontFamily: C.serif,
          fontWeight: 500,
          fontSize: 34,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
          color: C.t12,
        }}
      >
        {pub.name} is a newsletter.
      </h1>
      <p
        style={{
          fontSize: 15.5,
          color: C.a11,
          margin: "0 auto 8px",
          maxWidth: 440,
          lineHeight: 1.6,
        }}
      >
        The next post you publish goes straight to your subscribers. We’ll track
        how it lands and show you everything here.
      </p>
      {importedOk ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            color: POS,
            marginBottom: 8,
          }}
        >
          <Ico d={I.check} s={15} w={2.2} />
          {fmt(imported)} imported{" "}
          {imported === 1 ? "contact is" : "contacts are"} confirming now
        </div>
      ) : null}
      {imported > 0 && importError ? (
        <div style={{ fontSize: 13, color: C.mut, marginBottom: 8 }}>
          Your list wasn’t imported — you can add it later from Settings.
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          marginTop: 26,
        }}
      >
        <Button variant="primary" size="lg" onPress={onOpen}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
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
