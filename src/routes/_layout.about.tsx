import { createFileRoute } from "@tanstack/react-router";

import { Content } from "../design-system/content";
import { Page } from "../design-system/page";
import { Body } from "../design-system/typography";
import { getPublicUrlClient } from "../lib/public-url";
import { pageSocialMeta } from "../lib/site-metadata";

export const Route = createFileRoute("/_layout/about")({
  head: () => ({
    meta: pageSocialMeta("about", getPublicUrlClient()),
  }),
  component: About,
});

function About() {
  return (
    <Page.Root variant="small">
      <Page.Header>
        <Page.BackLink />
        <Page.Title>About</Page.Title>
      </Page.Header>

      <Content>
        <Body>
          This is a placeholder About page built with the hip-ui design system.
        </Body>
      </Content>
    </Page.Root>
  );
}
