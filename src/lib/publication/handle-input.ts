import { isDid } from "@atcute/lexicons/syntax";

const DOMAIN_HANDLE =
  /^@?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** True when input should resolve via handle/DID rather than directory text search. */
export function isHandleLikeInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  if (isDid(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("@")) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  if (/(?:https?:\/\/)?greengale\.app\//i.test(trimmed)) {
    return true;
  }
  return DOMAIN_HANDLE.test(trimmed);
}
