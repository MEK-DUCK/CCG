"""
Startup script to ensure admin user exists.
This runs automatically when the FastAPI app starts.
"""
import logging
from app.database import SessionLocal
from app.models import User, UserRole, UserStatus
from app.auth import get_password_hash

logger = logging.getLogger(__name__)

def ensure_admin_user():
    """Ensure admin user exists, create if it doesn't."""
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        admin = db.query(User).filter(User.email == "admin@admin.com").first()
        
        if admin:
            # Update password to ensure it's correct
            admin.password_hash = get_password_hash("admin")
            admin.status = UserStatus.ACTIVE
            admin.role = UserRole.ADMIN
            admin.initials = "ADM"
            db.commit()
            logger.info("✅ Admin user already exists, password updated")
        else:
            # Create admin user
            admin = User(
                email="admin@admin.com",
                password_hash=get_password_hash("admin"),
                full_name="Admin User",
                initials="ADM",
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                invite_token=None,
                invite_token_expires=None,
                created_by_id=None
            )
            db.add(admin)
            db.commit()
            logger.info("✅ Admin user created successfully")
        
        db.refresh(admin)
        logger.info(f"   Email: {admin.email}, Role: {admin.role.value}, Status: {admin.status.value}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error ensuring admin user: {e}")
        # Don't raise - allow app to start even if admin creation fails
    finally:
        db.close()

