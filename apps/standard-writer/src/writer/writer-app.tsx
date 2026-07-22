import { useState } from "react";

import { AppSidebar } from "./app-sidebar";
import type { Article } from "./data";
import { PUBS } from "./data";
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
  const [pubId, setPubId] = useState(PUBS[0].id);
  const [doc, setDoc] = useState<Article | null>(null);
  // The draft currently open in the editor (undefined = a fresh document).
  const [draftId, setDraftId] = useState<string | undefined>();

  const go = (s: Screen) => setScreen(s);
  const openPub = (id: string) => {
    setPubId(id);
    setScreen("pub");
  };
  const openDoc = (d: Article) => {
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

  const pub = PUBS.find((p) => p.id === pubId) ?? PUBS[0];

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
        {screen === "pub" && (
          <PubDetailScreen
            pub={pub}
            go={go}
            openDoc={openDoc}
            newDoc={newDoc}
          />
        )}
        {screen === "newpub" && <NewPubScreen onClose={() => openPub(pubId)} />}
        {screen === "publish" && (
          <PublishScreen go={go} draftId={draftId} onPublished={newDoc} />
        )}
        {screen === "edit" && (
          <EditScreen doc={doc} back={() => openPub(pubId)} />
        )}
      </div>
    </div>
  );
}
