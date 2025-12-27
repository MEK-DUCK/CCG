"""
Authentication router for the Oil Lifting Program API.

Handles:
- User login
- Password setting (via invite token)
- Password reset request/completion
- Current user info
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app import models, schemas
from app.auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_user_by_email,
    get_user_by_invite_token,
    get_user_by_reset_token,
    generate_invite_token,
    require_auth,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT token.
    """
    user = authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    # Create access token
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "initials": user.initials}
    )
    
    return schemas.TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=schemas.UserPublic.model_validate(user)
    )


@router.post("/set-password", response_model=schemas.TokenResponse)
def set_password(request: schemas.SetPasswordRequest, db: Session = Depends(get_db)):
    """
    Set password using invite token (for new users) or reset token.
    """
    # Try invite token first
    user = get_user_by_invite_token(db, request.token)
    token_type = "invite"
    
    # If not found, try reset token
    if not user:
        user = get_user_by_reset_token(db, request.token)
        token_type = "reset"
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token"
        )
    
    # Set password and activate user
    user.password_hash = get_password_hash(request.password)
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
    
    # Create access token and log them in
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "initials": user.initials}
    )
    
    return schemas.TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=schemas.UserPublic.model_validate(user)
    )


@router.post("/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(request: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a password reset. Generates a reset token.
    
    Note: In production, this should send an email with the reset link.
    For now, the token is returned in the response for testing.
    """
    user = get_user_by_email(db, request.email)
    
    # Always return success to prevent email enumeration
    if not user:
        logger.info(f"Password reset requested for non-existent email: {request.email}")
        return schemas.MessageResponse(
            message="If an account exists with this email, a reset link has been sent."
        )
    
    if user.status == models.UserStatus.INACTIVE:
        logger.info(f"Password reset requested for inactive user: {request.email}")
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
def change_password(
    request: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Change password for authenticated user.
    """
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.password_hash = get_password_hash(request.new_password)
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

