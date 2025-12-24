from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL connection string format:
# postgresql://username:password@host:port/database
# Example: postgresql://postgres:password@localhost:5432/oil_lifting

DATABASE_URL = os.getenv("DATABASE_URL")
USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"  # Default to PostgreSQL now

if USE_SQLITE:
    # Use SQLite database
    DATABASE_URL = "sqlite:///./oil_lifting.db"
    print("✓ Using SQLite database (oil_lifting.db)")
    print("  To use PostgreSQL, set USE_SQLITE=false and configure DATABASE_URL in .env")
    
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False
    )
else:
    # Try to connect to PostgreSQL
    try:
        # Test PostgreSQL connection with timeout (5 seconds)
        test_engine = create_engine(
            DATABASE_URL, 
            connect_args={"connect_timeout": 5},
            pool_pre_ping=True
        )
        
        # Test connection with timeout
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # PostgreSQL connection successful
        print(f"✓ Connected to PostgreSQL database")
        
        # Create engine with PostgreSQL-specific settings
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,  # Verify connections before using them
            pool_size=5,  # Number of connections to maintain
            max_overflow=10,  # Maximum number of connections beyond pool_size
            pool_timeout=10,  # Timeout for getting connection from pool
            pool_recycle=3600,  # Recycle connections after 1 hour
            connect_args={"connect_timeout": 5},  # Connection timeout
            echo=False  # Set to True for SQL query logging
        )
        
    except Exception as e:
        # Fallback to SQLite if PostgreSQL connection fails
        print(f"⚠ PostgreSQL connection failed: {str(e)}")
        print("⚠ Falling back to SQLite database (oil_lifting.db)")
        
        DATABASE_URL = "sqlite:///./oil_lifting.db"
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_schema():
    """
    Best-effort additive migrations so existing SQLite/PostgreSQL DBs keep working
    as new nullable columns are introduced.
    """
    try:
        insp = inspect(engine)
        dialect = engine.dialect.name
        
        # Monthly plans migrations
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            missing = []
            for name in ["laycan_2_days_remark", "delivery_window_remark"]:
                if name not in cols:
                    missing.append(name)

            if missing:
                with engine.begin() as conn:
                    for col in missing:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS {col} TEXT'))
                        else:
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN {col} TEXT'))

        # Quarterly plans migrations - add product_name for multi-product contracts
        if insp.has_table("quarterly_plans"):
            cols = [c.get("name") for c in insp.get_columns("quarterly_plans")]
            if "product_name" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN IF NOT EXISTS product_name VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN product_name VARCHAR'))
            
            # Data migration: populate product_name for single-product contracts where it's NULL
            try:
                with engine.begin() as conn:
                    # Get quarterly plans with NULL product_name
                    result = conn.execute(text('''
                        SELECT qp.id, c.products 
                        FROM quarterly_plans qp 
                        JOIN contracts c ON c.id = qp.contract_id 
                        WHERE qp.product_name IS NULL
                    '''))
                    rows = result.fetchall()
                    
                    import json
                    for row in rows:
                        qp_id = row[0]
                        products_json = row[1]
                        if products_json:
                            try:
                                products = json.loads(products_json) if isinstance(products_json, str) else products_json
                                if products and len(products) == 1:
                                    product_name = products[0].get('name')
                                    if product_name:
                                        conn.execute(
                                            text('UPDATE quarterly_plans SET product_name = :pn WHERE id = :id'),
                                            {"pn": product_name, "id": qp_id}
                                        )
                            except Exception:
                                pass
            except Exception as e:
                print(f"[MIGRATION] Failed to populate product_name for quarterly plans: {e}")

        # Monthly plans migrations - add combi_group_id for combi monthly plans
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            if "combi_group_id" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS combi_group_id VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN combi_group_id VARCHAR'))
                # Add index for combi_group_id
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_monthly_plans_combi_group_id ON monthly_plans (combi_group_id)'))
                        else:
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_monthly_plans_combi_group_id ON monthly_plans (combi_group_id)'))
                except Exception:
                    pass  # Index may already exist

        # Cargos migrations - add combi_group_id for combi cargos
        if insp.has_table("cargos"):
            cols = [c.get("name") for c in insp.get_columns("cargos")]
            if "combi_group_id" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS combi_group_id VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN combi_group_id VARCHAR'))
                # Add index for combi_group_id
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_cargos_combi_group_id ON cargos (combi_group_id)'))
                        else:
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_cargos_combi_group_id ON cargos (combi_group_id)'))
                except Exception:
                    pass  # Index may already exist
                    
    except Exception:
        # Never block app startup on best-effort migrations
        return

def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

