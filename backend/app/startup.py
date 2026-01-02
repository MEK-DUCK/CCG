"""
Startup script to ensure admin and test users exist.
This runs automatically when the FastAPI app starts.
"""
import logging
from app.database import SessionLocal
from app.models import User, UserRole, UserStatus
from app.auth import get_password_hash

logger = logging.getLogger(__name__)

def ensure_user(email: str, password: str, full_name: str, initials: str, role: UserRole):
    """Ensure a user exists, create or update if needed."""
    db = SessionLocal()
    
    try:
        user = db.query(User).filter(User.email == email).first()
        
        if user:
            # Update password and details to ensure they're correct
            user.password_hash = get_password_hash(password)
            user.status = UserStatus.ACTIVE
            user.role = role
            # Only update initials if they don't conflict with another user
            existing_with_initials = db.query(User).filter(
                User.initials == initials,
                User.id != user.id
            ).first()
            if not existing_with_initials:
                user.initials = initials
            db.commit()
            logger.info(f"✅ User updated: {email} (Initials: {user.initials})")
        else:
            # Check if initials are available
            existing_with_initials = db.query(User).filter(User.initials == initials).first()
            if existing_with_initials:
                logger.warning(f"⚠️  Initials {initials} already taken, skipping user {email}")
                return
            
            # Create user
            user = User(
                email=email,
                password_hash=get_password_hash(password),
                full_name=full_name,
                initials=initials,
                role=role,
                status=UserStatus.ACTIVE,
                invite_token=None,
                invite_token_expires=None,
                created_by_id=None
            )
            db.add(user)
            db.commit()
            logger.info(f"✅ User created: {email} (Initials: {initials})")
        
        db.refresh(user)
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error ensuring user {email}: {e}")
        # Don't raise - allow app to start even if user creation fails
    finally:
        db.close()

def ensure_admin_user():
    """Ensure admin user exists, create if it doesn't."""
    ensure_user(
        email="admin@admin.com",
        password="admin",
        full_name="Admin User",
        initials="ADM",
        role=UserRole.ADMIN
    )

def ensure_test_users():
    """Ensure test users exist, create if they don't."""
    test_users = [
        {"email": "mek@test.com", "password": "password", "full_name": "Test User MEK", "initials": "MEK1", "role": UserRole.USER},
        {"email": "azn@test.com", "password": "password", "full_name": "Test User AZN", "initials": "AZN", "role": UserRole.USER},
        {"email": "mfo@test.com", "password": "password", "full_name": "Test User MFO", "initials": "MFO", "role": UserRole.USER},
        {"email": "na@test.com", "password": "password", "full_name": "Test User NA", "initials": "NA", "role": UserRole.USER},
    ]
    
    for user_data in test_users:
        ensure_user(**user_data)

