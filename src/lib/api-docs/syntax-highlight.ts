export type JsonTokenType = "key" | "str" | "num" | "bool" | "null" | "plain";

export type JsonToken = {
  type: JsonTokenType;
  text: string;
};

export type CurlTokenType = "flag" | "url" | "plain";

export type CurlToken = {
  type: CurlTokenType;
  text: string;
};

const JSON_TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

export function tokenizeJson(source: string): Array<JsonToken> {
  const tokens: Array<JsonToken> = [];
  let last = 0;

  for (const match of source.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ type: "plain", text: source.slice(last, index) });
    }

    const text = match[0];
    let type: JsonTokenType = "num";
    if (text[0] === '"') {
      type = /:\s*$/.test(text) ? "key" : "str";
    } else if (text === "true" || text === "false") {
      type = "bool";
    } else if (text === "null") {
      type = "null";
    }

    tokens.push({ type, text });
    last = index + text.length;
  }

  if (last < source.length) {
    tokens.push({ type: "plain", text: source.slice(last) });
  }

  return tokens;
}

function pushCurlToken(
  tokens: Array<CurlToken>,
  type: CurlTokenType,
  text: string,
) {
  if (text.length === 0) return;
  const prev = tokens.at(-1);
  if (type === "plain" && prev?.type === "plain") {
    prev.text += text;
    return;
  }
  tokens.push({ type, text });
}

export function tokenizeCurl(curl: string): Array<CurlToken> {
  const tokens: Array<CurlToken> = [];

  if (!curl.startsWith("curl -sS")) {
    return [{ type: "plain", text: curl }];
  }

  pushCurlToken(tokens, "flag", "curl -sS");
  let rest = curl.slice("curl -sS".length);

  if (rest.startsWith(" -X POST")) {
    pushCurlToken(tokens, "flag", " -X POST");
    rest = rest.slice(" -X POST".length);
  }

  if (rest.startsWith(" '")) {
    pushCurlToken(tokens, "plain", " '");
    rest = rest.slice(2);
    const end = rest.indexOf("'");
    if (end === -1) {
      pushCurlToken(tokens, "plain", rest);
      return tokens;
    }
    pushCurlToken(tokens, "url", rest.slice(0, end));
    pushCurlToken(tokens, "plain", "'");
    rest = rest.slice(end + 1);
  }

  if (rest.startsWith(" -H 'Content-Type: application/json'")) {
    pushCurlToken(tokens, "flag", " -H 'Content-Type: application/json'");
    rest = rest.slice(" -H 'Content-Type: application/json'".length);
  }

  pushCurlToken(tokens, "plain", rest);
  return tokens;
}
