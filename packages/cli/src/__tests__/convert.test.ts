/**
 * End-to-end coverage of `convert`, with the PDS stubbed out.
 *
 * The parts worth pinning down are the ones that touch someone's repo: which
 * records get written, which are left alone because content would be lost, and
 * that a write always carries the CID it was converted from.
 */

import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseArgs } from "../args.js";
import type * as AtprotoModule from "../atproto.js";

const listDocuments = vi.fn();
const putDocumentContent = vi.fn();

vi.mock("../atproto.js", async (importOriginal) => {
  const actual = await importOriginal<typeof AtprotoModule>();
  return {
    ...actual,
    listDocuments: (...args: Array<unknown>) => listDocuments(...args),
    login: () =>
      Promise.resolve({
        client: {},
        did: "did:plc:testauthor",
        handle: "author.test",
        service: "https://pds.test",
      }),
    putDocumentContent: (...args: Array<unknown>) =>
      putDocumentContent(...args),
    // The stubbed documents are all inline, so resolution is a pass-through.
    resolveContent: (_session: unknown, _did: string, content: unknown) =>
      Promise.resolve(content),
  };
});

const { runConvert } = await import("../commands/convert.js");

function leafletDoc(rkey: string, blocks: Array<Record<string, unknown>>) {
  return {
    cid: `bafy-${rkey}`,
    rkey,
    uri: `at://did:plc:testauthor/site.standard.document/${rkey}`,
    value: {
      $type: "site.standard.document",
      content: {
        $type: "pub.leaflet.content",
        pages: [
          {
            $type: "pub.leaflet.pages.linearDocument",
            blocks: blocks.map((block) => ({
              $type: "pub.leaflet.pages.linearDocument#block",
              block,
            })),
          },
        ],
      },
      publishedAt: "2026-01-01T00:00:00.000Z",
      site: "at://did:plc:testauthor/site.standard.publication/main",
      title: `Doc ${rkey}`,
    },
  };
}

const text = (plaintext: string) => ({
  $type: "pub.leaflet.blocks.text",
  plaintext,
});
const poll = {
  $type: "pub.leaflet.blocks.poll",
  pollRef: { cid: "bafypoll", uri: "at://did:plc:x/pub.leaflet.poll/1" },
};

async function run(argv: Array<string>) {
  return runConvert(parseArgs(["convert", ...argv]));
}

beforeEach(() => {
  listDocuments.mockReset();
  putDocumentContent.mockReset();
  putDocumentContent.mockResolvedValue({ cid: "bafy-new", uri: "at://new" });
  process.env.STANDARD_READER_IDENTIFIER = "author.test";
  process.env.STANDARD_READER_APP_PASSWORD = "app-password";
});

