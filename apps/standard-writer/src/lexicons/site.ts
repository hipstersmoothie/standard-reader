/**
 * `app.standard-reader.site` — how an author or one of their publications
 * presents itself as a standalone site.
 *
 * The lexicon is the reader's (its ingester mirrors these records into `sites`),
 * but Standard Writer is where they are authored. Only the NSID is needed here:
 * the record shape is validated by `@standard-reader/site-config` on the way in
 * and on the way out.
 *
 * Its own module, and not `server/site-write.server`, because the OAuth client
 * needs the NSID to build its scope — and importing the write path from the
 * auth layer would close a cycle through the session store.
 */
export const SITE_COLLECTION = "app.standard-reader.site";
