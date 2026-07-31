import { initBskyEmbedBookmarks } from "../lib/bsky-embed-bookmark";
import { bskyEmbedMatches } from "../lib/manifest-hosts";

export default defineContentScript({
  matches: bskyEmbedMatches(import.meta.env.DEV),
  runAt: "document_idle",
  async main() {
    await initBskyEmbedBookmarks();
  },
});
