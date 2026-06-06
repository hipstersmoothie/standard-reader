import { Outlet, createFileRoute } from "@tanstack/react-router";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { HeaderLayout } from "../design-system/header-layout";

export const Route = createFileRoute("/_layout")({
  component: LayoutRoute,
});

function LayoutRoute() {
  return (
    <HeaderLayout.Root>
      <HeaderLayout.Header>
        <Header />
      </HeaderLayout.Header>

      <HeaderLayout.Page>
        <Outlet />
      </HeaderLayout.Page>

      <HeaderLayout.Footer>
        <Footer />
      </HeaderLayout.Footer>
    </HeaderLayout.Root>
  );
}
