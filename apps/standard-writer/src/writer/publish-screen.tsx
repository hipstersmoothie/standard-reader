import { Button } from "@standard-reader/design-system/button";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { Switch } from "@standard-reader/design-system/switch";
import { useState } from "react";

import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { C, cardBox } from "./tokens";
import type { Screen } from "./types";

interface PublishScreenProps {
  go: (screen: Screen) => void;
}

export function PublishScreen({ go }: PublishScreenProps) {
  const [publishing, setPublishing] = useState(false);

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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  fontSize: 12.5,
                  color: C.mut,
                  fontFamily: C.mono,
                }}
              >
                <Ico d={I.link} s={14} />
                marginaliadispatch.com/you-own-the-press
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
              isPending={publishing}
              onPress={() => {
                setPublishing(true);
                setTimeout(() => setPublishing(false), 1600);
              }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Ico d={I.up} s={17} w={2} />
                Publish to my repo
              </span>
            </Button>
            <div style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.5 }}>
              You can re-edit and re-publish anytime — the repo record stays the
              source of truth.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
