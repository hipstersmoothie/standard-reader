import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { DirectionalIcon } from "@standard-reader/design-system/directional-icon";
import { Flex } from "@standard-reader/design-system/flex";
import { Form } from "@standard-reader/design-system/form";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Link } from "@standard-reader/design-system/link";
import { Separator } from "@standard-reader/design-system/separator";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { primary } from "@standard-reader/design-system/theme/semantic-color.stylex";
import {
  gap as gapSpace,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { Body } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as AriaLink } from "react-aria-components";
import { z } from "zod";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { unauthMiddleware } from "#/middleware/auth";
import type { SavedHandle } from "#/utils/saved-handles";
import { getSavedHandles, saveHandle } from "#/utils/saved-handles";

import { SiteLegalLinks } from "../components/site-legal-links";
import { UserHandleAutocomplete } from "../components/user-handle-autocomplete";

const searchSchema = z.object({
  redirect: z.string().optional(),
  intent: z.enum(["subscribe"]).optional(),
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
    textAlign: "start",
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
  backButton: {
    position: "absolute",
    insetInlineStart: horizontalSpace["3xl"],
    top: verticalSpace["3xl"],
  },
  legalLinks: {
    paddingBottom: verticalSpace["4xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
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
              intent: (location.search as Record<string, string>)["intent"] as
                | "subscribe"
                | undefined,
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
  const { t } = useLingui();
  const {
    redirect: redirectTo,
    intent,
    loginSuccess,
    handle: handleParam,
    avatar: avatarParam,
    error,
  } = Route.useSearch();
  const { savedHandles: initialSavedHandles, redirects } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

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
        search: { redirect: redirectTo, intent },
        replace: true,
      }).then(() => {
        setSavedHandles(getSavedHandles());
      });
    }
  }, [loginSuccess, handleParam, avatarParam, navigate, redirectTo, intent]);

  const loginMutation = useMutation({
    mutationFn: async (selectedHandle: string) => {
      await navigate({
        to: "/api/auth/atproto/authorize",
        search: {
          handle: selectedHandle,
          redirect: redirectTo,
          intent,
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

  const handleBack = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }

    void navigate({ to: "/" });
  };

  return (
    <main {...stylex.props(styles.main)}>
      <IconButton
        variant="secondary"
        size="md"
        label={t`Back`}
        onPress={handleBack}
        style={styles.backButton}
      >
        <DirectionalIcon as={ArrowLeft} size={18} />
      </IconButton>
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
                {intent === "subscribe" ? (
                  <Trans>
                    Sign in with Bluesky to subscribe. We only ask permission to
                    add this follow to your account.
                  </Trans>
                ) : (
                  <Trans>Sign in with your Atmosphere account.</Trans>
                )}
              </Body>
            </Flex>

            {error === "oauth_failed" ? (
              <Text size="sm" variant="critical">
                <Trans>Sign-in failed. Try again.</Trans>
              </Text>
            ) : null}

            {error === "scope" ? (
              <Text size="sm" variant="critical">
                <Trans>
                  Sign in again to refresh your permissions — your session
                  doesn&apos;t include save-for-later yet.
                </Trans>
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
                      <DirectionalIcon
                        as={ChevronRight}
                        style={styles.savedHandleIcon}
                      />
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
                  placeholder={t`your.handle.com`}
                  aria-label={t`Atmosphere account`}
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
                  <Trans>Switch account</Trans>
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
                  <Trans>Log in</Trans>
                </Button>
              )}
              <AlertDialog
                trigger={
                  <Button
                    size="lg"
                    type="button"
                    variant="outline"
                    isPending={handleSignup.isPending}
                    isDisabled={loginMutation.isPending}
                    style={styles.signupButton}
                  >
                    <Trans>Create account</Trans>
                  </Button>
                }
              >
                <AlertDialogHeader>
                  <Trans>Are you sure?</Trans>
                </AlertDialogHeader>
                <AlertDialogDescription>
                  <Trans>
                    You can use any Atmosphere account, including accounts from
                    Bluesky, Tangled, Semble, and all the{" "}
                    <Link
                      href="https://atstore.fyi"
                      target="_blank"
                      rel="noreferrer"
                    >
                      other apps.
                    </Link>
                  </Trans>
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancelButton>
                    <Trans>Cancel</Trans>
                  </AlertDialogCancelButton>
                  <AlertDialogActionButton
                    isPending={handleSignup.isPending}
                    onPress={() => handleSignup.mutate()}
                  >
                    <Trans>Continue</Trans>
                  </AlertDialogActionButton>
                </AlertDialogFooter>
              </AlertDialog>
            </Flex>
          </Flex>
        </Form>
      </div>
      <SiteLegalLinks style={styles.legalLinks} />
    </main>
  );
}
