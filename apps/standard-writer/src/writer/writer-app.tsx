import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { Button } from "@standard-reader/design-system/button";
import { useRef, useState } from "react";

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

  // Nav guard: block leaving the editor with unsaved content (except to Publish,
  // which persists on its own). WriteScreen reports dirtiness and registers a
  // "save as draft" action; a pending navigation waits on the confirm dialog.
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const saveDraftRef = useRef<(() => Promise<unknown>) | null>(null);

  // Run `proceed`, unless we're leaving a dirty editor — then defer it behind
  // the confirm dialog. `skip` covers same-screen and Publish transitions.
  const guarded = (proceed: () => void, skip = false) => {
    if (screen === "write" && editorDirty && !skip) {
      setPendingNav(() => proceed);
    } else {
      proceed();
    }
  };

  const go = (s: Screen) => {
    guarded(
      () => {
        // Reaching the publication screen from anywhere but the edit action means
        // a fresh, blank "New publication".
        if (s === "newpub") setEditingPub(undefined);
        setScreen(s);
      },
      s === "publish" || s === screen,
    );
  };
  const editPub = (p: WriterPublication) => {
    guarded(() => {
      setEditingPub(p);
      setScreen("newpub");
    });
  };
  const openPub = (id: string) => {
    guarded(() => {
      setPubId(id);
      setScreen("pub");
    });
  };
  const openDoc = (d: WriterDocument) => {
    guarded(() => {
      setDoc(d);
      setScreen("edit");
    });
  };
  const openDraft = (id: string) => {
    guarded(() => {
      setDraftId(id);
      setScreen("write");
    });
  };
  const newDoc = () => {
    guarded(() => {
      setDraftId(undefined);
      setScreen("write");
    });
  };
  const backToPub = () => (pubId ? openPub(pubId) : go("write"));

  // Resolve the deferred navigation and clear the guard state.
  const proceedPending = () => {
    const proceed = pendingNav;
    setPendingNav(null);
    setEditorDirty(false);
    proceed?.();
  };
  const discardAndLeave = () => proceedPending();
  const saveAndLeave = async () => {
    setSavingDraft(true);
    try {
      await saveDraftRef.current?.();
    } finally {
      setSavingDraft(false);
    }
    proceedPending();
  };

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
            onDirtyChange={setEditorDirty}
            registerSaveDraft={(save) => {
              saveDraftRef.current = save;
            }}
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

      <AlertDialog
        isOpen={pendingNav != null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null);
        }}
        trigger={<span aria-hidden style={{ display: "none" }} />}
      >
        <AlertDialogHeader>Save this draft?</AlertDialogHeader>
        <AlertDialogDescription>
          You have unsaved changes in the editor. Save them as a draft before
          leaving?
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="tertiary" onPress={() => setPendingNav(null)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            isDisabled={savingDraft}
            onPress={discardAndLeave}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            isPending={savingDraft}
            onPress={() => void saveAndLeave()}
          >
            Save as draft
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  );
}
