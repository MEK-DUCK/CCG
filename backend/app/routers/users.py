"""
User management router for the Oil Lifting Program API.

Admin-only endpoints for:
- Creating new users (with invite)
- Listing users
- Updating user details
- Deactivating/reactivating users
- Resending invites
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging

from app.database import get_db
from app import models, schemas
from app.auth import (
    require_admin,
    require_auth,
    generate_invite_token,
    get_password_hash,
)
from app.general_audit_utils import log_general_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["User Management"])

# Invite token validity period
INVITE_TOKEN_EXPIRE_DAYS = 7


@router.get("/", response_model=List[schemas.User])
def list_users(
    status: Optional[models.UserStatus] = Query(None, description="Filter by status"),
    role: Optional[models.UserRole] = Query(None, description="Filter by role"),
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    List all users (admin only).
    """
    query = db.query(models.User)
    
    if status:
        query = query.filter(models.User.status == status)
    if role:
        query = query.filter(models.User.role == role)
    
    users = query.order_by(models.User.created_at.desc()).all()
    return users


@router.get("/initials", response_model=List[str])
def list_user_initials(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    List all user initials (for dropdowns, audit display, etc).
    Available to all authenticated users.
    """
    users = db.query(models.User.initials).filter(
        models.User.status == models.UserStatus.ACTIVE
    ).all()
    return [u.initials for u in users]


@router.post("/", response_model=schemas.User)
def create_user(
    user_data: schemas.UserCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user (admin only).
    
    The user will receive an invite token to set their password.
    """
    # Check if email already exists
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    # Check if initials already exist
    existing_initials = db.query(models.User).filter(
        models.User.initials == user_data.initials.upper()
    ).first()
    if existing_initials:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with these initials already exists"
        )
    
    # Generate invite token
    invite_token = generate_invite_token()
    invite_expires = datetime.now(timezone.utc) + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS)
    
    # Create user
    user = models.User(
        email=user_data.email,
        full_name=user_data.full_name,
        initials=user_data.initials.upper(),  # Always uppercase
        role=user_data.role,
        status=models.UserStatus.PENDING,
        invite_token=invite_token,
        invite_token_expires=invite_expires,
        created_by_id=current_user.id
    )
    
    try:
        db.add(user)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='USER',
            action='CREATE',
            entity_id=user.id,
            entity_name=f"{user.full_name} ({user.initials})",
            description=f"Created user: {user.full_name} ({user.email}) by {current_user.email}"
        )
        
        db.commit()
        db.refresh(user)
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create user. Email or initials may already be in use."
        )
    
    logger.info(f"User {user.email} created by {current_user.email}")
    
    # TODO: Send invite email with link containing invite_token
    # For now, the token is available via the get endpoint
    
    return user


@router.get("/{user_id}", response_model=schemas.User)
def get_user(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get a specific user by ID (admin only).
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.put("/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    user_data: schemas.UserUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update a user (admin only).
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check for duplicate email
    if user_data.email and user_data.email != user.email:
        existing = db.query(models.User).filter(
            models.User.email == user_data.email,
            models.User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists"
            )
    
    # Check for duplicate initials
    if user_data.initials and user_data.initials.upper() != user.initials:
        existing = db.query(models.User).filter(
            models.User.initials == user_data.initials.upper(),
            models.User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with these initials already exists"
            )
    
    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "initials" and value:
            value = value.upper()
        old_value = getattr(user, field, None)
        if old_value != value:
            log_general_action(
                db=db,
                entity_type='USER',
                action='UPDATE',
                entity_id=user.id,
                entity_name=f"{user.full_name} ({user.initials})",
                field_name=field,
                old_value=old_value,
                new_value=value
            )
        setattr(user, field, value)
    
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Error updating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update user"
        )
    
    logger.info(f"User {user.email} updated by {current_user.email}")
    
    return user


@router.post("/{user_id}/deactivate", response_model=schemas.User)
def deactivate_user(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Deactivate a user (admin only).
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    old_status = user.status
    user.status = models.UserStatus.INACTIVE
    
    # Audit log
    log_general_action(
        db=db,
        entity_type='USER',
        action='UPDATE',
        entity_id=user.id,
        entity_name=f"{user.full_name} ({user.initials})",
        field_name='status',
        old_value=old_status.value if old_status else None,
        new_value='INACTIVE',
        description=f"Deactivated user: {user.full_name} ({user.email}) by {current_user.email}"
    )
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"User {user.email} deactivated by {current_user.email}")
    
    return user


@router.post("/{user_id}/activate", response_model=schemas.User)
def activate_user(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Reactivate a user (admin only).
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    old_status = user.status
    
    # If user never set password, keep as pending
    if user.password_hash:
        user.status = models.UserStatus.ACTIVE
    else:
        user.status = models.UserStatus.PENDING
    
    # Audit log
    log_general_action(
        db=db,
        entity_type='USER',
        action='UPDATE',
        entity_id=user.id,
        entity_name=f"{user.full_name} ({user.initials})",
        field_name='status',
        old_value=old_status.value if old_status else None,
        new_value=user.status.value,
        description=f"Activated user: {user.full_name} ({user.email}) by {current_user.email}"
    )
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"User {user.email} activated by {current_user.email}")
    
    return user


@router.post("/{user_id}/resend-invite", response_model=schemas.MessageResponse)
def resend_invite(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Resend invite to a pending user (admin only).
    Generates a new invite token.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.status != models.UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only resend invite to pending users"
        )
    
    # Generate new invite token
    user.invite_token = generate_invite_token()
    user.invite_token_expires = datetime.now(timezone.utc) + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS)
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"Invite resent for user {user.email} by {current_user.email}")
    
    # TODO: Send invite email
    
    return schemas.MessageResponse(
        message=f"Invite resent to {user.email}"
    )


@router.get("/{user_id}/invite-token")
def get_invite_token(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get the invite token for a pending user (admin only).
    
    This is for development/testing. In production, tokens should
    only be sent via email.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.invite_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no pending invite"
        )
    
    return {
        "user_id": user.id,
        "email": user.email,
        "invite_token": user.invite_token,
        "expires": user.invite_token_expires.isoformat() if user.invite_token_expires else None,
        "set_password_url": f"/set-password?token={user.invite_token}"
    }


@router.delete("/{user_id}", response_model=schemas.MessageResponse)
def delete_user(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a user (admin only).
    
    Note: This permanently deletes the user. Consider using deactivate instead.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    email = user.email
    full_name = user.full_name
    initials = user.initials
    user_id_to_delete = user.id
    
    # Audit log
    log_general_action(
        db=db,
        entity_type='USER',
        action='DELETE',
        entity_id=user_id_to_delete,
        entity_name=f"{full_name} ({initials})",
        description=f"Deleted user: {full_name} ({email}) by {current_user.email}",
        entity_snapshot={
            'id': user_id_to_delete,
            'email': email,
            'full_name': full_name,
            'initials': initials,
            'role': user.role.value if user.role else None,
            'status': user.status.value if user.status else None
        }
    )
    
    db.delete(user)
    db.commit()
    
    logger.info(f"User {email} deleted by {current_user.email}")
    
    return schemas.MessageResponse(message=f"User {email} deleted")

