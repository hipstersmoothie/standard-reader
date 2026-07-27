export const HELP = `standard-reader — convert your AT Protocol document records between formats

USAGE
  standard-reader <command> [options]

COMMANDS
  list                 Show the account's documents and what converting them would cost
  convert --to <fmt>   Convert document records and write them back to the repo
  formats              Print the block-by-block capability matrix for every format
  help                 Show this message

FORMATS
  leaflet    pub.leaflet.content
  offprint   app.offprint.content
  pckt       blog.pckt.content
  markpub    at.markpub.markdown

AUTHENTICATION
  Only writing needs credentials. \`list\` and \`convert --dry-run\` read public
  endpoints, so they run against any published blog with nothing configured:

    standard-reader list --repo someone.bsky.social
    standard-reader convert --to pckt --dry-run --repo someone.bsky.social

  --identifier <handle>   Account handle or DID    (env STANDARD_READER_IDENTIFIER)
  --password <app-pw>     Bluesky *app password*   (env STANDARD_READER_APP_PASSWORD)
  --pds <url>             PDS base URL             (env STANDARD_READER_PDS_URL)
  --repo <hnd|did>        Read this repo instead of your own (no sign-in needed)

CONVERT OPTIONS
  -t, --to <format>       Target format (required)
  -f, --from <format>     Only convert documents currently in this format
      --rkey <rkey>       Only convert this record; repeatable
      --limit <n>         Stop after n documents
  -n, --dry-run           Convert and report, but write nothing
      --out <dir>         Also write each converted content payload to this directory
  -y, --yes               Do not prompt; convert what is safe, skip what loses content
      --force             Convert every record, including ones that lose content
      --strict            Stop for any change at all, not just for dropped blocks
      --no-backup         Do not save the original records before overwriting
      --backup-dir <dir>  Where to save originals (default: ./standard-reader-backup-<time>)
      --json              Machine-readable report on stdout

WHEN A CONVERSION LOSES SOMETHING
  Not every structure survives every format — pckt has tables and Leaflet does not,
  Leaflet has footnotes and the others do not. Records whose conversion would drop
  content are shown with what would be lost and offered one at a time, so you can
  opt out of that record and keep the rest of the run going. Without a terminal to
  ask in, those records are skipped; --force converts them anyway.

  Originals are written to a backup directory before any record is overwritten, and
  every write is pinned to the CID it was converted from, so a record edited
  elsewhere in the meantime fails rather than being clobbered.

EXAMPLES
  standard-reader formats
  standard-reader list --to pckt --repo someone.bsky.social
  standard-reader convert --to markpub --dry-run --out ./preview
  standard-reader convert --to pckt --from leaflet
  standard-reader convert --to offprint --rkey 3kabc --force
`;
