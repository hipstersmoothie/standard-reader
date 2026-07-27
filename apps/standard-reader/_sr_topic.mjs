import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const PUB = "at://did:plc:topictest/site.standard.publication/p1";
const DID = "did:plc:topictest";
await sql`INSERT INTO publications (uri, did, rkey, name, url) VALUES (${PUB}, ${DID}, 'p1', 'Topic Test', 'https://t.example') ON CONFLICT (uri) DO NOTHING`;
await sql`INSERT INTO documents (uri, did, rkey, title, site_uri, publication_uri, tags, published_at) VALUES
  (${PUB + "/d1"}, ${DID}, 'd1', 'A', ${PUB}, ${PUB}, ARRAY['Tech','design'], now()),
  (${PUB + "/d2"}, ${DID}, 'd2', 'B', ${PUB}, ${PUB}, ARRAY['tech','politics'], now()),
  (${PUB + "/d3"}, ${DID}, 'd3', 'C', ${PUB}, ${PUB}, ARRAY[' TECH '], now())
  ON CONFLICT (uri) DO NOTHING`;
