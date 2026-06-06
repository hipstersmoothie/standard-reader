import { createFileRoute } from "@tanstack/react-router";

import { Masthead, ReaderContent } from "../components/reader/primitives";
import { Body } from "../design-system/typography";

export const Route = createFileRoute("/_layout/search")({ component: Search });

function Search() {
  return (
    <ReaderContent>
      <Masthead
        kicker="Search the network"
        title="Search"
        dek="Publications, handles, topics, and headlines."
      />
      <Body>
        Live results split into Publications and Articles land here next.
      </Body>
    </ReaderContent>
  );
}
