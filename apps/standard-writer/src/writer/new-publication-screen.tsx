import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { Button } from "@standard-reader/design-system/button";
import {
  ColorPicker,
  DefaultColorEditor,
} from "@standard-reader/design-system/color-picker";
import { Switch } from "@standard-reader/design-system/switch";
import { TextArea } from "@standard-reader/design-system/text-area";
import { TextField } from "@standard-reader/design-system/text-field";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { publicationsApi } from "../integrations/tanstack-query/api-publications.functions";
import type { WriterPublication } from "../integrations/tanstack-query/api-publications.functions";
import type { PubTheme, ThemePreset } from "./data";
import { PALETTE, THEME_PRESETS, THEME_ROLES } from "./data";
import { I, Ico } from "./icons";
import { clickable } from "./interaction";
import { C, cardBox, sectLabel } from "./tokens";

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const n = Number.parseInt(
    m.length === 3 ? [...m].map((c) => c + c).join("") : m,
    16,
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

type ColorValue = string | { toString: (format: "hex") => string };

const colHex = (c: ColorValue): string =>
  typeof c === "string" ? c : c.toString("hex");

interface NewPubScreenProps {
  onClose: () => void;
  /** When present, the screen edits this publication instead of creating one. */
  publication?: WriterPublication;
}

export function NewPubScreen({ onClose, publication }: NewPubScreenProps) {
  const isEditing = publication != null;
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      publicationsApi.deletePublication({
        data: { publicationUri: publication?.uri as string },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-publications"] });
      onClose();
    },
  });
  const [theme, setTheme] = useState<ThemePreset>(
    publication
      ? { id: "custom", name: "Custom", ...publication.theme }
      : THEME_PRESETS[0],
  );
  const [discover, setDiscover] = useState(publication?.discoverable ?? true);
  const [name, setName] = useState(publication?.name ?? "");
  // Bumped when a preset is picked so the (uncontrolled) color pickers remount
  // and re-sync to the preset's values without disrupting manual edits.
  const [presetGen, setPresetGen] = useState(0);

  const pickPreset = (p: ThemePreset) => {
    setTheme(p);
    setPresetGen((g) => g + 1);
  };

  const setColor = (key: keyof PubTheme, v: string) =>
    setTheme((t) => ({ ...t, id: "custom", name: "Custom", [key]: v }));

  const activePreset = THEME_PRESETS.find(
    (p) =>
      p.background === theme.background &&
      p.foreground === theme.foreground &&
      p.accent === theme.accent &&
      p.accentForeground === theme.accentForeground,
  );

  const accentRgb = hexToRgb(theme.accent);

  return (
    <div
      className="sw-scroll"
      style={{ height: "100%", overflow: "auto", background: C.pageBg }}
    >
      <div
        style={{ maxWidth: 1020, margin: "0 auto", padding: "40px 40px 90px" }}
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
            {...clickable(onClose)}
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
            Back
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
          {isEditing ? "Edit publication" : "New publication"}
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            color: C.mut,
            fontSize: 14.5,
            maxWidth: 640,
          }}
        >
          Writes a{" "}
          <code style={{ fontFamily: C.mono, fontSize: 13 }}>
            site.standard.publication
          </code>{" "}
          record to your repo. Documents you publish here inherit its identity
          and theme.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 380px",
            gap: 26,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                ...cardBox,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}>
                Identity
              </div>
              <div
                style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
              >
                <div style={{ flex: "none" }}>
                  <div style={{ fontSize: 13, color: C.a11, marginBottom: 8 }}>
                    Icon
                  </div>
                  <div
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 16,
                      border: `1.5px dashed ${C.b7}`,
                      background: C.pageBg,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      color: C.mut,
                      cursor: "pointer",
                      textAlign: "center",
                      padding: 8,
                    }}
                  >
                    <Ico d={I.img} s={20} w={1.6} />
                    <span style={{ fontSize: 10.5, lineHeight: 1.3 }}>
                      Square, ≥256px
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <TextField
                    label="Name"
                    value={name}
                    onChange={setName}
                    size="md"
                    isRequired
                  />
                  <TextField
                    label="Base URL"
                    prefix="https://"
                    defaultValue={publication?.url ?? ""}
                    placeholder="yourpublication.com"
                    size="md"
                    isRequired
                    description="Document URLs combine this with each document’s path."
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: C.a11, marginBottom: 6 }}>
                  Description
                </div>
                <TextArea
                  aria-label="Description"
                  defaultValue={publication?.description ?? ""}
                  placeholder="What is this publication about?"
                  rows={3}
                />
              </div>
            </div>

            <div
              style={{
                ...cardBox,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div>
                <div
                  style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}
                >
                  Theme
                </div>
                <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
                  <code style={{ fontFamily: C.mono, fontSize: 12 }}>
                    site.standard.theme.basic
                  </code>{" "}
                  — how readers render your content.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {THEME_PRESETS.map((p) => {
                  const on = activePreset != null && activePreset.id === p.id;
                  return (
                    <div
                      key={p.id}
                      {...clickable(() => pickPreset(p))}
                      style={{
                        cursor: "pointer",
                        border: `1.5px solid ${on ? C.a9 : C.b6}`,
                        borderRadius: 12,
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        width: 96,
                        background: on ? C.ui3 : "transparent",
                      }}
                    >
                      <div
                        style={{
                          height: 40,
                          borderRadius: 7,
                          background: p.background,
                          border: `1px solid ${C.b7}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: p.foreground,
                          }}
                        />
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: p.accent,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.t12,
                          textAlign: "center",
                        }}
                      >
                        {p.name}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                {THEME_ROLES.map((role) => (
                  <div
                    key={role.key}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <ColorPicker
                      key={`${presetGen}-${role.key}`}
                      label={role.label}
                      defaultValue={theme[role.key]}
                      onChange={(c) => setColor(role.key, colHex(c))}
                    >
                      <DefaultColorEditor swatches={PALETTE} />
                    </ColorPicker>
                    <div
                      style={{ fontSize: 11.5, color: C.mut, paddingLeft: 2 }}
                    >
                      {role.desc} ·{" "}
                      <span style={{ fontFamily: C.mono }}>
                        {theme[role.key].toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                ...cardBox,
                padding: 22,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}
                >
                  Show in Discover
                </div>
                <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
                  List this publication in network discovery feeds.{" "}
                  <span style={{ fontFamily: C.mono }}>
                    preferences.showInDiscover
                  </span>
                </div>
              </div>
              <Switch
                isSelected={discover}
                onChange={setDiscover}
                aria-label="Show in Discover"
              />
            </div>

            {isEditing && (
              <div
                style={{
                  ...cardBox,
                  padding: 22,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  borderColor: "#e0b4a4",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontFamily: C.serif, fontSize: 18, color: C.t12 }}
                  >
                    Delete publication
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>
                    Removes the{" "}
                    <span style={{ fontFamily: C.mono }}>
                      site.standard.publication
                    </span>{" "}
                    record from your repo. Documents already published keep
                    their own records.
                  </div>
                </div>
                <AlertDialog
                  trigger={
                    <Button variant="critical" size="md">
                      Delete
                    </Button>
                  }
                >
                  <AlertDialogHeader>
                    Delete this publication?
                  </AlertDialogHeader>
                  <AlertDialogDescription>
                    “{publication.name}” will be permanently removed from your
                    repo. This can’t be undone.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancelButton />
                    <AlertDialogActionButton
                      variant="critical"
                      closeOnPress={false}
                      isPending={remove.isPending}
                      onPress={() => remove.mutate()}
                    >
                      Delete publication
                    </AlertDialogActionButton>
                  </AlertDialogFooter>
                </AlertDialog>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                paddingTop: 4,
              }}
            >
              <Button variant="primary" size="lg" onPress={onClose}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ico d={I.up} s={17} w={2} />
                  {isEditing ? "Save changes" : "Create publication"}
                </span>
              </Button>
              <Button variant="tertiary" size="lg" onPress={onClose}>
                Cancel
              </Button>
            </div>
          </div>

          <div
            style={{
              position: "sticky",
              top: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={sectLabel}>Live preview</div>
            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: `1px solid ${C.b6}`,
                boxShadow: "0 18px 44px -22px rgba(40,30,20,0.4)",
              }}
            >
              <div
                style={{
                  background: theme.background,
                  color: theme.foreground,
                  padding: 24,
                  transition: "background .15s, color .15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: theme.accent,
                      color: theme.accentForeground,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: C.serif,
                      fontSize: 17,
                      flex: "none",
                    }}
                  >
                    {(name.trim()[0] || "P").toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontFamily: C.serif,
                      fontSize: 17,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {name.trim() || "Publication"}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: C.serif,
                    fontSize: 25,
                    fontWeight: 500,
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    marginBottom: 10,
                  }}
                >
                  You Own the Press
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    opacity: 0.85,
                    marginBottom: 14,
                  }}
                >
                  A publication is a set of signed records in a repo you
                  control. Read more in{" "}
                  <span style={{ color: theme.accent, fontWeight: 600 }}>
                    the full essay
                  </span>
                  .
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 8,
                    background: theme.accent,
                    color: theme.accentForeground,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "9px 16px",
                  }}
                >
                  Subscribe
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: C.mut,
                lineHeight: 1.5,
                fontFamily: C.mono,
              }}
            >
              accent rgb {accentRgb.r} {accentRgb.g} {accentRgb.b} · stored per
              site.standard.theme.color#rgb
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
