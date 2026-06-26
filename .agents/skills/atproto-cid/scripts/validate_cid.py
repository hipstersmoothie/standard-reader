#!/usr/bin/env python3
"""Validate a DASL CID string against the strict subset.

Usage:
    validate_cid.py <cid-string> [--bdasl]

Exit codes: 0 valid, 1 invalid, 2 usage error.
Stdlib only — no pip dependencies.
"""
import base64
import sys

DAG_CBOR = 0x71
RAW = 0x55
SHA256 = 0x12
BLAKE3 = 0x1e


def validate(cid_str: str, allow_blake3: bool = False) -> tuple[bool, str]:
    if not cid_str.startswith("b"):
        return False, f"not base32lower multibase: prefix must be 'b', got {cid_str[:1]!r}"
    encoded = cid_str[1:].upper()
    pad = (-len(encoded)) % 8
    try:
        raw = base64.b32decode(encoded + "=" * pad)
    except Exception as e:
        return False, f"base32 decode failed: {e}"
    if len(raw) != 36:
        return False, f"decoded length {len(raw)} != 36"
    if raw[0] != 0x01:
        return False, f"version 0x{raw[0]:02x} != 0x01 (CIDv1 required)"
    if raw[1] not in (DAG_CBOR, RAW):
        return False, f"codec 0x{raw[1]:02x} not in {{0x71 dag-cbor, 0x55 raw}}"
    hash_code = raw[2]
    hash_ok = hash_code == SHA256 or (allow_blake3 and hash_code == BLAKE3)
    if not hash_ok:
        allowed = "0x12" + (" or 0x1e" if allow_blake3 else "")
        return False, f"hash code 0x{hash_code:02x} not allowed (expected {allowed})"
    if raw[3] != 0x20:
        return False, f"digest length 0x{raw[3]:02x} != 0x20 (32)"
    return True, f"ok: v1 codec=0x{raw[1]:02x} hash=0x{hash_code:02x} digest=32"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    unknown = flags - {"--bdasl"}
    if unknown or len(args) != 1:
        print("usage: validate_cid.py <cid-string> [--bdasl]", file=sys.stderr)
        return 2
    ok, msg = validate(args[0], allow_blake3="--bdasl" in flags)
    print(msg)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
