from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os

from app.database import engine, Base, ensure_schema
from app.routers import customers, contracts, quarterly_plans, monthly_plans, cargos, audit_logs, documents
from app.routers import config_router, admin
from app.errors import AppError, handle_app_error, handle_unexpected_error

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(
    title="Oil Lifting Program API", 
    version="1.0.0",
    description="API for managing oil lifting contracts, cargos, and port operations"
)

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
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
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

app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(quarterly_plans.router, prefix="/api/quarterly-plans", tags=["quarterly-plans"])
app.include_router(monthly_plans.router, prefix="/api/monthly-plans", tags=["monthly-plans"])
app.include_router(cargos.router, prefix="/api/cargos", tags=["cargos"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["audit-logs"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(config_router.router, prefix="/api/config", tags=["config"])
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
