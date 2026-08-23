import {
  SITE_MAX_LINKS,
  SITE_MAX_LINK_LABEL_LENGTH,
  SITE_MAX_TAGLINE_LENGTH,
  SITE_STYLES,
} from "@standard-reader/site-config";
/**
 * Server functions for standalone sites — the public read path, plus the
 * owner-only write path that saves a site's configuration to their repo.
 *
 * The read side never asks who is looking: a site is a public page, and its
 * queries are the same for a signed-out stranger as for the owner previewing
 * it. The write side is the opposite — every call resolves the signed-in DID
 * and refuses anything that is not that account's own.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import type { SitePage } from "./site.server";

const sitePageInput = z.object({
  did: z.string().min(1),
  rkey: z.string().min(1).optional(),
  offset: z.number().int().min(0).default(0),
});

export const getSitePage = createServerFn({ method: "GET" })
  .validator(sitePageInput)
  .handler(async ({ data }): Promise<SitePage | null> => {
    const { loadAuthorSite, loadPublicationSite, resolveSiteDid } =
      await import("./site.server");
    const did = await resolveSiteDid(data.did);
    if (!did) return null;
    return data.rkey
      ? loadPublicationSite(did, data.rkey, data.offset)
      : loadAuthorSite(did, data.offset);
  });

const hexColor = z
  .string()
  .regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)
  .nullable();

const putSiteInput = z.object({
  /** AT-URI of the publication to configure; null for the author's own site. */
  publicationUri: z.string().min(1).nullable().default(null),
  style: z.enum(SITE_STYLES),
  tagline: z.string().max(SITE_MAX_TAGLINE_LENGTH).nullable().default(null),
  theme: z
    .object({
      background: hexColor.default(null),
      foreground: hexColor.default(null),
      accent: hexColor.default(null),
      accentForeground: hexColor.default(null),
    })
    .nullable()
    .default(null),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(SITE_MAX_LINK_LABEL_LENGTH),
        url: z.string().url().max(2048),
      }),
    )
    .max(SITE_MAX_LINKS)
    .default([]),
  showStandardReaderLink: z.boolean().default(true),
  /** Custom domain to serve this site from — a Pro feature. */
  customDomain: z.string().max(253).nullable().default(null),
});

export const putSite = createServerFn({ method: "POST" })
  .validator(putSiteInput)
  .handler(async ({ data }) => {
    const { saveSiteConfig } = await import("./site-write.server");
    return saveSiteConfig(getRequest(), data);
  });

const deleteSiteInput = z.object({
  publicationUri: z.string().min(1).nullable().default(null),
});

export const resetSite = createServerFn({ method: "POST" })
  .validator(deleteSiteInput)
  .handler(async ({ data }) => {
    const { resetSiteConfig } = await import("./site-write.server");
    return resetSiteConfig(getRequest(), data.publicationUri);
  });

/** The sites this account can customize, with their saved configuration. */
export const getOwnedSites = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadOwnedSites } = await import("./site-write.server");
    return loadOwnedSites(getRequest());
  },
);
