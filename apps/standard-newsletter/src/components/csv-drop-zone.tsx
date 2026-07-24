import { useRef, useState } from "react";

import { extractEmails } from "../lib/emails";
import { C, POS, R, fmt } from "../theme";
import { I, Ico } from "./icons";

/**
 * The subscriber-CSV upload widget shared by the create-newsletter wizard and
 * the per-publication import page: a drag-and-drop / click-to-browse target that
 * flips to a file chip once addresses are parsed. Parsing is client-side and
 * tolerant (see `extractEmails`); the parent owns the resulting `emails`.
 */
export function CsvDropZone({
  emails,
  fileName,
  onFile,
  onClear,
}: {
  emails: Array<string>;
  fileName: string | null;
  onFile: (name: string, emails: Array<string>) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const ingest = async (file: File) => {
    const text = await file.text();
    onFile(file.name, extractEmails(text));
  };

  return (
    <>
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
    </>
  );
}
