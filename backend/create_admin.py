"""
Script to create an admin user directly in the database.
This bypasses the normal invite flow for initial setup.
"""
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import User, UserRole, UserStatus
from app.auth import get_password_hash

def create_admin_user():
    """Create an admin user with the specified credentials."""
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        existing = db.query(User).filter(User.email == "admin@admin.com").first()
        if existing:
            print(f"❌ Admin user already exists with email: admin@admin.com")
            print(f"   User ID: {existing.id}")
            print(f"   Status: {existing.status.value}")
            print(f"   Role: {existing.role.value}")
            return
        
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
            created_by_id=None  # Self-created for initial admin
        )
        
        db.add(admin)
        db.commit()
        db.refresh(admin)
        
        print("✅ Admin user created successfully!")
        print(f"   Email: {admin.email}")
        print(f"   Password: admin")
        print(f"   Initials: {admin.initials}")
        print(f"   Role: {admin.role.value}")
        print(f"   Status: {admin.status.value}")
        print(f"   User ID: {admin.id}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating admin user: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Creating admin user...")
    create_admin_user()

