import { Button } from "@standard-reader/design-system/button";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { I, Ico } from "../components/icons";
import { PubAvatar } from "../components/ui";
import {
  connectPublicationFn,
  connectablePublicationsQueryOptions,
  publicationsQueryOptions,
} from "../server/analytics";
import { C, R, fmt, sectLabel } from "../theme";

export const Route = createFileRoute("/_app/connect")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        connectablePublicationsQueryOptions(),
      ),
      context.queryClient.ensureQueryData(publicationsQueryOptions()),
    ]);
  },
  component: Connect,
});

function Connect() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: connectable } = useSuspenseQuery(
    connectablePublicationsQueryOptions(),
  );
  const { data: connected } = useSuspenseQuery(publicationsQueryOptions());

  const connect = useMutation({
    mutationFn: (publicationUri: string) =>
      connectPublicationFn({ data: { publicationUri } }),
    onSuccess: async (result, publicationUri) => {
      if (!result.ok) return;
      // Both lists move: the publication leaves "available" and joins the
      // sidebar/dashboard. Refetch before navigating so the destination isn't
      // rendered from a cache that predates the connect.
      await queryClient.invalidateQueries({ queryKey: ["publications"] });
      const pub = connectable.find((p) => p.uri === publicationUri);
      if (pub) navigate({ to: "/p/$pubId", params: { pubId: pub.id } });
    },
  });

  const pending = connect.isPending ? connect.variables : null;

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.pageBg }}>
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "44px 40px 90px" }}
      >
        <h1
          style={{
            fontFamily: C.serif,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
            color: C.t12,
          }}
        >
          Add a newsletter
        </h1>
        <p
          style={{
            margin: "0 0 34px",
            color: C.a11,
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          Pick one of your standard.site publications. From then on, every post
          you publish to it is mailed to its subscribers — you keep writing
          where you already write. Nothing is sent for a publication until you
          add it here.
        </p>

        {connectable.length === 0 ? (
          <EmptyState hasConnected={connected.length > 0} />
        ) : (
          <>
            <div style={sectLabel}>Your publications</div>
            <div>
              {connectable.map((p) => (
                <div
                  key={p.uri}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 0",
                    borderTop: `1px solid ${C.b6}`,
                  }}
                >
                  <PubAvatar
                    name={p.name}
                    icon={p.icon}
                    iconUrl={p.iconUrl}
                    size="lg"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: C.serif,
                        fontSize: 17,
                        color: C.t12,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 13, color: C.mut, marginTop: 3 }}>
                      {p.url} · {fmt(p.posts)} post{p.posts === 1 ? "" : "s"} ·{" "}
                      {fmt(p.followers)} follower{p.followers === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    isPending={pending === p.uri}
                    onPress={() => connect.mutate(p.uri)}
                  >
                    Add as newsletter
                  </Button>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: `1px solid ${C.b6}`,
                paddingTop: 18,
                fontSize: 13,
                color: C.mut,
              }}
            >
              Adding a publication doesn’t mail anything retroactively — only
              posts you publish from then on.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Two genuinely different empty states: an author who has already connected
 * everything they own, and one whose account has no publications at all. The
 * second is the more common first-run case and needs to point somewhere useful.
 */
function EmptyState({ hasConnected }: { hasConnected: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${C.b6}`,
        borderRadius: R.lg,
        background: C.warm,
        padding: "48px 40px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: R.lg,
          background: C.sel5,
          color: C.a11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Ico d={I.book} s={24} />
      </div>
      <div
        style={{
          fontFamily: C.serif,
          fontSize: 21,
          fontWeight: 500,
          color: C.t12,
          marginBottom: 8,
        }}
      >
        {hasConnected
          ? "Every publication is already a newsletter"
          : "No publications on this account"}
      </div>
      <p
        style={{
          fontSize: 14.5,
          lineHeight: 1.6,
          color: C.mut,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        {hasConnected
          ? "You’ve added all of the standard.site publications you own. Publish a post and it goes out to that publication’s subscribers."
          : "Standard Newsletter mails the posts from a standard.site publication you own. Create one in Standard Writer — or any standard.site client — and it will show up here."}
      </p>
    </div>
  );
}
