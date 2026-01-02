"""
Script to create test users directly in the database.
"""
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, UserRole, UserStatus
from app.auth import get_password_hash

def create_test_users():
    """Create test users with the specified credentials."""
    db = SessionLocal()
    
    try:
        # User 1: MEK1
        user1_email = "mek@test.com"
        existing1 = db.query(User).filter(User.email == user1_email).first()
        if existing1:
            print(f"⚠️  User already exists: {user1_email}")
            # Update password and details
            existing1.password_hash = get_password_hash("password")
            existing1.status = UserStatus.ACTIVE
            existing1.role = UserRole.USER
            existing1.initials = "MEK1"
            db.commit()
            db.refresh(existing1)
            print(f"✅ Updated user: {user1_email} (ID: {existing1.id}, Initials: {existing1.initials})")
        else:
            user1 = User(
                email=user1_email,
                password_hash=get_password_hash("password"),
                full_name="Test User MEK",
                initials="MEK1",
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
                invite_token=None,
                invite_token_expires=None,
                created_by_id=None
            )
            db.add(user1)
            db.commit()
            db.refresh(user1)
            print(f"✅ Created user: {user1.email} (ID: {user1.id})")
        
        # User 2: AZN
        user2_email = "azn@test.com"
        existing2 = db.query(User).filter(User.email == user2_email).first()
        if existing2:
            print(f"⚠️  User already exists: {user2_email}")
            # Update password and details
            existing2.password_hash = get_password_hash("password")
            existing2.status = UserStatus.ACTIVE
            existing2.role = UserRole.USER
            # Check if initials conflict with another user
            initials_conflict = db.query(User).filter(
                User.initials == "AZN",
                User.id != existing2.id
            ).first()
            if not initials_conflict:
                existing2.initials = "AZN"
            db.commit()
            db.refresh(existing2)
            print(f"✅ Updated user: {user2_email} (ID: {existing2.id}, Initials: {existing2.initials})")
        else:
            user2 = User(
                email=user2_email,
                password_hash=get_password_hash("password"),
                full_name="Test User AZN",
                initials="AZN",
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
                invite_token=None,
                invite_token_expires=None,
                created_by_id=None
            )
            db.add(user2)
            db.commit()
            db.refresh(user2)
            print(f"✅ Created user: {user2.email} (ID: {user2.id})")
        
        print("\n✅ Test users created/updated successfully!")
        print("\nUser 1:")
        print(f"   Email: {user1_email}")
        print(f"   Password: password")
        print(f"   Initials: MEK1")
        print(f"   Role: USER")
        print("\nUser 2:")
        print(f"   Email: {user2_email}")
        print(f"   Password: password")
        print(f"   Initials: AZN")
        print(f"   Role: USER")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating test users: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Creating test users...")
    create_test_users()

