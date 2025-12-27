"""
JWT Authentication for the Oil Lifting Program API.

Provides secure token-based authentication with:
- Password hashing using bcrypt
- JWT tokens for session management
- User dependency injection for protected routes
"""
import os
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app import models

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Secret key for JWT - MUST be set via environment variable
# In development, set JWT_SECRET_KEY in your .env file
# In production, set it as a secure environment variable
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    # For development convenience, generate a stable key based on a seed
    # This allows tokens to persist across restarts in dev, but is NOT secure for production
    import hashlib
    DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
    if DEV_MODE:
        # In dev mode, use a deterministic key (not secure, but convenient)
        SECRET_KEY = hashlib.sha256(b"oil-lifting-dev-key-DO-NOT-USE-IN-PRODUCTION").hexdigest()
        logger.warning("⚠️  Using development JWT secret key. Set JWT_SECRET_KEY for production!")
    else:
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY environment variable not set. "
            "Set JWT_SECRET_KEY to a secure random string (at least 32 characters). "
            "For development, you can set DEV_MODE=true to use an insecure default key."
        )

ALGORITHM = "HS256"
# Access token expiration - 15 minutes for security (use refresh tokens for longer sessions)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
# Refresh token expiration - 7 days
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# Bearer token security
security = HTTPBearer(auto_error=False)


# =============================================================================
# PASSWORD UTILITIES
# =============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using bcrypt directly."""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def get_password_hash(password: str) -> str:
    """Hash a password for storage using bcrypt directly."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


# =============================================================================
# TOKEN UTILITIES
# =============================================================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token (short-lived, for API requests)."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token (long-lived, for getting new access tokens)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode and validate a refresh token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            logger.warning("Token is not a refresh token")
            return None
        return payload
    except JWTError as e:
        logger.warning(f"Refresh token decode error: {e}")
        return None


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        return None


def generate_invite_token() -> str:
    """Generate a secure random token for invites/password resets."""
    return secrets.token_urlsafe(32)


# =============================================================================
# USER AUTHENTICATION
# =============================================================================

def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    """Authenticate a user by email and password."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return None
    if not user.password_hash:
        return None  # User hasn't set password yet
    if user.status != models.UserStatus.ACTIVE:
        return None  # User is not active
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """Get a user by email."""
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    """Get a user by ID."""
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_invite_token(db: Session, token: str) -> Optional[models.User]:
    """Get a user by invite token (if not expired)."""
    user = db.query(models.User).filter(models.User.invite_token == token).first()
    if user and user.invite_token_expires:
        if user.invite_token_expires < datetime.now(timezone.utc):
            return None  # Token expired
    return user


def get_user_by_reset_token(db: Session, token: str) -> Optional[models.User]:
    """Get a user by password reset token (if not expired)."""
    user = db.query(models.User).filter(models.User.password_reset_token == token).first()
    if user and user.password_reset_expires:
        if user.password_reset_expires < datetime.now(timezone.utc):
            return None  # Token expired
    return user


# =============================================================================
# DEPENDENCY INJECTION
# =============================================================================

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[models.User]:
    """
    Get the current authenticated user from JWT token.
    Returns None if no valid token is provided.
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    
    user = get_user_by_id(db, user_id)
    if not user or user.status != models.UserStatus.ACTIVE:
        return None
    
    return user


async def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    """
    Require authentication - raises 401 if not authenticated.
    Use this dependency for protected routes.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.status != models.UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is not active",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def require_admin(
    current_user: models.User = Depends(require_auth)
) -> models.User:
    """
    Require admin role - raises 403 if not admin.
    Use this dependency for admin-only routes.
    """
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# =============================================================================
# OPTIONAL AUTH (for backward compatibility during migration)
# =============================================================================

async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[models.User]:
    """
    Get user if authenticated, otherwise return None.
    Use this for routes that work with or without auth.
    """
    return await get_current_user(credentials, db)
