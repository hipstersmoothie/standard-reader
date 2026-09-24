/**
 * Pull a read-only sample of real documents for the language-detector
 * benchmark: at most one per publication (so a prolific blog can't dominate),
 * plus an oversample of documents containing non-Latin scripts, since the
 * corpus is overwhelmingly English and a random draw barely sees anything else.
 *
 *   tsx --env-file=.env scripts/lang-bench/pull-sample.ts <out.jsonl> [n]
 */
import { writeFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

const [out, nArg] = process.argv.slice(2);
const n = Number(nArg ?? 3000);
const sql = neon(process.env.DATABASE_URL!);

const random = await sql`
  select distinct on (publication_uri) uri, title, description,
         left(text_content, 6000) as text_content
  from (select * from documents tablesample system (2)
        where deleted = false and length(coalesce(text_content,'')) > 150) d
  order by publication_uri, random()
  limit ${n}`;
const nonLatin = await sql`
  select uri, title, description, left(text_content, 6000) as text_content
  from (select * from documents tablesample system (5)
        where deleted = false and length(coalesce(text_content,'')) > 150) d
  where text_content ~ '[Ѐ-ӿ֐-ۿऀ-෿฀-໿぀-ヿ一-鿿가-힯]{8}'
  order by random() limit ${Math.round(n / 3)}`;

const seen = new Set<string>();
const rows = [...random, ...nonLatin].filter((r) =>
  seen.has(r.uri) ? false : (seen.add(r.uri), true),
);
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`wrote ${rows.length} (${random.length} random, ${nonLatin.length} non-latin)`);
