import { initBskyEmbedBookmarks } from "../lib/bsky-embed-bookmark";

export default defineContentScript({
  matches: ["https://bsky.app/*", "https://staging.bsky.app/*"],
  runAt: "document_idle",
  async main() {
    await initBskyEmbedBookmarks();
  },
});
