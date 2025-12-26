from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# PostgreSQL connection string format:
# postgresql://username:password@host:port/database
# Example: postgresql://postgres:password@localhost:5432/oil_lifting

DATABASE_URL = os.getenv("DATABASE_URL")
USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"

if USE_SQLITE:
    DATABASE_URL = "sqlite:///./oil_lifting.db"
    print("✓ Using SQLite database (oil_lifting.db)")
    print("  To use PostgreSQL, set USE_SQLITE=false and configure DATABASE_URL in .env")
    
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False
    )
else:
    try:
        test_engine = create_engine(
            DATABASE_URL, 
            connect_args={"connect_timeout": 5},
            pool_pre_ping=True
        )
        
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        print(f"✓ Connected to PostgreSQL database")
        
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_timeout=10,
            pool_recycle=3600,
            connect_args={"connect_timeout": 5},
            echo=False
        )
        
    except Exception as e:
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
    Also adds database constraints and indexes for data integrity and performance.
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
                logger.warning(f"Failed to populate product_name for quarterly plans: {e}")
        
        # Quarterly plans migrations - add top-up tracking fields
        if insp.has_table("quarterly_plans"):
            cols = [c.get("name") for c in insp.get_columns("quarterly_plans")]
            topup_fields = ["q1_topup", "q2_topup", "q3_topup", "q4_topup"]
            for field in topup_fields:
                if field not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE quarterly_plans ADD COLUMN IF NOT EXISTS {field} FLOAT DEFAULT 0'))
                        else:
                            conn.execute(text(f'ALTER TABLE quarterly_plans ADD COLUMN {field} FLOAT DEFAULT 0'))
                    logger.info(f"Added {field} column to quarterly_plans table")

        # Monthly plans migrations - add combi_group_id for combi monthly plans
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            if "combi_group_id" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS combi_group_id VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN combi_group_id VARCHAR'))
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_monthly_plans_combi_group_id ON monthly_plans (combi_group_id)'))
                        else:
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_monthly_plans_combi_group_id ON monthly_plans (combi_group_id)'))
                except Exception:
                    pass

        # Cargos migrations - add combi_group_id for combi cargos
        if insp.has_table("cargos"):
            cols = [c.get("name") for c in insp.get_columns("cargos")]
            if "combi_group_id" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS combi_group_id VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN combi_group_id VARCHAR'))
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_cargos_combi_group_id ON cargos (combi_group_id)'))
                        else:
                            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_cargos_combi_group_id ON cargos (combi_group_id)'))
                except Exception:
                    pass
            
            # Add five_nd_date for CIF In-Road tracking
            if "five_nd_date" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS five_nd_date VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN five_nd_date VARCHAR'))
        
        # Monthly plans migrations - add authority top-up fields
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            topup_cols = [
                ("authority_topup_quantity", "FLOAT"),
                ("authority_topup_reference", "VARCHAR"),
                ("authority_topup_reason", "TEXT"),
                ("authority_topup_date", "DATE"),
            ]
            for col_name, col_type in topup_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                        else:
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN {col_name} {col_type}'))
                    logger.info(f"Added {col_name} column to monthly_plans table")
        
        # Contracts migrations - add authority_topups for authorized quantity increases (legacy, kept for compatibility)
        if insp.has_table("contracts"):
            cols = [c.get("name") for c in insp.get_columns("contracts")]
            if "authority_topups" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS authority_topups TEXT'))
                    else:
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN authority_topups TEXT'))
                logger.info("Added authority_topups column to contracts table")
            
            # Add fiscal year support fields
            fiscal_cols = [
                ("fiscal_start_month", "INTEGER DEFAULT 1"),
                ("contract_category", "VARCHAR DEFAULT 'TERM'"),
            ]
            for col_name, col_type in fiscal_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE contracts ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                        else:
                            conn.execute(text(f'ALTER TABLE contracts ADD COLUMN {col_name} {col_type}'))
                    logger.info(f"Added {col_name} column to contracts table")
        
        # Quarterly plans migrations - add contract_year for multi-year contracts
        if insp.has_table("quarterly_plans"):
            cols = [c.get("name") for c in insp.get_columns("quarterly_plans")]
            if "contract_year" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN IF NOT EXISTS contract_year INTEGER DEFAULT 1'))
                    else:
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN contract_year INTEGER DEFAULT 1'))
                logger.info("Added contract_year column to quarterly_plans table")
        
        # Monthly plans migrations - add direct contract link for SPOT contracts
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            spot_cols = [
                ("contract_id", "INTEGER REFERENCES contracts(id)"),
                ("product_name", "VARCHAR"),
            ]
            for col_name, col_type in spot_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS {col_name} {col_type.split(" ")[0]}'))
                        else:
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN {col_name} {col_type.split(" ")[0]}'))
                    logger.info(f"Added {col_name} column to monthly_plans table")
            
            # Make quarterly_plan_id nullable for SPOT contracts (PostgreSQL)
            if dialect == "postgresql":
                try:
                    with engine.begin() as conn:
                        conn.execute(text('ALTER TABLE monthly_plans ALTER COLUMN quarterly_plan_id DROP NOT NULL'))
                    logger.info("Made quarterly_plan_id nullable in monthly_plans table")
                except Exception:
                    pass  # Already nullable or constraint doesn't exist
        
        # Create contract_audit_logs table if not exists
        if not insp.has_table("contract_audit_logs"):
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE contract_audit_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        contract_id INTEGER REFERENCES contracts(id),
                        contract_db_id INTEGER,
                        action VARCHAR NOT NULL,
                        field_name VARCHAR,
                        old_value TEXT,
                        new_value TEXT,
                        product_name VARCHAR,
                        topup_quantity FLOAT,
                        authority_reference VARCHAR,
                        topup_reason VARCHAR,
                        contract_number VARCHAR,
                        customer_name VARCHAR,
                        description TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''' if dialect == "sqlite" else '''
                    CREATE TABLE IF NOT EXISTS contract_audit_logs (
                        id SERIAL PRIMARY KEY,
                        contract_id INTEGER REFERENCES contracts(id),
                        contract_db_id INTEGER,
                        action VARCHAR NOT NULL,
                        field_name VARCHAR,
                        old_value TEXT,
                        new_value TEXT,
                        product_name VARCHAR,
                        topup_quantity FLOAT,
                        authority_reference VARCHAR,
                        topup_reason VARCHAR,
                        contract_number VARCHAR,
                        customer_name VARCHAR,
                        description TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    )
                '''))
                logger.info("Created contract_audit_logs table")
        
        # =============================================================================
        # DATABASE CONSTRAINTS (PostgreSQL only)
        # =============================================================================
        if dialect == "postgresql":
            _add_postgresql_constraints()
            _add_postgresql_indexes()
            _add_financial_hold_enum()
                    
    except Exception as e:
        logger.warning(f"Schema migration warning: {e}")


def _add_postgresql_constraints():
    """Add CHECK constraints for data validation (PostgreSQL only)."""
    constraints = [
        # Monthly plans: month must be 1-12
        ("monthly_plans", "chk_monthly_plans_month", "month >= 1 AND month <= 12"),
        # Monthly plans: year must be reasonable
        ("monthly_plans", "chk_monthly_plans_year", "year >= 2020 AND year <= 2100"),
        # Monthly plans: quantity must be non-negative
        ("monthly_plans", "chk_monthly_plans_quantity", "month_quantity >= 0"),
        # Quarterly plans: quantities must be non-negative
        ("quarterly_plans", "chk_quarterly_q1", "q1_quantity >= 0"),
        ("quarterly_plans", "chk_quarterly_q2", "q2_quantity >= 0"),
        ("quarterly_plans", "chk_quarterly_q3", "q3_quantity >= 0"),
        ("quarterly_plans", "chk_quarterly_q4", "q4_quantity >= 0"),
        # Cargos: quantity must be positive
        ("cargos", "chk_cargos_quantity", "cargo_quantity > 0"),
    ]
    
    for table, constraint_name, check_condition in constraints:
        try:
            with engine.begin() as conn:
                # Check if constraint exists
                result = conn.execute(text(f"""
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = :name
                """), {"name": constraint_name})
                
                if not result.fetchone():
                    conn.execute(text(f"""
                        ALTER TABLE {table} 
                        ADD CONSTRAINT {constraint_name} 
                        CHECK ({check_condition})
                    """))
                    logger.info(f"Added constraint {constraint_name} to {table}")
        except Exception as e:
            logger.debug(f"Constraint {constraint_name} may already exist or failed: {e}")


def _add_postgresql_indexes():
    """Add performance indexes (PostgreSQL only)."""
    indexes = [
        # Weekly comparison query optimization
        ("idx_monthly_audit_log_comparison", "monthly_plan_audit_logs", "(created_at, contract_id, field_name)"),
        # Cargo queries by status
        ("idx_cargos_status", "cargos", "(status)"),
        # Cargo queries by contract
        ("idx_cargos_contract_id", "cargos", "(contract_id)"),
        # Monthly plans by year/month for port movement
        ("idx_monthly_plans_year_month", "monthly_plans", "(year, month)"),
        # Port operations by cargo
        ("idx_cargo_port_ops_cargo", "cargo_port_operations", "(cargo_id)"),
        # Port operations by status for active loadings
        ("idx_cargo_port_ops_status", "cargo_port_operations", "(status)"),
    ]
    
    for index_name, table, columns in indexes:
        try:
            with engine.begin() as conn:
                conn.execute(text(f"""
                    CREATE INDEX IF NOT EXISTS {index_name} ON {table} {columns}
                """))
        except Exception as e:
            logger.debug(f"Index {index_name} may already exist or failed: {e}")


def _add_financial_hold_enum():
    """Add Financial Hold to LC status enum if not present (PostgreSQL only)."""
    try:
        with engine.begin() as conn:
            # Check if Financial Hold exists in the enum
            result = conn.execute(text("""
                SELECT 1 FROM pg_enum 
                WHERE enumtypid = 'lcstatus'::regtype 
                AND enumlabel = 'Financial Hold'
            """))
            
            if not result.fetchone():
                conn.execute(text("""
                    ALTER TYPE lcstatus ADD VALUE IF NOT EXISTS 'Financial Hold'
                """))
                logger.info("Added 'Financial Hold' to lcstatus enum")
    except Exception as e:
        logger.debug(f"Financial Hold enum addition skipped: {e}")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
