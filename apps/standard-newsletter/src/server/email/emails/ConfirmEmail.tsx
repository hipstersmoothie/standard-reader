import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface ConfirmEmailProps {
  publicationName: string;
  confirmUrl: string;
}

const main = { backgroundColor: "#faf9f7", fontFamily: "Georgia, serif" };
const container = { maxWidth: "480px", margin: "0 auto", padding: "32px 24px" };
const button = {
  backgroundColor: "#ad7f58",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "12px 20px",
  fontSize: "15px",
  textDecoration: "none",
  display: "inline-block",
};

export function ConfirmEmail({
  publicationName,
  confirmUrl,
}: ConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your subscription to {publicationName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ fontSize: "22px", margin: "0 0 12px" }}>
            Confirm your subscription
          </Heading>
          <Text
            style={{ fontSize: "15px", lineHeight: "1.6", color: "#3e332e" }}
          >
            Tap below to start receiving {publicationName} by email. If you
            didn’t request this, you can ignore this message.
          </Text>
          <Button href={confirmUrl} style={button}>
            Confirm subscription
          </Button>
          <Text
            style={{ fontSize: "12px", color: "#8a817c", marginTop: "24px" }}
          >
            Or paste this link into your browser: {confirmUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ConfirmEmail;
