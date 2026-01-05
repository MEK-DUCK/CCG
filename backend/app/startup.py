"""
Startup script to ensure admin/test users and reference data exist.
This runs automatically when the FastAPI app starts.
"""
import logging
from app.database import SessionLocal
from app.models import User, UserRole, UserStatus, DischargePort
from app.auth import get_password_hash

logger = logging.getLogger(__name__)

# Default discharge ports with restrictions and voyage durations
# Trip duration includes 2-day laycan
DEFAULT_DISCHARGE_PORTS = [
    {
        "name": "Shell Haven",
        "restrictions": """All vessels must be capable of connecting to two 16-inch Woodfield loading/unloading arms.
All vessels must be capable of discharging at a rate of 2500 Cubic meters per hour, or of maintaining a discharge pressure at the vessel's manifold of at least 100PSIG (7.5Bar).
It is Seller's responsibility to provide vessels which do not exceed the Maximum Limitations as follows: -
Maximum draft on arrival at S Jetty is 14.9 meters.
Max. LOA: 250 M
Max displacement of 135,000 MT
SDWT maximum 116,000 MT""",
        "voyage_days_suez": 24,
        "voyage_days_cape": 40,
        "sort_order": 1
    },
    {
        "name": "Milford Haven",
        "restrictions": "",  # To be provided
        "voyage_days_suez": 23,
        "voyage_days_cape": 39,
        "sort_order": 2
    },
    {
        "name": "Rotterdam",
        "restrictions": "",  # To be provided
        "voyage_days_suez": 24,
        "voyage_days_cape": 40,
        "sort_order": 3
    },
    {
        "name": "Le Havre",
        "restrictions": "",  # To be provided
        "voyage_days_suez": 24,
        "voyage_days_cape": 40,
        "sort_order": 4
    },
    {
        "name": "Naples",
        "restrictions": "",  # To be provided
        "voyage_days_suez": 17,
        "voyage_days_cape": 40,
        "sort_order": 5
    },
]

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


def ensure_discharge_ports():
    """Ensure default discharge ports exist, create if they don't."""
    db = SessionLocal()
    
    try:
        # Check if any discharge ports exist
        existing_count = db.query(DischargePort).count()
        
        if existing_count == 0:
            # Seed default discharge ports
            for port_data in DEFAULT_DISCHARGE_PORTS:
                port = DischargePort(
                    name=port_data["name"],
                    restrictions=port_data["restrictions"],
                    voyage_days_suez=port_data["voyage_days_suez"],
                    voyage_days_cape=port_data["voyage_days_cape"],
                    is_active=True,
                    sort_order=port_data["sort_order"]
                )
                db.add(port)
            
            db.commit()
            logger.info(f"✅ Seeded {len(DEFAULT_DISCHARGE_PORTS)} default discharge ports")
        else:
            logger.info(f"ℹ️  Discharge ports already exist ({existing_count} ports)")
            
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error seeding discharge ports: {e}")
    finally:
        db.close()

