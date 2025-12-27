"""
Rate limiting configuration for the Oil Lifting Program API.

Uses slowapi to prevent brute force attacks and API abuse.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """
    Get client IP address, handling proxies.
    
    Checks X-Forwarded-For header first (for reverse proxy setups),
    then falls back to direct client IP.
    """
    # Check for forwarded header (common in production with reverse proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs; first is the client
        return forwarded.split(",")[0].strip()
    
    # Fall back to direct client IP
    if request.client:
        return request.client.host
    
    return "unknown"


# Create limiter instance with IP-based key function
limiter = Limiter(key_func=get_client_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom handler for rate limit exceeded errors.
    
    Returns a user-friendly error message with retry information.
    """
    logger.warning(f"Rate limit exceeded for IP: {get_client_ip(request)} on {request.url.path}")
    
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please wait before trying again.",
            "retry_after": exc.detail  # Contains the retry-after time
        }
    )

