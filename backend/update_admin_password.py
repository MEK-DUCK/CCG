"""
Script to update the admin user's password.
"""
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, UserStatus
from app.auth import get_password_hash

def update_admin_password():
    """Update the admin user's password."""
    db = SessionLocal()
    
    try:
        # Find admin user
        admin = db.query(User).filter(User.email == "admin@admin.com").first()
        if not admin:
            print("❌ Admin user not found!")
            return
        
        # Update password
        admin.password_hash = get_password_hash("admin")
        admin.status = UserStatus.ACTIVE  # Ensure it's active
        
        db.commit()
        db.refresh(admin)
        
        print("✅ Admin user password updated successfully!")
        print(f"   Email: {admin.email}")
        print(f"   Password: admin")
        print(f"   Initials: {admin.initials}")
        print(f"   Role: {admin.role.value}")
        print(f"   Status: {admin.status.value}")
        print(f"   User ID: {admin.id}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error updating admin user: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Updating admin user password...")
    update_admin_password()

