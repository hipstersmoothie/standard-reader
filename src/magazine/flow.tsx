"use client";

import { ArticleContent } from "#/components/reader/content/article-content";
import { forwardRef } from "react";

import type { MagFeature, MagIssue, MagMeta } from "./types";

import { MagHoverButton } from "./mag-hover-button";
import { MagMarkdown } from "./MagMarkdown";
import { MagazineEndLike } from "./magazine-end-like";
import { MagazineEndSubscribe } from "./magazine-end-subscribe";
import { MagazineFeatureEnd } from "./magazine-feature-end";

/**
 * Collection editorial intro — a full spread after the cover, rendered only when
 * there's editorial body copy. Leads with the publication name + the collection
 * title (there's no separate editorial title), then the editorial markdown.
 */
export function EditorialFlow({ issue }: { issue: MagIssue }) {
  const body = issue.editorial?.body;
  if (!body) return null;
  // A flowing block (like a feature body) — NOT a fixed `.flow-col` — so long
  // editorial copy fragments across pages instead of overflowing one column.
  // (It must not carry `.feature-body`: the measure pass indexes those by
  // feature, which the editorial isn't.)
  return (
    <div className="editorial-spread">
      <header className="opener">
        {issue.publicationName ? (
          <div className="editorial-pub">{issue.publicationName}</div>
        ) : null}
        <h1 className="headline lg editorial-title">{issue.name}</h1>
        <hr className="opener-rule" />
      </header>
      <MagMarkdown className="editorial-body">{body}</MagMarkdown>
    </div>
  );
}

function Kick({ meta, muted }: { meta: MagMeta; muted?: boolean }) {
  return (
    <div className={`kick ${muted ? "muted" : ""}`}>
      <span>{meta.pubName}</span>
      <span className="sep" />
      <span>{meta.topic}</span>
    </div>
  );
}

function Byline({ meta }: { meta: MagMeta }) {
  return (
    <div className="byline">
      <span className="by">{meta.author}</span>
      {meta.date ? <span className="mono">{meta.date}</span> : null}
      <span className="mono">{meta.minutes} min read</span>
    </div>
  );
}

export function CoverFlow({
  issue,
  onJump,
}: {
  issue: MagIssue;
  onJump: (featureIndex: number) => void;
}) {
  return (
    <>
      <section
        className={`flow-col cover-left ${issue.coverImageUrl ? "has-cover" : ""}`}
      >
        {issue.coverImageUrl ? (
          <img className="cover-hero" src={issue.coverImageUrl} alt="" />
        ) : (
          <div aria-hidden />
        )}
        <div className="cover-title-block">
          {issue.publicationName ? (
            <div className="cover-pub">{issue.publicationName}</div>
          ) : null}
          <h1 className="cover-masthead">{issue.name}</h1>
        </div>
        <div className="cover-sub">
          {issue.ownerHandle ? `@${issue.ownerHandle} · ` : ""}
          {issue.features.length} features
        </div>
      </section>
      <section className="flow-col cover-right">
        <div className="cover-toc-title" style={{ paddingTop: "1.4em" }}>
          In this issue
        </div>
        <div className="cover-toc-list">
          {issue.features.map((f, i) => (
            <MagHoverButton
              type="button"
              className="cover-toc-row"
              key={f.meta.id}
              onClick={() => onJump(i)}
            >
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              <span className="t">{f.meta.title}</span>
              <span className="p">{f.meta.pubName}</span>
            </MagHoverButton>
          ))}
        </div>
      </section>
    </>
  );
}

/** A feature: art-directed opener (image or text) followed by the real body. */
export const FeatureFlow = forwardRef<
  HTMLElement,
  {
    feature: MagFeature;
    coverImageUrl: string | null;
    /** Mobile single-page: bleed photo + overlay to the stage edges. */
    fullBleed?: boolean;
  }
>(function FeatureFlowComponent({ feature, coverImageUrl, fullBleed }, ref) {
  const { meta, detail } = feature;
  const hasImage = Boolean(coverImageUrl);

  return (
    <>
      {hasImage ? (
        <section
          className={`flow-col img-page${fullBleed ? " is-active-opener" : ""}`}
          ref={ref}
        >
          <div className="img-page-bleed">
            <img className="img-bg" src={coverImageUrl ?? ""} alt="" />
            <div className="img-caption">
              <span className="dot" />
              <span>{meta.topic}</span>
            </div>
            <div className="img-overlay">
              <Kick meta={meta} />
              <h1 className="headline xl">{meta.title}</h1>
              {meta.dek ? <p className="dek">{meta.dek}</p> : null}
              <Byline meta={meta} />
            </div>
          </div>
        </section>
      ) : null}

      <div className="feature-body">
        <header
          className="opener"
          ref={hasImage ? undefined : (ref as React.Ref<HTMLDivElement>)}
        >
          {hasImage ? (
            <Kick meta={meta} muted />
          ) : (
            <>
              <Kick meta={meta} />
              <h1 className="headline lg">{meta.title}</h1>
              {meta.dek ? <p className="dek">{meta.dek}</p> : null}
            </>
          )}
          <Byline meta={meta} />
          <hr className="opener-rule" />
        </header>
        {feature.note ? (
          <aside className="feature-note">
            <div className="feature-note-label">Editor’s note</div>
            <MagMarkdown className="feature-note-body">
              {feature.note}
            </MagMarkdown>
          </aside>
        ) : null}
        <ArticleContent
          article={detail}
          hasHero
          skipFirstBlock={meta.leadImageFromFirstBlock}
        />
        <MagazineFeatureEnd detail={detail} />
      </div>
    </>
  );
});

export const EndCardFlow = forwardRef<HTMLElement, { issue: MagIssue }>(
  function EndCardFlowComponent({ issue }, ref) {
    const subscribe = issue.subscribe;
    const ctaName = subscribe?.name ?? issue.publicationName ?? issue.name;
    const colophonBody = issue.colophon?.body?.trim();

    const endActions = (
      <>
        <h1 className="headline md">The End.</h1>
        {subscribe ? (
          <div className="endcard-subscribe">
            <h2 className="headline lg endcard-cta-title">{ctaName}</h2>
            <p className="endcard-cta-dek">
              {subscribe.kind === "publication"
                ? "Subscribe to get new writing in your feed."
                : "Follow this list to read new articles from its publications."}
            </p>
            <MagazineEndSubscribe target={subscribe} />
          </div>
        ) : null}
        {issue.documentUri ? (
          <MagazineEndLike
            documentUri={issue.documentUri}
            recommendCount={issue.recommendCount ?? 0}
          />
        ) : null}
      </>
    );

    if (colophonBody) {
      return (
        <>
          <section className="flow-col colophon-spread">
            <header className="opener">
              {issue.publicationName ? (
                <div className="editorial-pub">{issue.publicationName}</div>
              ) : null}
              <h1 className="headline lg editorial-title">{issue.name}</h1>
              <hr className="opener-rule" />
            </header>
            <MagMarkdown className="colophon-body">{colophonBody}</MagMarkdown>
          </section>
          <section className="flow-col endcard" ref={ref}>
            {endActions}
          </section>
        </>
      );
    }

    return (
      <section className="flow-col endcard" ref={ref}>
        {endActions}
        <div className="colophon">
          {issue.name} · {issue.no}
          <br />
          {issue.features.length} features
          {issue.ownerHandle ? ` · edited by @${issue.ownerHandle}` : ""}
        </div>
      </section>
    );
  },
);
