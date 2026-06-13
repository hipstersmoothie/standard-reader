import type {
  Db,
  ProfileSummary,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";

import {
  publicationCardColumns,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { eq } from "drizzle-orm";

export interface PublicationHeader {
  publication: PublicationCard;
  owner: ProfileSummary;
}

export async function selectPublicationHeader(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<PublicationHeader | null> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const [row] = await db
    .select({
      ...publicationCardColumns(schema),
      ownerHandle: pr.handle,
      ownerDisplayName: pr.displayName,
      ownerDescription: pr.description,
      ownerBannerUrl: pr.bannerUrl,
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(eq(p.uri, publicationUri))
    .limit(1);

  if (!row) return null;

  return {
    publication: toPublicationCard(row),
    owner: {
      did: row.did,
      handle: row.ownerHandle,
      displayName: row.ownerDisplayName,
      description: row.ownerDescription,
      avatarUrl: row.ownerAvatarUrl,
      bannerUrl: row.ownerBannerUrl,
    },
  };
}
