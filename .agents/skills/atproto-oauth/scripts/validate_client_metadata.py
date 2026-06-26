#!/usr/bin/env python3
"""
ATProtocol OAuth Client Metadata Validator

Validates a client metadata document against ATProtocol OAuth requirements.
Can validate from a URL, file path, or stdin.

Usage:
    python validate_client_metadata.py https://example.com/oauth-client-metadata.json
    python validate_client_metadata.py ./client-metadata.json
    cat metadata.json | python validate_client_metadata.py -
"""

import json
import sys
import urllib.request
import urllib.error
from typing import Any


class ValidationError:
    def __init__(self, field: str, message: str, severity: str = "error"):
        self.field = field
        self.message = message
        self.severity = severity  # "error" or "warning"

    def __str__(self):
        return f"[{self.severity.upper()}] {self.field}: {self.message}"


def validate_client_metadata(metadata: dict[str, Any]) -> list[ValidationError]:
    """Validate ATProtocol OAuth client metadata document."""
    errors: list[ValidationError] = []

    # Required fields
    required_fields = [
        "client_id",
        "client_name", 
        "redirect_uris",
        "grant_types",
        "response_types",
        "scope",
        "dpop_bound_access_tokens",
        "token_endpoint_auth_method",
    ]

    for field in required_fields:
        if field not in metadata:
            errors.append(ValidationError(field, "Required field is missing"))

    # client_id must be a URL
    client_id = metadata.get("client_id", "")
    if client_id and not client_id.startswith("https://"):
        if not (client_id.startswith("http://localhost") or client_id.startswith("http://127.0.0.1")):
            errors.append(ValidationError("client_id", "Must be an HTTPS URL (except localhost)"))

    # dpop_bound_access_tokens must be true
    if metadata.get("dpop_bound_access_tokens") is not True:
        errors.append(ValidationError("dpop_bound_access_tokens", "Must be true for ATProtocol"))

    # grant_types validation
    grant_types = metadata.get("grant_types", [])
    if "authorization_code" not in grant_types:
        errors.append(ValidationError("grant_types", "Must include 'authorization_code'"))
    if "refresh_token" not in grant_types:
        errors.append(ValidationError("grant_types", "Should include 'refresh_token'", "warning"))

    # response_types validation
    response_types = metadata.get("response_types", [])
    if response_types != ["code"]:
        errors.append(ValidationError("response_types", "Must be ['code']"))

    # token_endpoint_auth_method validation
    auth_method = metadata.get("token_endpoint_auth_method")
    if auth_method not in ("private_key_jwt", "none"):
        errors.append(ValidationError(
            "token_endpoint_auth_method",
            "Must be 'private_key_jwt' (confidential) or 'none' (public)"
        ))

    # Confidential client specific validations
    if auth_method == "private_key_jwt":
        # Must have jwks or jwks_uri
        if "jwks" not in metadata and "jwks_uri" not in metadata:
            errors.append(ValidationError("jwks", "Required for confidential clients"))
        
        if "jwks" in metadata and "jwks_uri" in metadata:
            errors.append(ValidationError("jwks", "Cannot specify both 'jwks' and 'jwks_uri'"))

        # token_endpoint_auth_signing_alg should be ES256
        if metadata.get("token_endpoint_auth_signing_alg") != "ES256":
            errors.append(ValidationError(
                "token_endpoint_auth_signing_alg",
                "Should be 'ES256' for ATProtocol"
            ))

        # Validate jwks if present
        jwks = metadata.get("jwks", {})
        keys = jwks.get("keys", [])
        if jwks and not keys:
            errors.append(ValidationError("jwks.keys", "Must contain at least one key"))

        for i, key in enumerate(keys):
            key_errors = validate_jwk(key, f"jwks.keys[{i}]")
            errors.extend(key_errors)

    # redirect_uris validation
    redirect_uris = metadata.get("redirect_uris", [])
    if not redirect_uris:
        errors.append(ValidationError("redirect_uris", "Must contain at least one URI"))
    
    for i, uri in enumerate(redirect_uris):
        if not uri.startswith("https://"):
            if not (uri.startswith("http://localhost") or uri.startswith("http://127.0.0.1")):
                errors.append(ValidationError(
                    f"redirect_uris[{i}]",
                    f"Must be HTTPS (except localhost): {uri}"
                ))

    # scope validation
    scope = metadata.get("scope", "")
    if "atproto" not in scope:
        errors.append(ValidationError("scope", "Should include 'atproto' scope", "warning"))

    # application_type validation (optional)
    app_type = metadata.get("application_type")
    if app_type and app_type not in ("web", "native"):
        errors.append(ValidationError("application_type", "Must be 'web' or 'native'"))

    return errors


def validate_jwk(key: dict[str, Any], prefix: str) -> list[ValidationError]:
    """Validate a JWK in the jwks array."""
    errors: list[ValidationError] = []

    # Required fields for EC key
    required = ["kty", "crv", "x", "y"]
    for field in required:
        if field not in key:
            errors.append(ValidationError(f"{prefix}.{field}", "Required field missing"))

    # kty must be EC
    if key.get("kty") != "EC":
        errors.append(ValidationError(f"{prefix}.kty", "Must be 'EC' for P-256 keys"))

    # crv must be P-256
    if key.get("crv") != "P-256":
        errors.append(ValidationError(f"{prefix}.crv", "Must be 'P-256'"))

    # Should not contain private key material
    if "d" in key:
        errors.append(ValidationError(
            f"{prefix}.d",
            "SECURITY: Private key material found! Remove 'd' field from public metadata"
        ))

    # alg should be ES256
    if key.get("alg") and key.get("alg") != "ES256":
        errors.append(ValidationError(f"{prefix}.alg", "Should be 'ES256'"))

    # use should be sig
    if key.get("use") and key.get("use") != "sig":
        errors.append(ValidationError(f"{prefix}.use", "Should be 'sig'"))

    # kid should be present
    if "kid" not in key:
        errors.append(ValidationError(f"{prefix}.kid", "Should include key ID", "warning"))

    return errors


def load_metadata(source: str) -> dict[str, Any]:
    """Load metadata from URL, file, or stdin."""
    if source == "-":
        return json.load(sys.stdin)
    elif source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=10) as response:
            return json.loads(response.read().decode())
    else:
        with open(source) as f:
            return json.load(f)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    source = sys.argv[1]
    
    try:
        metadata = load_metadata(source)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Failed to fetch URL: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(f"File not found: {source}")
        sys.exit(1)

    errors = validate_client_metadata(metadata)
    
    error_count = sum(1 for e in errors if e.severity == "error")
    warning_count = sum(1 for e in errors if e.severity == "warning")

    if errors:
        print(f"\nValidation results for: {source}\n")
        for error in errors:
            print(f"  {error}")
        print(f"\n{error_count} error(s), {warning_count} warning(s)")
    else:
        print(f"✓ Client metadata is valid: {source}")

    sys.exit(1 if error_count > 0 else 0)


if __name__ == "__main__":
    main()
