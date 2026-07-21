import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Pathless layout for the collections subtree (`/collections`, `/collections/new`,
 * `/collections/edit/$rkey`). Each child owns its own auth gate + data loading;
 * this just provides the outlet so the builder pages render as full pages.
 */
export const Route = createFileRoute("/_layout/collections")({
  component: () => <Outlet />,
});
