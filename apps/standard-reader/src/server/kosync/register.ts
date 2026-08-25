/**
 * Recording what a downloaded file will look like to KOReader.
 *
 * Called from the single-document download routes, where one file maps to one
 * article. Anthologies deliberately do not register: a shelf of forty pieces is
 * one file to a device, and there is no honest way to mirror "62% through the
 * book" onto any single article. Positions in an anthology still sync between
 * devices — they just do not reach back into the app's reading history.
 */

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";

import { koreaderFilenameMd5, koreaderPartialMd5 } from "./document-hash";
import { rememberBookHashes } from "./store";

export async function rememberDownloadHashes(
  documentUri: string,
  bytes: Uint8Array,
  filename: string,
): Promise<void> {
  try {
    await rememberBookHashes(db, schema, documentUri, [
      { hash: koreaderPartialMd5(bytes), method: "binary" },
      { hash: koreaderFilenameMd5(filename), method: "filename" },
    ]);
  } catch {
    // A download is the reader's file; a bookkeeping row that failed to write
    // is not worth failing it over. The worst case is that progress from that
    // device does not mirror into reading history until the next download.
  }
}
