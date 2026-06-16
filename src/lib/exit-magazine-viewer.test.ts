import { describe, expect, it, vi } from "vitest";

import { exitMagazineViewer } from "./exit-magazine-viewer";

const pub = { did: "did:plc:pub", rkey: "pub1" };
const doc = { did: "did:plc:doc", rkey: "col1" };

describe("exitMagazineViewer", () => {
  it("navigates to publication on fresh collection load", () => {
    const onNavigate = vi.fn();
    exitMagazineViewer({
      history: { back: vi.fn(), go: vi.fn() },
      canGoBack: false,
      openInMagazine: true,
      mode: "collection",
      did: doc.did,
      rkey: doc.rkey,
      publicationParams: pub,
      onNavigate,
    });
    expect(onNavigate).toHaveBeenCalledWith({
      to: "/p/$did/$rkey",
      params: pub,
    });
  });

  it("goes back when magazine-first is enabled and history exists", () => {
    const back = vi.fn();
    const onNavigate = vi.fn();
    exitMagazineViewer({
      history: { back, go: vi.fn(), index: 2, entries: [{}, {}, {}] },
      canGoBack: true,
      openInMagazine: true,
      mode: "collection",
      did: doc.did,
      rkey: doc.rkey,
      publicationParams: pub,
      onNavigate,
    });
    expect(back).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("skips the reader redirect when magazine-first is enabled", () => {
    const go = vi.fn();
    const onNavigate = vi.fn();
    exitMagazineViewer({
      history: {
        back: vi.fn(),
        go,
        index: 2,
        entries: [
          { pathname: "/discover" },
          { pathname: `/a/${doc.did}/${doc.rkey}` },
          { pathname: `/magazine/${doc.did}/${doc.rkey}` },
        ],
      },
      canGoBack: true,
      openInMagazine: true,
      mode: "collection",
      did: doc.did,
      rkey: doc.rkey,
      publicationParams: pub,
      onNavigate,
    });
    expect(go).toHaveBeenCalledWith(-2);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens the collection document when magazine-first is disabled", () => {
    const back = vi.fn();
    const onNavigate = vi.fn();
    exitMagazineViewer({
      history: { back, go: vi.fn(), index: 1, entries: [{}, {}] },
      canGoBack: true,
      openInMagazine: false,
      mode: "collection",
      did: doc.did,
      rkey: doc.rkey,
      publicationParams: pub,
      onNavigate,
    });
    expect(onNavigate).toHaveBeenCalledWith({
      to: "/a/$did/$rkey",
      params: doc,
    });
    expect(back).not.toHaveBeenCalled();
  });

  it("opens the list page on fresh list load", () => {
    const onNavigate = vi.fn();
    exitMagazineViewer({
      history: { back: vi.fn(), go: vi.fn() },
      canGoBack: false,
      openInMagazine: false,
      mode: "list",
      did: "did:plc:list",
      rkey: "list1",
      publicationParams: null,
      onNavigate,
    });
    expect(onNavigate).toHaveBeenCalledWith({
      to: "/l/$did/$rkey",
      params: { did: "did:plc:list", rkey: "list1" },
    });
  });
});
