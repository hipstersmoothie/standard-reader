import { useState } from "react";

import type {
  WriterDocument,
  WriterPublication,
} from "../integrations/tanstack-query/api-publications.functions";
import { AppSidebar } from "./app-sidebar";
import { DraftsScreen } from "./drafts-screen";
import { EditScreen } from "./edit-screen";
import { NewPubScreen } from "./new-publication-screen";
import { PubDetailScreen } from "./publication-screen";
import { PublishScreen } from "./publish-screen";
import { C } from "./tokens";
import type { Layout, Screen } from "./types";
import { WriteScreen } from "./write-screen";

export function WriterApp() {
  const [screen, setScreen] = useState<Screen>("write");
  const [layout, setLayout] = useState<Layout>("focus");
  // The selected publication's at:// uri, and the document open in the editor.
  const [pubId, setPubId] = useState<string | undefined>();
  const [doc, setDoc] = useState<WriterDocument | null>(null);
  // The publication being edited on the New/Edit publication screen.
  const [editingPub, setEditingPub] = useState<WriterPublication | undefined>();
  // The draft currently open in the editor (undefined = a fresh document).
  const [draftId, setDraftId] = useState<string | undefined>();

  const go = (s: Screen) => {
    // Reaching the publication screen from anywhere but the edit action means a
    // fresh, blank "New publication".
    if (s === "newpub") setEditingPub(undefined);
    setScreen(s);
  };
  const editPub = (p: WriterPublication) => {
    setEditingPub(p);
    setScreen("newpub");
  };
  const openPub = (id: string) => {
    setPubId(id);
    setScreen("pub");
  };
  const openDoc = (d: WriterDocument) => {
    setDoc(d);
    setScreen("edit");
  };
  const openDraft = (id: string) => {
    setDraftId(id);
    setScreen("write");
  };
  const newDoc = () => {
    setDraftId(undefined);
    setScreen("write");
  };
  const backToPub = () => (pubId ? openPub(pubId) : go("write"));

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
        overflow: "hidden",
      }}
    >
      <AppSidebar screen={screen} pubId={pubId} go={go} openPub={openPub} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {screen === "write" && (
          <WriteScreen
            layout={layout}
            setLayout={setLayout}
            go={go}
            draftId={draftId}
            onDraftIdChange={setDraftId}
          />
        )}
        {screen === "drafts" && (
          <DraftsScreen openDraft={openDraft} newDoc={newDoc} />
        )}
        {screen === "pub" && pubId && (
          <PubDetailScreen
            pubId={pubId}
            onEdit={editPub}
            openDoc={openDoc}
            newDoc={newDoc}
          />
        )}
        {screen === "newpub" && (
          <NewPubScreen onClose={backToPub} publication={editingPub} />
        )}
        {screen === "publish" && (
          <PublishScreen go={go} draftId={draftId} onPublished={newDoc} />
        )}
        {screen === "edit" && <EditScreen doc={doc} back={backToPub} />}
      </div>
    </div>
  );
}