describe("convert", () => {
  it("writes a clean conversion, pinned to the CID it converted from", async () => {
    listDocuments.mockResolvedValue([leafletDoc("aaa", [text("Hello")])]);

    const code = await run(["--to", "pckt", "--yes", "--no-backup"]);

    expect(code).toBe(0);
    expect(putDocumentContent).toHaveBeenCalledTimes(1);
    const [, input] = putDocumentContent.mock.calls[0] as [
      unknown,
      {
        content: Record<string, unknown>;
        record: Record<string, unknown>;
        rkey: string;
        swapRecord: string;
      },
    ];
    expect(input.rkey).toBe("aaa");
    expect(input.swapRecord).toBe("bafy-aaa");
    expect(input.content.$type).toBe("blog.pckt.content");
    // Every other field of the record survives untouched.
    expect(input.record.title).toBe("Doc aaa");
    expect(input.record.site).toBe(
      "at://did:plc:testauthor/site.standard.publication/main",
    );
  });

  it("leaves a record alone when a block would be dropped", async () => {
    listDocuments.mockResolvedValue([
      leafletDoc("aaa", [text("Hello")]),
      leafletDoc("bbb", [text("Hello"), poll]),
    ]);

    await run(["--to", "pckt", "--yes", "--no-backup"]);

    expect(putDocumentContent).toHaveBeenCalledTimes(1);
    const [, input] = putDocumentContent.mock.calls[0] as [
      unknown,
      { rkey: string },
    ];
    expect(input.rkey).toBe("aaa");
  });

  it("converts the lossy record too under --force", async () => {
    listDocuments.mockResolvedValue([leafletDoc("bbb", [text("Hi"), poll])]);

    await run(["--to", "pckt", "--force", "--no-backup"]);

    expect(putDocumentContent).toHaveBeenCalledTimes(1);
  });

  it("writes nothing on a dry run", async () => {
    listDocuments.mockResolvedValue([leafletDoc("aaa", [text("Hello")])]);

    await run(["--to", "pckt", "--yes", "--dry-run"]);

    expect(putDocumentContent).not.toHaveBeenCalled();
  });

  it("skips documents already in the target format", async () => {
    listDocuments.mockResolvedValue([leafletDoc("aaa", [text("Hello")])]);

    await run(["--to", "leaflet", "--yes", "--no-backup"]);

    expect(putDocumentContent).not.toHaveBeenCalled();
  });

  it("honours --rkey and --from filters", async () => {
    listDocuments.mockResolvedValue([
      leafletDoc("aaa", [text("Hello")]),
      leafletDoc("bbb", [text("Hello")]),
    ]);

    await run(["--to", "pckt", "--rkey", "bbb", "--yes", "--no-backup"]);
    expect(putDocumentContent).toHaveBeenCalledTimes(1);

    putDocumentContent.mockClear();
    await run([
      "--to",
      "pckt",
      "--from",
      "blog.pckt.content",
      "--yes",
      "--no-backup",
    ]);
    expect(putDocumentContent).not.toHaveBeenCalled();
  });

  it("saves the original record before overwriting it", async () => {
    listDocuments.mockResolvedValue([leafletDoc("aaa", [text("Hello")])]);
    const backupDir = await mkdtemp(join(tmpdir(), "sr-backup-"));

    await run(["--to", "pckt", "--yes", "--backup-dir", backupDir]);

    expect(await readdir(backupDir)).toEqual(["aaa.json"]);
    const saved = JSON.parse(
      await readFile(join(backupDir, "aaa.json"), "utf8"),
    ) as { cid: string; value: { content: { $type: string } } };
    expect(saved.cid).toBe("bafy-aaa");
    expect(saved.value.content.$type).toBe("pub.leaflet.content");
  });

  it("writes converted payloads to --out", async () => {
    listDocuments.mockResolvedValue([leafletDoc("aaa", [text("Hello")])]);
    const outDir = await mkdtemp(join(tmpdir(), "sr-out-"));

    await run(["--to", "markpub", "--yes", "--dry-run", "--out", outDir]);

    expect(await readdir(outDir)).toEqual(["aaa.markpub.json"]);
    const written = JSON.parse(
      await readFile(join(outDir, "aaa.markpub.json"), "utf8"),
    ) as { $type: string; text: { markdown: string } };
    expect(written.$type).toBe("at.markpub.markdown");
    expect(written.text.markdown).toBe("Hello");
  });

  it("reports a failed write without stopping the run", async () => {
    listDocuments.mockResolvedValue([
      leafletDoc("aaa", [text("One")]),
      leafletDoc("bbb", [text("Two")]),
    ]);
    putDocumentContent
      .mockRejectedValueOnce(new Error("swapRecord mismatch"))
      .mockResolvedValueOnce({ cid: "bafy-new", uri: "at://new" });

    const code = await run(["--to", "pckt", "--yes", "--no-backup"]);

    expect(putDocumentContent).toHaveBeenCalledTimes(2);
    expect(code).toBe(1);
  });

  it("emits a machine-readable report under --json", async () => {
    listDocuments.mockResolvedValue([leafletDoc("bbb", [text("Hi"), poll])]);
    const lines: Array<string> = [];
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });

    await run(["--to", "pckt", "--json", "--dry-run"]);
    write.mockRestore();

    const report = JSON.parse(lines.join("")) as {
      documents: Array<{
        issues: Array<{ severity: string }>;
        outcome: string;
      }>;
      target: string;
    };
    expect(report.target).toBe("pckt");
    expect(report.documents[0]?.outcome).toBe("skipped-warnings");
    expect(report.documents[0]?.issues[0]?.severity).toBe("unsupported");
  });
});
