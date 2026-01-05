from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
import logging
import os
import time
from collections import defaultdict
from threading import Lock

from app.database import engine, Base, ensure_schema
from app.routers import customers, contracts, quarterly_plans, monthly_plans, cargos, audit_logs, documents
from app.routers import config_router, admin, products, load_ports, inspectors, discharge_ports
from app.routers import auth_router, users, presence_router, version_history_router
from app.errors import AppError, handle_app_error, handle_unexpected_error
from app.rate_limiter import limiter, rate_limit_exceeded_handler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)
ensure_schema()

# Ensure admin and test users exist on startup
from app.startup import ensure_admin_user, ensure_test_users
ensure_admin_user()
ensure_test_users()

app = FastAPI(
    title="Oil Lifting Program API", 
    version="1.0.0",
    description="API for managing oil lifting contracts, cargos, and port operations"
)

# Add slowapi rate limiter state
app.state.limiter = limiter

# Register rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# =============================================================================
# CORS Configuration
# =============================================================================
# Explicitly list allowed origins (Safari needs exact matches)
# In production, this should be loaded from environment variables
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://0.0.0.0:5173",
    "http://192.168.0.5:5173",  # Local network IP for Safari testing
]

# Filter out empty strings
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    # TEMPORARY: Allow all origins for testing - REMOVE AFTER TESTING
    allow_origins=["*"],
    allow_credentials=False,  # Required when using ["*"] - TEMPORARY
    # Restrict to specific methods instead of "*"
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    # Restrict to specific headers instead of "*"
    allow_headers=[
        "Content-Type",
        "Authorization",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["Content-Disposition"],  # For file downloads
)

# =============================================================================
# Rate Limiting (simple in-memory implementation)
# =============================================================================
# In production, use Redis-based rate limiting for distributed systems
# High limit to handle React Strict Mode double renders, parallel API calls,
# and heavy pages like HomePage/Port Movement with many cargos
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "2000"))  # requests per window
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # window in seconds

class RateLimiter:
    """Simple in-memory rate limiter using sliding window."""
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = Lock()
    
    def is_allowed(self, client_id: str) -> bool:
        """Check if request is allowed for this client."""
        now = time.time()
        with self.lock:
            # Remove old requests outside the window
            self.requests[client_id] = [
                req_time for req_time in self.requests[client_id]
                if now - req_time < self.window_seconds
            ]
            
            # Check if under limit
            if len(self.requests[client_id]) < self.max_requests:
                self.requests[client_id].append(now)
                return True
            return False
    
    def get_remaining(self, client_id: str) -> int:
        """Get remaining requests for this client."""
        now = time.time()
        with self.lock:
            valid_requests = [
                req_time for req_time in self.requests[client_id]
                if now - req_time < self.window_seconds
            ]
            return max(0, self.max_requests - len(valid_requests))

rate_limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Rate limit requests per client IP."""
    # Skip rate limiting for health checks
    if request.url.path in ["/", "/api/health"]:
        return await call_next(request)
    
    # Get client identifier (IP address)
    client_ip = request.client.host if request.client else "unknown"
    
    if not rate_limiter.is_allowed(client_ip):
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many requests. Please slow down.",
                "retry_after": RATE_LIMIT_WINDOW
            },
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)}
        )
    
    response = await call_next(request)
    
    # Add rate limit headers
    remaining = rate_limiter.get_remaining(client_ip)
    response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Window"] = str(RATE_LIMIT_WINDOW)
    
    return response

# =============================================================================
# Middleware to extract user initials from JWT token (not client header!)
# =============================================================================
from app.audit_utils import set_current_user_initials
from app.auth import decode_token

@app.middleware("http")
async def extract_user_initials(request: Request, call_next):
    """
    Extract user info from JWT token for audit logging and real-time sync.
    
    SECURITY: We extract info from the validated JWT token, NOT from
    a client-provided header. This prevents clients from spoofing identity.
    """
    user_initials = None
    user_id = None
    
    # Get Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        payload = decode_token(token)
        if payload:
            # Extract info from the validated JWT payload
            user_initials = payload.get("initials")
            user_id = payload.get("sub")  # User ID is stored in 'sub' claim
            if user_id:
                try:
                    user_id = int(user_id)
                except (ValueError, TypeError):
                    user_id = None
    
    # Set for audit logging
    set_current_user_initials(user_initials)
    
    # Set on request.state for real-time broadcast
    request.state.user_id = user_id
    request.state.user_initials = user_initials
    
    response = await call_next(request)
    return response

# =============================================================================
# Exception Handlers
# =============================================================================

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """Handle application-specific errors with structured responses."""
    return handle_app_error(request, exc)


from pydantic import ValidationError as PydanticValidationError
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors with full details for debugging."""
    logger.error(f"Validation error for {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler for unexpected errors.
    Logs the full error but returns a safe message to the client.
    """
    # Don't catch HTTPExceptions - let FastAPI handle those
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        raise exc
    return handle_unexpected_error(request, exc)


# =============================================================================
# Routers
# =============================================================================

# Auth routes (no /api prefix for cleaner URLs)
app.include_router(auth_router.router, prefix="/api")
app.include_router(users.router, prefix="/api")

# WebSocket routes for real-time presence
app.include_router(presence_router.router, prefix="/api", tags=["presence"])

# Business routes
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(quarterly_plans.router, prefix="/api/quarterly-plans", tags=["quarterly-plans"])
app.include_router(monthly_plans.router, prefix="/api/monthly-plans", tags=["monthly-plans"])
app.include_router(cargos.router, prefix="/api/cargos", tags=["cargos"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["audit-logs"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(config_router.router, prefix="/api/config", tags=["config"])
app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(load_ports.router, prefix="/api/load-ports", tags=["load-ports"])
app.include_router(inspectors.router, prefix="/api/inspectors", tags=["inspectors"])
app.include_router(discharge_ports.router, prefix="/api/discharge-ports", tags=["discharge-ports"])
app.include_router(version_history_router.router, prefix="/api", tags=["version-history"])
app.include_router(admin.router)


# =============================================================================
# Health Check Endpoints
# =============================================================================

@app.get("/")
def read_root():
    return {"message": "Oil Lifting Program API", "version": "1.0.0"}


@app.get("/api/health")
def health_check():
    """
    Health check endpoint for monitoring.
    Returns database connection status.
    """
    from sqlalchemy import text
    from app.database import SessionLocal
    
    db_status = "unknown"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
        logger.error(f"Health check failed: {e}")
    
    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
        "version": "1.0.0"
    }
