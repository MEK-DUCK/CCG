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
        "restrictions": """Tide table for 2026 for discharging JET A-1 at Milford has been sent by email on 26th Dec 2025 for your reference.

VPOT berth No.2 restriction as follows:

MAX L.O.A.: 283.00 M
CONTROL DEPTH: 16.50 M
APPROACH DEPTH: 16.30 M
MAX DWT: 165,000

Control depths are at chart datum - add height of tide on top.
10 per cent of vessels draft or min 1m is required for under keel clearance on approach.
5 per cent of vessels draft or min 1m is required for under keel clearance alongside.
The requirement may increase in periods of adverse weather/heavy swell.
Water density is 1.026 g/cm3 within the open confines of the harbor.
Water salinity ranges from 21.74 to 35.12 ppt.""",
        "voyage_days_suez": 23,
        "voyage_days_cape": 39,
        "sort_order": 2
    },
    {
        "name": "Rotterdam",
        "restrictions": """The following are the restrictions:
LOA restriction of a maximum of 250 meters.
Draft restriction at KTM terminal Rotterdam is 14.5 meters BW.""",
        "voyage_days_suez": 24,
        "voyage_days_cape": 40,
        "sort_order": 3
    },
    {
        "name": "Le Havre",
        "restrictions": """Disport Limitation:
a. All vessels must be capable of connecting to two 16-inch Woodfield loading/unloading arms.
b. All vessels must be capable of discharging at a rate of 2500 Cubic meters per hour, or of maintaining a discharge pressure at the vessel's manifold of at least 100PSIG (7.5Bar).
c. It is Seller's responsibility to provide vessels, which do not exceed the Le Havre Maximum Limitations as follows:

                        CIM 7           CIM 8           CIM 10
Maximum LOA             265M            330 M           350 M
Minimum LOA             -----           225 M           225 M
Maximum Beam            40 M            50 M            60 M
Maximum Summer DWT      90000 MT        230,000 MT      250,000 MT
Maximum Depth at berth  11.00M+Tide     14.00 M+Tide    14.50 M+Tide
Under keel clearance    30 cms deducted from above maximum""",
        "voyage_days_suez": 24,
        "voyage_days_cape": 40,
        "sort_order": 4
    },
    {
        "name": "Naples",
        "restrictions": """Napoli - Pier 69

LOA, mtrs. Max:                 260
Beam, mtrs. Max:                45
Draft, mtrs. Max:               14.5
Manifold to water, mtrs. Max:   17
Manifold to water, mtrs. Min:   3.5
Stern-centre manifold Max:      130

**Delivered cargo should not exceed the maximum 100 KT""",
        "voyage_days_suez": 17,
        "voyage_days_cape": 40,
        "sort_order": 5
    },
    {
        "name": "Djibouti",
        "restrictions": """Djibouti Port restrictions to be confirmed.""",
        "voyage_days_suez": 7,
        "voyage_days_cape": None,  # Single route destination - no Cape route
        "sort_order": 6
    },
    {
        "name": "Keamari/Fotco",
        "restrictions": """Keamari/Fotco Port restrictions to be confirmed.""",
        "voyage_days_suez": 7,
        "voyage_days_cape": None,  # Single route destination - no Cape route
        "sort_order": 7
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

