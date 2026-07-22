import { Button } from "@standard-reader/design-system/button";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { Switch } from "@standard-reader/design-system/switch";
import { TextField } from "@standard-reader/design-system/text-field";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { sessionQueryOptions } from "../integrations/tanstack-query/api-auth.functions";
import { publishApi } from "../integrations/tanstack-query/api-publish.functions";
import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { C, cardBox } from "./tokens";
import type { Screen } from "./types";

interface PublishScreenProps {
  go: (screen: Screen) => void;
  draftId: string | undefined;
  onPublished: () => void;
}

export function PublishScreen({
  go,
  draftId,
  onPublished,
}: PublishScreenProps) {
  const { data: session } = useQuery(sessionQueryOptions);
  const [site, setSite] = useState("marginaliadispatch.com/you-own-the-press");

  const publish = useMutation({
    mutationFn: () =>
      publishApi.publishDraft({
        data: { draftId: draftId as string, site: `https://${site.trim()}` },
      }),
    onSuccess: () => {
      // The repo record is now the source of truth; the draft was cleared.
      setTimeout(onPublished, 1400);
    },
  });

  const canPublish = Boolean(session && draftId && site.trim());

  return (
    <div
      className="sw-scroll"
      style={{ height: "100%", overflow: "auto", background: C.pageBg }}
    >
      <div
        style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 40px 80px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <span
            {...clickable(() => go("write"))}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: C.mut,
              cursor: "pointer",
            }}
          >
            <Ico d={I.chevL} s={15} w={1.9} />
            Back to editor
          </span>
        </div>
        <h1
          style={{
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: "-0.02em",
            margin: "0 0 4px",
            color: C.t12,
          }}
        >
          Publish “You Own the Press”
        </h1>
        <p style={{ margin: "0 0 28px", color: C.mut, fontSize: 14.5 }}>
          Writes records to your PDS via{" "}
          <code style={{ fontFamily: C.mono, fontSize: 13 }}>
            com.atproto.repo.*
          </code>
          . The draft clears once the document lands.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            maxWidth: 640,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ ...cardBox, padding: 22 }}>
              <div
                style={{
                  fontFamily: C.serif,
                  fontSize: 18,
                  color: C.t12,
                  marginBottom: 16,
                }}
              >
                Destination
              </div>
              <Select
                aria-label="Destination"
                defaultSelectedKey="marginalia"
                size="md"
              >
                <SelectItem id="marginalia">The Marginalia Dispatch</SelectItem>
                <SelectItem id="signals">Signals</SelectItem>
                <SelectItem id="loose">
                  Loose document (no publication)
                </SelectItem>
              </Select>
              <div style={{ marginTop: 12 }}>
                <TextField
                  aria-label="Document URL"
                  prefix="https://"
                  value={site}
                  onChange={setSite}
                  size="sm"
                  description="Where this document lives. Standard Reader renders it as a loose document, bylined by your DID."
                />
              </div>
            </div>

            <div style={{ ...cardBox, padding: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: "#1185fe",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    dangerouslySetInnerHTML={{ __html: I.bsky }}
                  />
                </div>
                <div>
                  <div
                    style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}
                  >
                    Announce on Bluesky
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mut }}>
                    Opt-in. Feeds Reader&apos;s discussion &amp; backlink
                    surfaces.
                  </div>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  <Switch defaultSelected aria-label="Announce on Bluesky" />
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  border: `1px solid ${C.b6}`,
                  borderRadius: 12,
                  background: C.pageBg,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 15, color: C.ink, lineHeight: 1.5 }}>
                  New essay — <strong>You Own the Press</strong>. On why a
                  publication is a set of signed records in a repo you control,
                  not a feed on someone else&apos;s server. 🧵
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12.5,
                    color: C.a11,
                    fontFamily: C.mono,
                  }}
                >
                  🔗 marginaliadispatch.com/you-own-the-press
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              paddingTop: 4,
            }}
          >
            <Button
              variant="primary"
              size="lg"
              isPending={publish.isPending}
              isDisabled={!canPublish}
              onPress={() => publish.mutate()}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Ico d={I.up} s={17} w={2} />
                {publish.isSuccess ? "Published" : "Publish to my repo"}
              </span>
            </Button>
            <div style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.5 }}>
              {publish.isError ? (
                <span style={{ color: "#a33a2a" }}>
                  {publish.error instanceof Error
                    ? publish.error.message
                    : "Publish failed."}
                </span>
              ) : publish.isSuccess ? (
                <span style={{ color: "#3f7d4e" }}>
                  Published — the record is in your repo. Reader will ingest it.
                </span>
              ) : session ? (
                draftId ? (
                  "You can re-edit and re-publish anytime — the repo record stays the source of truth."
                ) : (
                  "Start writing on the Write screen — a draft autosaves, then you can publish it."
                )
              ) : (
                "Sign in to publish to your repo."
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
