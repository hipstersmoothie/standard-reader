import { createFileRoute } from "@tanstack/react-router";

import { Button } from "../design-system/button";
import { Content } from "../design-system/content";
import { Flex } from "../design-system/flex";
import { Page } from "../design-system/page";
import { Body, Heading2 } from "../design-system/typography";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Page.Root variant="large">
      <Content>
        <Heading2>Placeholder</Heading2>
        <Body>
          Replace this with your own content. Build UI from the components and
          tokens in src/design-system.
        </Body>
      </Content>

      <Flex gap="2xl" wrap>
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary</Button>
      </Flex>
    </Page.Root>
  );
}
