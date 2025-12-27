"""
Authentication router for the Oil Lifting Program API.

Handles:
- User login (with rate limiting)
- Password setting (via invite token)
- Password reset request/completion
- Refresh token for session extension
- Current user info
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app import models, schemas
from app.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_password_hash,
    get_user_by_email,
    get_user_by_id,
    get_user_by_invite_token,
    get_user_by_reset_token,
    generate_invite_token,
    require_auth,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")  # Max 5 login attempts per minute per IP
async def login(request: Request, login_request: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT tokens.
    
    Rate limited to 5 attempts per minute to prevent brute force attacks.
    """
    user = authenticate_user(db, login_request.email, login_request.password)
    if not user:
        # Log failed attempt for security monitoring
        logger.warning(f"Failed login attempt for email: {login_request.email} from IP: {request.client.host if request.client else 'unknown'}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    # Create access token (short-lived) and refresh token (long-lived)
    token_data = {"sub": str(user.id), "email": user.email, "initials": user.initials}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    logger.info(f"User {user.email} logged in from IP: {request.client.host if request.client else 'unknown'}")
    
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # seconds
        user=schemas.UserPublic.model_validate(user)
    )


@router.post("/refresh", response_model=schemas.TokenResponse)
@limiter.limit("30/minute")  # Allow reasonable refresh rate
async def refresh_token(request: Request, refresh_request: schemas.RefreshTokenRequest, db: Session = Depends(get_db)):
    """
    Get a new access token using a refresh token.
    
    This allows extending sessions without requiring re-login.
    """
    payload = decode_refresh_token(refresh_request.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )
    
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
        )
    
    user = get_user_by_id(db, user_id)
    if not user or user.status != models.UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Create new access token
    token_data = {"sub": str(user.id), "email": user.email, "initials": user.initials}
    access_token = create_access_token(data=token_data)
    
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_request.refresh_token,  # Return same refresh token
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=schemas.UserPublic.model_validate(user)
    )


@router.post("/set-password", response_model=schemas.TokenResponse)
@limiter.limit("3/minute")  # Limit password set attempts
async def set_password(request: Request, set_pwd_request: schemas.SetPasswordRequest, db: Session = Depends(get_db)):
    """
    Set password using invite token (for new users) or reset token.
    """
    # Try invite token first
    user = get_user_by_invite_token(db, set_pwd_request.token)
    token_type = "invite"
    
    # If not found, try reset token
    if not user:
        user = get_user_by_reset_token(db, set_pwd_request.token)
        token_type = "reset"
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token"
        )
    
    # Set password and activate user
    user.password_hash = get_password_hash(set_pwd_request.password)
    user.status = models.UserStatus.ACTIVE
    user.last_login = datetime.now(timezone.utc)
    
    # Clear tokens
    if token_type == "invite":
        user.invite_token = None
        user.invite_token_expires = None
    else:
        user.password_reset_token = None
        user.password_reset_expires = None
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"User {user.email} set password via {token_type} token")
    
    # Create tokens and log them in
    token_data = {"sub": str(user.id), "email": user.email, "initials": user.initials}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=schemas.UserPublic.model_validate(user)
    )


@router.post("/forgot-password", response_model=schemas.MessageResponse)
@limiter.limit("3/minute")  # Prevent email enumeration via timing
async def forgot_password(request: Request, forgot_request: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a password reset. Generates a reset token.
    
    Note: In production, this should send an email with the reset link.
    For now, the token is returned in the response for testing.
    """
    user = get_user_by_email(db, forgot_request.email)
    
    # Always return success to prevent email enumeration
    if not user:
        logger.info(f"Password reset requested for non-existent email: {forgot_request.email}")
        return schemas.MessageResponse(
            message="If an account exists with this email, a reset link has been sent."
        )
    
    if user.status == models.UserStatus.INACTIVE:
        logger.info(f"Password reset requested for inactive user: {forgot_request.email}")
        return schemas.MessageResponse(
            message="If an account exists with this email, a reset link has been sent."
        )
    
    # Generate reset token
    reset_token = generate_invite_token()
    user.password_reset_token = reset_token
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    
    db.commit()
    
    logger.info(f"Password reset token generated for user: {user.email}")
    
    # TODO: In production, send email with reset link instead of returning token
    # For development/testing, we return the token
    return schemas.MessageResponse(
        message="If an account exists with this email, a reset link has been sent.",
        # Include token for development - remove in production!
        # reset_token=reset_token
    )


@router.get("/verify-token")
def verify_token(token: str, db: Session = Depends(get_db)):
    """
    Verify if an invite or reset token is valid.
    """
    # Try invite token
    user = get_user_by_invite_token(db, token)
    if user:
        return {
            "valid": True,
            "type": "invite",
            "email": user.email,
            "full_name": user.full_name
        }
    
    # Try reset token
    user = get_user_by_reset_token(db, token)
    if user:
        return {
            "valid": True,
            "type": "reset",
            "email": user.email,
            "full_name": user.full_name
        }
    
    return {"valid": False}


@router.get("/me", response_model=schemas.UserPublic)
def get_current_user_info(current_user: models.User = Depends(require_auth)):
    """
    Get current authenticated user info.
    """
    return current_user


@router.post("/change-password", response_model=schemas.MessageResponse)
@limiter.limit("3/minute")  # Prevent brute force on current password
async def change_password(
    request: Request,
    change_request: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Change password for authenticated user.
    """
    if not verify_password(change_request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.password_hash = get_password_hash(change_request.new_password)
    db.commit()
    
    logger.info(f"User {current_user.email} changed password")
    
    return schemas.MessageResponse(message="Password changed successfully")


@router.post("/logout", response_model=schemas.MessageResponse)
def logout(current_user: models.User = Depends(require_auth)):
    """
    Logout endpoint. 
    
    Note: With JWT, logout is handled client-side by removing the token.
    This endpoint exists for logging and potential token blacklisting.
    """
    logger.info(f"User {current_user.email} logged out")
    return schemas.MessageResponse(message="Logged out successfully")
