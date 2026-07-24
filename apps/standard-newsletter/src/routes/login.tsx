import { Alert } from "@standard-reader/design-system/alert";
import { Button } from "@standard-reader/design-system/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@standard-reader/design-system/card";
import { Flex } from "@standard-reader/design-system/flex";
import { TextField } from "@standard-reader/design-system/text-field";
import { primaryColor } from "@standard-reader/design-system/theme/color.stylex";
import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: Login,
});

const styles = stylex.create({
  page: {
    minHeight: "100dvh",
    padding: spacing["6"],
  },
  card: {
    maxWidth: spacing["96"],
    width: "100%",
  },
  cardFill: {
    width: "100%",
  },
  wordmark: {
    fontFamily: fontFamily["serif"],
    fontSize: fontSize["xl"],
    fontWeight: fontWeight["medium"],
    letterSpacing: tracking["tight"],
  },
  wordmarkAccent: {
    color: primaryColor.solid1,
  },
  title: {
    fontFamily: fontFamily["serif"],
    fontWeight: fontWeight["medium"],
    letterSpacing: tracking["tight"],
  },
});

function Login() {
  const { error, redirect } = Route.useSearch();
  return (
    <Flex
      align="center"
      justify="center"
      style={[styles.page, ui.bgSubtle, ui.text]}
    >
      {/* A plain GET form, not a client-side submit: the browser navigates to
          the authorize endpoint, which redirects on to the user's PDS. So the
          Button is a real `type="submit"` and the TextField carries `name`. */}
      <form method="get" action="/api/auth/atproto/authorize">
        {/* The wordmark sits above the card, not inside CardHeader — that
            header is a `'title action'` grid, so an extra child would be
            auto-placed into the trailing action slot. */}
        <Flex direction="column" align="center" gap="xl" style={styles.card}>
          <div {...stylex.props(styles.wordmark)}>
            Standard{" "}
            <span {...stylex.props(styles.wordmarkAccent)}>Newsletter</span>
          </div>
          <Card style={styles.cardFill}>
            <CardHeader>
              <CardTitle style={styles.title}>Sign in</CardTitle>
              <CardDescription>
                Use your AT Protocol handle to continue.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <Flex direction="column" gap="lg">
                {error ? (
                  <Alert variant="critical" title="Sign-in didn’t complete">
                    Please try again.
                  </Alert>
                ) : null}

                {/* The handle is a public identifier, not a credential — the
                  password is entered on the PDS during the redirect, never
                  here. `disablePasswordManagers` keeps 1Password and friends
                  from dressing this up as a username/password login. */}
                <TextField
                  name="handle"
                  label="Handle"
                  type="text"
                  isRequired
                  autoComplete="off"
                  disablePasswordManagers
                  placeholder="you.bsky.social"
                />
                {redirect ? (
                  <input type="hidden" name="redirect" value={redirect} />
                ) : null}

                <Button type="submit" variant="primary" size="lg">
                  Continue
                </Button>
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </form>
    </Flex>
  );
}
