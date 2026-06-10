import type { SavedHandle } from "#/utils/saved-handles";

import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { unauthMiddleware } from "#/middleware/auth";
import { getSavedHandles, saveHandle } from "#/utils/saved-handles";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as AriaLink } from "react-aria-components";
import { z } from "zod";

import { UserHandleAutocomplete } from "../components/user-handle-autocomplete";
import { Avatar } from "../design-system/avatar";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { Form } from "../design-system/form";
import { Separator } from "../design-system/separator";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import { breakpoints } from "../design-system/theme/media-queries.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { primary } from "../design-system/theme/semantic-color.stylex";
import {
  gap as gapSpace,
  size as sizeSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { Body } from "../design-system/typography";
import { Text } from "../design-system/typography/text";

const searchSchema = z.object({
  redirect: z.string().optional(),
  loginSuccess: z.union([z.string(), z.boolean()]).optional(),
  handle: z.string().optional(),
  avatar: z.string().optional(),
  error: z.string().optional(),
});

const styles = stylex.create({
  buttonContainer: {
    width: "100%",
  },
  main: {
    backgroundColor: primaryColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    minHeight: "100vh",
  },
  container: {
    padding: sizeSpace["4xl"],
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    height: "100%",
  },
  content: {
    padding: sizeSpace["3xl"],
    gap: gapSpace["5xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  },
  form: {
    width: {
      default: "100%",
      [breakpoints.sm]: "min(80vw, 420px)",
    },
  },
  savedHandlesContainer: {
    width: {
      default: "100%",
      [breakpoints.sm]: "min(80vw, 420px)",
    },
  },
  savedHandleButton: {
    padding: sizeSpace.xxs,
    borderRadius: radius["lg"],
    cornerShape: "squircle",
    gap: gapSpace.xl,
    textDecoration: "none",
    alignItems: "center",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    textAlign: "left",
    width: "100%",
  },
  savedHandleText: {
    flexGrow: 1,
    minWidth: 0,
  },
  savedHandleIcon: {
    color: uiColor.text1,
  },
  loginButton: {
    cursor: "pointer",
  },
  signupButton: {
    cursor: "pointer",
  },
  logoContainer: {
    paddingBottom: verticalSpace["lg"],
  },
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  server: {
    middleware: [unauthMiddleware],
  },
  loader: async ({ context, location }) => {
    const savedHandles = await context.queryClient.ensureQueryData(
      auth.getSavedHandlesQueryOptions,
    );
    return {
      savedHandles,
      redirects: await Promise.all(
        savedHandles.map((h) =>
          auth.authorize({
            data: {
              handle: h.handle,
              redirect: (location.search as Record<string, string>)["redirect"],
            },
          }),
        ),
      ),
    };
  },
  head: () => ({
    meta: pageSocialMeta("login", getPublicUrlClient()),
  }),
  component: AuthPage,
});

function AuthPage() {
  const {
    redirect: redirectTo,
    loginSuccess,
    handle: handleParam,
    avatar: avatarParam,
    error,
  } = Route.useSearch();
  const { savedHandles: initialSavedHandles, redirects } =
    Route.useLoaderData();
  const navigate = useNavigate();

  const [handle, setHandle] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [savedHandles, setSavedHandles] =
    useState<Array<SavedHandle>>(initialSavedHandles);

  useEffect(() => {
    if ((loginSuccess === "true" || loginSuccess === true) && handleParam) {
      const avatar =
        avatarParam && avatarParam.trim() !== "" ? avatarParam : null;

      saveHandle(handleParam, avatar);

      void navigate({
        to: "/login",
        search: { redirect: redirectTo },
        replace: true,
      }).then(() => {
        setSavedHandles(getSavedHandles());
      });
    }
  }, [loginSuccess, handleParam, avatarParam, navigate, redirectTo]);

  const loginMutation = useMutation({
    mutationFn: async (selectedHandle: string) => {
      await navigate({
        to: "/api/auth/atproto/authorize",
        search: {
          handle: selectedHandle,
          redirect: redirectTo,
        },
      });
    },
  });

  const handleSignup = useMutation({
    mutationFn: async () => {
      await navigate({
        to: "/api/auth/atproto/signup",
        search: {
          redirect: redirectTo,
        },
      });
    },
  });

  const [view, setView] = useState<"saved-handles" | "login">(
    savedHandles.length > 0 ? "saved-handles" : "login",
  );

  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.container)}>
        <Form style={styles.content}>
          <Flex direction="column" gap="5xl" style={styles.form}>
            <Flex
              direction="column"
              align="center"
              justify="center"
              gap="3xl"
              style={styles.logoContainer}
            >
              <Text font="title" size="3xl" weight="bold">
                Standard Reader
              </Text>
              <Body variant="secondary">
                Sign in with your Atmosphere account.
              </Body>
            </Flex>

            {error === "oauth_failed" ? (
              <Text size="sm" variant="critical">
                Sign-in failed. Try again.
              </Text>
            ) : null}

            {error === "scope" ? (
              <Text size="sm" variant="critical">
                Sign in again to refresh your permissions — your session
                doesn&apos;t include save-for-later yet.
              </Text>
            ) : null}

            {view === "saved-handles" && (
              <>
                <Flex
                  direction="column"
                  gap="md"
                  style={styles.savedHandlesContainer}
                >
                  {savedHandles.map((saved, index) => (
                    <AriaLink
                      key={saved.handle}
                      href={redirects[index]?.authorizationUrl ?? "#"}
                      {...stylex.props(
                        styles.savedHandleButton,
                        primary.bgUi,
                        primary.borderInteractive,
                        primary.text,
                      )}
                    >
                      <Avatar
                        src={saved.avatar ?? undefined}
                        alt={saved.handle}
                        fallback={saved.handle[0]?.toUpperCase() ?? "?"}
                      />
                      <Text size="base" style={styles.savedHandleText}>
                        {saved.handle}
                      </Text>
                      <ChevronRight {...stylex.props(styles.savedHandleIcon)} />
                    </AriaLink>
                  ))}
                </Flex>

                <Separator />
              </>
            )}

            {view === "login" && (
              <Flex direction="column" gap="md">
                <UserHandleAutocomplete
                  size="lg"
                  placeholder="your.handle.com"
                  aria-label="Atmosphere account"
                  value={inputValue}
                  onValueChange={(value) => {
                    setInputValue(value);
                    setHandle(value);
                  }}
                  onSelect={(selectedHandle) => {
                    const trimmed = selectedHandle.trim().replace(/^@/, "");
                    if (trimmed === "") return;
                    setInputValue(trimmed);
                    setHandle(trimmed);
                    loginMutation.mutate(trimmed);
                  }}
                />
              </Flex>
            )}

            <Flex direction="column" gap="md" style={styles.buttonContainer}>
              {view === "saved-handles" && (
                <Button
                  size="lg"
                  type="button"
                  variant="outline"
                  onPress={() => setView("login")}
                  isPending={handleSignup.isPending}
                  isDisabled={loginMutation.isPending}
                  style={styles.signupButton}
                >
                  Switch account
                </Button>
              )}
              {view === "login" && (
                <Button
                  size="lg"
                  type="button"
                  isDisabled={!handle.trim() || loginMutation.isPending}
                  isPending={loginMutation.isPending}
                  onPress={() => {
                    const trimmed = handle.trim().replace(/^@/, "");
                    if (trimmed === "") return;
                    loginMutation.mutate(trimmed);
                  }}
                  style={styles.loginButton}
                >
                  Log in
                </Button>
              )}
              <Button
                size="lg"
                type="button"
                variant="outline"
                onPress={() => handleSignup.mutate()}
                isPending={handleSignup.isPending}
                isDisabled={loginMutation.isPending}
                style={styles.signupButton}
              >
                Create account
              </Button>
            </Flex>
          </Flex>
        </Form>
      </div>
    </main>
  );
}
