"""
Authentication middleware for the Oil Lifting Program API.

This provides a simple API key-based authentication that can be extended
to JWT or OAuth2 in production.

To enable authentication:
1. Set API_KEY environment variable
2. Include X-API-Key header in requests

If API_KEY is not set, authentication is disabled (development mode).
"""
from fastapi import HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
import os
import logging

logger = logging.getLogger(__name__)

# API key from environment variable
API_KEY = os.getenv("API_KEY")
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(API_KEY_HEADER)) -> bool:
    """
    Verify the API key from request header.
    
    If API_KEY environment variable is not set, authentication is disabled.
    This allows development without auth while requiring it in production.
    """
    # If no API key configured, allow all requests (development mode)
    if not API_KEY:
        return True
    
    # If API key is configured, verify it
    if not api_key:
        logger.warning("Request without API key rejected")
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Include X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    if api_key != API_KEY:
        logger.warning("Request with invalid API key rejected")
        raise HTTPException(
            status_code=403,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    return True


def get_optional_auth():
    """
    Returns the auth dependency if API_KEY is set, otherwise returns a no-op.
    Use this for endpoints that should only require auth in production.
    """
    if API_KEY:
        return Depends(verify_api_key)
    return None


# For endpoints that always require authentication (even in dev)
RequireAuth = Depends(verify_api_key)

# For endpoints that only require auth when API_KEY is configured
OptionalAuth = get_optional_auth()

