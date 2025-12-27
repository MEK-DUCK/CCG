"""
Security utilities for the Oil Lifting Program API.

This module provides security-related functionality including:
- CSRF token generation and validation
- Security headers middleware
- Input validation utilities

SECURITY NOTES:
===============

JWT Storage (Current: localStorage)
-----------------------------------
The current implementation stores JWT tokens in localStorage, which has these tradeoffs:

PROS:
- Simple implementation
- Works well with SPAs
- Survives page refreshes

CONS:
- Vulnerable to XSS attacks (if attacker can run JS, they can steal the token)

MITIGATIONS IN PLACE:
- Short access token expiration (15 minutes)
- Refresh tokens for session extension
- CSP headers to prevent XSS
- Input sanitization

FUTURE IMPROVEMENT:
If XSS becomes a concern, migrate to httpOnly cookies:
1. Backend sets httpOnly cookie on login
2. Frontend sends credentials: 'include' with requests
3. Add CSRF protection (double-submit cookie pattern)
4. Update CORS to handle credentials properly
"""

import secrets
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request, HTTPException
import logging

logger = logging.getLogger(__name__)

# CSRF token settings
CSRF_TOKEN_LENGTH = 32
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "csrf_token"


def generate_csrf_token() -> str:
    """Generate a secure CSRF token."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)


def validate_csrf_token(request_token: str, cookie_token: str) -> bool:
    """
    Validate CSRF token using constant-time comparison.
    
    Uses the double-submit cookie pattern:
    - Cookie contains the token (set by server, httpOnly=False so JS can read)
    - Request header contains the same token
    - Attacker can't read the cookie from another domain due to SOP
    """
    if not request_token or not cookie_token:
        return False
    return hmac.compare_digest(request_token, cookie_token)


async def csrf_protect(request: Request) -> None:
    """
    CSRF protection middleware/dependency.
    
    Validates that the CSRF token in the request header matches the cookie.
    Only applies to state-changing methods (POST, PUT, DELETE, PATCH).
    
    Usage:
        @router.post("/endpoint")
        async def endpoint(request: Request, _: None = Depends(csrf_protect)):
            ...
    """
    # Skip for safe methods
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    
    # Get token from header
    header_token = request.headers.get(CSRF_HEADER_NAME)
    
    # Get token from cookie
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    
    if not validate_csrf_token(header_token, cookie_token):
        logger.warning(f"CSRF validation failed for {request.method} {request.url.path}")
        raise HTTPException(
            status_code=403,
            detail="CSRF token validation failed"
        )


def sanitize_string(value: str, max_length: int = 10000) -> str:
    """
    Basic string sanitization.
    
    - Truncates to max_length
    - Strips leading/trailing whitespace
    - Removes null bytes
    """
    if not value:
        return value
    
    # Remove null bytes (can cause issues in some systems)
    value = value.replace('\x00', '')
    
    # Truncate to max length
    if len(value) > max_length:
        value = value[:max_length]
    
    # Strip whitespace
    return value.strip()


def validate_string_length(value: str, field_name: str, max_length: int) -> None:
    """
    Validate string length and raise HTTPException if too long.
    """
    if value and len(value) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} exceeds maximum length of {max_length} characters"
        )


# Common field length limits
MAX_VESSEL_NAME_LENGTH = 255
MAX_NOTES_LENGTH = 10000
MAX_CARGO_ID_LENGTH = 100
MAX_PRODUCT_NAME_LENGTH = 255
MAX_PORT_CODE_LENGTH = 50

