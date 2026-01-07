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

# Convert postgresql:// to postgresql+psycopg:// for psycopg v3 compatibility
# psycopg v3 requires the explicit +psycopg driver specification
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
    logger.info("Converted DATABASE_URL to use psycopg v3 driver")

if USE_SQLITE:
    DATABASE_URL = "sqlite:///./oil_lifting.db"
    logger.info("✓ Using SQLite database (oil_lifting.db)")
    logger.info("  To use PostgreSQL, set USE_SQLITE=false and configure DATABASE_URL in .env")

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False
    )
else:
    if not DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is not set. "
            "Either set DATABASE_URL for PostgreSQL or set USE_SQLITE=true for local development."
        )

    try:
        connect_args = {"connect_timeout": 10}

        test_engine = create_engine(
            DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True
        )

        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        logger.info(f"✓ Connected to PostgreSQL database")

        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            connect_args=connect_args,
            echo=False
        )

    except Exception as e:
        # In production, we should NOT silently fall back to SQLite
        # This could cause data to be written to the wrong database
        ALLOW_SQLITE_FALLBACK = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true"

        if ALLOW_SQLITE_FALLBACK:
            logger.warning(f"⚠ PostgreSQL connection failed: {str(e)}")
            logger.warning("⚠ Falling back to SQLite database (oil_lifting.db)")
            logger.warning("⚠ WARNING: Data will NOT be synced to PostgreSQL!")

            DATABASE_URL = "sqlite:///./oil_lifting.db"
            engine = create_engine(
                DATABASE_URL,
                connect_args={"check_same_thread": False},
                echo=False
            )
        else:
            logger.error(f"✗ PostgreSQL connection failed: {str(e)}")
            logger.error("✗ Set ALLOW_SQLITE_FALLBACK=true to allow fallback to SQLite (NOT recommended for production)")
            raise

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

        # Drop legacy product_name columns - now using product_id FK with JOIN to products table
        if insp.has_table("quarterly_plans"):
            cols = [c.get("name") for c in insp.get_columns("quarterly_plans")]
            if "product_name" in cols:
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('ALTER TABLE quarterly_plans DROP COLUMN IF EXISTS product_name'))
                        else:
                            # SQLite doesn't support DROP COLUMN before 3.35.0, skip silently
                            pass
                    logger.info("Dropped legacy product_name column from quarterly_plans")
                except Exception as e:
                    logger.debug(f"Could not drop product_name from quarterly_plans: {e}")

        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            if "product_name" in cols:
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('ALTER TABLE monthly_plans DROP COLUMN IF EXISTS product_name'))
                        else:
                            # SQLite doesn't support DROP COLUMN before 3.35.0, skip silently
                            pass
                    logger.info("Dropped legacy product_name column from monthly_plans")
                except Exception as e:
                    logger.debug(f"Could not drop product_name from monthly_plans: {e}")

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
            
            # Add five_nd_date (ND Due Date) for CIF In-Road tracking
            if "five_nd_date" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS five_nd_date VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN five_nd_date VARCHAR'))
            
            # Add nd_days and nd_completed for ND tracking
            if "nd_days" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS nd_days VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN nd_days VARCHAR'))
            if "nd_completed" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN IF NOT EXISTS nd_completed BOOLEAN DEFAULT FALSE'))
                    else:
                        conn.execute(text('ALTER TABLE cargos ADD COLUMN nd_completed BOOLEAN DEFAULT 0'))
        
        # Contracts migrations - add cif_destination for delivery window calculation
        if insp.has_table("contracts"):
            cols = [c.get("name") for c in insp.get_columns("contracts")]
            if "cif_destination" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS cif_destination VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN cif_destination VARCHAR'))
                logger.info("Added cif_destination column to contracts table")
            
            # Add tng_lead_days for CIF Tonnage Memo tracking
            if "tng_lead_days" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tng_lead_days INTEGER'))
                    else:
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN tng_lead_days INTEGER'))
                logger.info("Added tng_lead_days column to contracts table")
            
            # Add tng_notes for TNG-specific notes
            if "tng_notes" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tng_notes TEXT'))
                    else:
                        conn.execute(text('ALTER TABLE contracts ADD COLUMN tng_notes TEXT'))
                logger.info("Added tng_notes column to contracts table")
        
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
            
            # Add cif_route for delivery window calculation
            if "cif_route" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS cif_route VARCHAR'))
                    else:
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN cif_route VARCHAR'))
                logger.info("Added cif_route column to monthly_plans table")
            
            # Add TNG tracking fields
            tng_cols = [
                ("tng_issued", "BOOLEAN DEFAULT FALSE" if dialect == "postgresql" else "BOOLEAN DEFAULT 0"),
                ("tng_issued_date", "DATE"),
                ("tng_issued_initials", "VARCHAR(10)"),
                ("tng_revised", "BOOLEAN DEFAULT FALSE" if dialect == "postgresql" else "BOOLEAN DEFAULT 0"),
                ("tng_revised_date", "DATE"),
                ("tng_revised_initials", "VARCHAR(10)"),
                ("tng_remarks", "TEXT"),
            ]
            for col_name, col_type in tng_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                        else:
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN {col_name} {col_type}'))
                    logger.info(f"Added {col_name} column to monthly_plans table")
        
            # Add move tracking fields for defer/advance
            move_cols = [
                ("original_month", "INTEGER"),
                ("original_year", "INTEGER"),
                ("last_move_authority_reference", "VARCHAR(100)"),
                ("last_move_reason", "TEXT"),
                ("last_move_date", "DATE"),
                ("last_move_action", "VARCHAR(10)"),
            ]
            for col_name, col_type in move_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                        else:
                            conn.execute(text(f'ALTER TABLE monthly_plans ADD COLUMN {col_name} {col_type}'))
                    logger.info(f"Added {col_name} column to monthly_plans table")
        
        # Drop legacy authority_topups column - now using authority_amendments table
        if insp.has_table("contracts"):
            cols = [c.get("name") for c in insp.get_columns("contracts")]
            if "authority_topups" in cols:
                try:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text('ALTER TABLE contracts DROP COLUMN IF EXISTS authority_topups'))
                        else:
                            # SQLite doesn't support DROP COLUMN before 3.35.0, skip silently
                            pass
                    logger.info("Dropped legacy authority_topups column from contracts")
                except Exception as e:
                    logger.debug(f"Could not drop authority_topups from contracts: {e}")

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
        
        # Contract products migrations - add original quantity columns for amendment tracking
        if insp.has_table("contract_products"):
            cols = [c.get("name") for c in insp.get_columns("contract_products")]
            original_qty_cols = [
                ("original_min_quantity", "FLOAT"),
                ("original_max_quantity", "FLOAT"),
                ("original_year_quantities", "JSONB" if dialect == "postgresql" else "JSON"),
            ]
            for col_name, col_type in original_qty_cols:
                if col_name not in cols:
                    with engine.begin() as conn:
                        if dialect == "postgresql":
                            conn.execute(text(f'ALTER TABLE contract_products ADD COLUMN IF NOT EXISTS {col_name} {col_type}'))
                        else:
                            conn.execute(text(f'ALTER TABLE contract_products ADD COLUMN {col_name} {col_type}'))
                    logger.info(f"Added {col_name} column to contract_products table")

            # Convert TEXT columns to JSONB for better query performance (PostgreSQL only)
            if dialect == "postgresql":
                _convert_contract_products_to_jsonb()

            # Backfill original quantities from current values for existing records
            # Only do this once - check if any records have NULL original values but non-NULL current values
            with engine.begin() as conn:
                if dialect == "postgresql":
                    conn.execute(text('''
                        UPDATE contract_products
                        SET original_min_quantity = min_quantity,
                            original_max_quantity = max_quantity,
                            original_year_quantities = year_quantities
                        WHERE (original_min_quantity IS NULL AND min_quantity IS NOT NULL)
                           OR (original_max_quantity IS NULL AND max_quantity IS NOT NULL)
                    '''))
                else:
                    conn.execute(text('''
                        UPDATE contract_products
                        SET original_min_quantity = min_quantity,
                            original_max_quantity = max_quantity,
                            original_year_quantities = year_quantities
                        WHERE (original_min_quantity IS NULL AND min_quantity IS NOT NULL)
                           OR (original_max_quantity IS NULL AND max_quantity IS NOT NULL)
                    '''))
            logger.info("Backfilled original quantity values for existing contract products")
        
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

            # Add adjustment_notes for defer/advance tracking
            if "adjustment_notes" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN IF NOT EXISTS adjustment_notes TEXT'))
                    else:
                        conn.execute(text('ALTER TABLE quarterly_plans ADD COLUMN adjustment_notes TEXT'))
                logger.info("Added adjustment_notes column to quarterly_plans table")

            # Ensure product_id and contract_year are NOT NULL (PostgreSQL only)
            if dialect == "postgresql":
                _ensure_quarterly_plans_not_null()
        
        # Audit logs migrations - add authority_reference for cross-quarter moves
        if insp.has_table("monthly_plan_audit_logs"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plan_audit_logs")]
            if "authority_reference" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE monthly_plan_audit_logs ADD COLUMN IF NOT EXISTS authority_reference VARCHAR(100)'))
                    else:
                        conn.execute(text('ALTER TABLE monthly_plan_audit_logs ADD COLUMN authority_reference VARCHAR(100)'))
                logger.info("Added authority_reference column to monthly_plan_audit_logs table")
        
        if insp.has_table("cargo_audit_logs"):
            cols = [c.get("name") for c in insp.get_columns("cargo_audit_logs")]
            if "authority_reference" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE cargo_audit_logs ADD COLUMN IF NOT EXISTS authority_reference VARCHAR(100)'))
                    else:
                        conn.execute(text('ALTER TABLE cargo_audit_logs ADD COLUMN authority_reference VARCHAR(100)'))
                logger.info("Added authority_reference column to cargo_audit_logs table")
        
        # Create quarterly_plan_adjustments table for tracking cross-quarter defer/advance
        if not insp.has_table("quarterly_plan_adjustments"):
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE quarterly_plan_adjustments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        quarterly_plan_id INTEGER NOT NULL REFERENCES quarterly_plans(id),
                        adjustment_type VARCHAR(20) NOT NULL,
                        quantity FLOAT NOT NULL,
                        from_quarter INTEGER,
                        to_quarter INTEGER,
                        from_year INTEGER,
                        to_year INTEGER,
                        authority_reference VARCHAR(100) NOT NULL,
                        reason TEXT,
                        monthly_plan_id INTEGER REFERENCES monthly_plans(id),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER REFERENCES users(id),
                        user_initials VARCHAR(4)
                    )
                ''' if dialect == "sqlite" else '''
                    CREATE TABLE IF NOT EXISTS quarterly_plan_adjustments (
                        id SERIAL PRIMARY KEY,
                        quarterly_plan_id INTEGER NOT NULL REFERENCES quarterly_plans(id),
                        adjustment_type VARCHAR(20) NOT NULL,
                        quantity FLOAT NOT NULL,
                        from_quarter INTEGER,
                        to_quarter INTEGER,
                        from_year INTEGER,
                        to_year INTEGER,
                        authority_reference VARCHAR(100) NOT NULL,
                        reason TEXT,
                        monthly_plan_id INTEGER REFERENCES monthly_plans(id),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        user_id INTEGER REFERENCES users(id),
                        user_initials VARCHAR(4)
                    )
                '''))
            logger.info("Created quarterly_plan_adjustments table")
        
        # Monthly plans migrations - add direct contract link for SPOT contracts
        # NOTE: product_name column removed - use product_id FK with JOIN to products table
        if insp.has_table("monthly_plans"):
            cols = [c.get("name") for c in insp.get_columns("monthly_plans")]
            if "contract_id" not in cols:
                with engine.begin() as conn:
                    if dialect == "postgresql":
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN IF NOT EXISTS contract_id INTEGER'))
                    else:
                        conn.execute(text('ALTER TABLE monthly_plans ADD COLUMN contract_id INTEGER'))
                logger.info("Added contract_id column to monthly_plans table")
            
            # Make quarterly_plan_id nullable for SPOT contracts (PostgreSQL)
            if dialect == "postgresql":
                try:
                    with engine.begin() as conn:
                        conn.execute(text('ALTER TABLE monthly_plans ALTER COLUMN quarterly_plan_id DROP NOT NULL'))
                    logger.info("Made quarterly_plan_id nullable in monthly_plans table")
                except Exception:
                    pass  # Already nullable or constraint doesn't exist

            # Ensure product_id is NOT NULL (PostgreSQL only)
            if dialect == "postgresql":
                _ensure_monthly_plans_product_not_null()

        # Create products table if not exists (for admin-managed product configuration)
        if not insp.has_table("products"):
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code VARCHAR(20) UNIQUE NOT NULL,
                        name VARCHAR(64) UNIQUE NOT NULL,
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT 1,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                ''' if dialect == "sqlite" else '''
                    CREATE TABLE IF NOT EXISTS products (
                        id SERIAL PRIMARY KEY,
                        code VARCHAR(20) UNIQUE NOT NULL,
                        name VARCHAR(64) UNIQUE NOT NULL,
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT TRUE,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE
                    )
                '''))
                logger.info("Created products table")
                
                # Seed default products
                default_products = [
                    ("JETA1", "JET A-1", "Aviation turbine fuel", 1),
                    ("GASOIL", "GASOIL", "Diesel fuel", 2),
                    ("GASOIL10", "GASOIL 10PPM", "Ultra-low sulfur diesel (10ppm)", 3),
                    ("HFO", "HFO", "Heavy fuel oil", 4),
                    ("LSFO", "LSFO", "Low sulfur fuel oil", 5),
                ]
                for code, name, desc, order in default_products:
                    conn.execute(text(
                        "INSERT INTO products (code, name, description, is_active, sort_order) VALUES (:code, :name, :desc, :active, :order)"
                    ), {"code": code, "name": name, "desc": desc, "active": True, "order": order})
                logger.info("Seeded default products")
        
        # Create load_ports table if not exists (for admin-managed port configuration)
        if not insp.has_table("load_ports"):
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE load_ports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code VARCHAR(10) UNIQUE NOT NULL,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        country VARCHAR(50),
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT 1,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                ''' if dialect == "sqlite" else '''
                    CREATE TABLE IF NOT EXISTS load_ports (
                        id SERIAL PRIMARY KEY,
                        code VARCHAR(10) UNIQUE NOT NULL,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        country VARCHAR(50),
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT TRUE,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE
                    )
                '''))
                logger.info("Created load_ports table")
                
                # Seed default load ports
                default_ports = [
                    ("MAA", "Mina Al Ahmadi", "Kuwait", "Main oil export terminal", 1),
                    ("MAB", "Mina Abdullah", "Kuwait", "Secondary oil terminal", 2),
                    ("SHU", "Shuaiba", "Kuwait", "Industrial port", 3),
                    ("ZOR", "Zour", "Kuwait", "Al Zour LNG terminal", 4),
                ]
                for code, name, country, desc, order in default_ports:
                    conn.execute(text(
                        "INSERT INTO load_ports (code, name, country, description, is_active, sort_order) VALUES (:code, :name, :country, :desc, :active, :order)"
                    ), {"code": code, "name": name, "country": country, "desc": desc, "active": True, "order": order})
                logger.info("Seeded default load ports")
        
        # Create inspectors table if not exists (for admin-managed inspector configuration)
        if not insp.has_table("inspectors"):
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE inspectors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code VARCHAR(20) UNIQUE NOT NULL,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT 1,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                ''' if dialect == "sqlite" else '''
                    CREATE TABLE IF NOT EXISTS inspectors (
                        id SERIAL PRIMARY KEY,
                        code VARCHAR(20) UNIQUE NOT NULL,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT TRUE,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE
                    )
                '''))
                logger.info("Created inspectors table")
                
                # Seed default inspectors
                default_inspectors = [
                    ("SGS", "SGS", "SGS SA - Global inspection company", 1),
                    ("INTERTEK", "Intertek", "Intertek Group plc", 2),
                    ("SAYBOLT", "Saybolt", "Core Laboratories - Saybolt", 3),
                    ("BUREAU", "Bureau Veritas", "Bureau Veritas SA", 4),
                    ("AMSPEC", "AmSpec", "AmSpec LLC", 5),
                ]
                for code, name, desc, order in default_inspectors:
                    conn.execute(text(
                        "INSERT INTO inspectors (code, name, description, is_active, sort_order) VALUES (:code, :name, :desc, :active, :order)"
                    ), {"code": code, "name": name, "desc": desc, "active": True, "order": order})
                logger.info("Seeded default inspectors")
        
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
            _add_postgresql_unique_constraints()
            _add_postgresql_indexes()
            _add_financial_hold_enum()
                    
    except Exception as e:
        logger.warning(f"Schema migration warning: {e}")


def _add_postgresql_constraints():
    """Add CHECK constraints for data validation (PostgreSQL only)."""
    constraints = [
        # Contracts: end_period must be >= start_period
        ("contracts", "chk_contracts_date_range", "end_period >= start_period"),
        # Contracts: fiscal_start_month must be 1-12
        ("contracts", "chk_contracts_fiscal_month", "fiscal_start_month >= 1 AND fiscal_start_month <= 12"),
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
        # Quarterly plans: contract_year must be >= 1
        ("quarterly_plans", "chk_quarterly_contract_year", "contract_year >= 1"),
        # Authority amendments: amendment_type must be valid
        ("authority_amendments", "chk_amendment_type", "amendment_type IN ('increase_max', 'decrease_max', 'increase_min', 'decrease_min', 'set_min', 'set_max')"),
        # Cargos: quantity must be positive
        ("cargos", "chk_cargos_quantity", "cargo_quantity > 0"),
        # Cargo port operations: status must be valid
        ("cargo_port_operations", "chk_port_op_status", "status IN ('Planned', 'Loading', 'Completed Loading')"),
        # Quarterly plan adjustments: adjustment_type must be valid
        ("quarterly_plan_adjustments", "chk_adjustment_type", "adjustment_type IN ('DEFER_OUT', 'DEFER_IN', 'ADVANCE_OUT', 'ADVANCE_IN')"),
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


def _add_postgresql_unique_constraints():
    """Add UNIQUE constraints for data integrity (PostgreSQL only)."""
    unique_constraints = [
        # Contract products: one product per contract
        ("contract_products", "uq_contract_products_contract_product", "contract_id, product_id"),
        # Cargo port operations: one port per cargo
        ("cargo_port_operations", "uq_cargo_port_operations_cargo_port", "cargo_id, load_port_id"),
        # Entity versions: one version number per entity
        ("entity_versions", "uq_entity_versions_type_id_version", "entity_type, entity_id, version_number"),
    ]

    for table, constraint_name, columns in unique_constraints:
        try:
            with engine.begin() as conn:
                # Check if constraint exists
                result = conn.execute(text("""
                    SELECT 1 FROM pg_constraint
                    WHERE conname = :name
                """), {"name": constraint_name})

                if not result.fetchone():
                    conn.execute(text(f"""
                        ALTER TABLE {table}
                        ADD CONSTRAINT {constraint_name}
                        UNIQUE ({columns})
                    """))
                    logger.info(f"Added unique constraint {constraint_name} to {table}")
        except Exception as e:
            logger.debug(f"Unique constraint {constraint_name} may already exist or failed: {e}")


def _add_postgresql_indexes():
    """Add performance indexes (PostgreSQL only)."""
    indexes = [
        # Contracts by customer for filtering
        ("idx_contracts_customer_id", "contracts", "(customer_id)"),
        # Weekly comparison query optimization
        ("idx_monthly_audit_log_comparison", "monthly_plan_audit_logs", "(created_at, contract_id, field_name)"),
        # Cargo queries by status
        ("idx_cargos_status", "cargos", "(status)"),
        # Cargo queries by contract
        ("idx_cargos_contract_id", "cargos", "(contract_id)"),
        # Monthly plans by year/month for port movement
        ("idx_monthly_plans_year_month", "monthly_plans", "(year, month)"),
        # Monthly plans by contract for filtering
        ("idx_monthly_plans_contract_year_month", "monthly_plans", "(contract_id, year, month)"),
        # Port operations by cargo
        ("idx_cargo_port_ops_cargo", "cargo_port_operations", "(cargo_id)"),
        # Port operations by status for active loadings
        ("idx_cargo_port_ops_status", "cargo_port_operations", "(status)"),
        # Entity versions for history lookups
        ("idx_entity_versions_lookup", "entity_versions", "(entity_type, entity_id)"),
        # Deleted entities for restore/cleanup queries
        ("idx_deleted_entities_type_date", "deleted_entities", "(entity_type, deleted_at)"),
        # Quarterly plans by contract for filtering
        ("idx_quarterly_plans_contract", "quarterly_plans", "(contract_id)"),
        # Quarterly plans by product for filtering
        ("idx_quarterly_plans_product", "quarterly_plans", "(product_id)"),
        # Authority amendments by product for filtering
        ("idx_authority_amendments_product", "authority_amendments", "(product_id)"),
        # Cargo audit logs by cargo for history
        ("idx_cargo_audit_cargo", "cargo_audit_logs", "(cargo_db_id)"),
        # Contract products by contract
        ("idx_contract_products_contract", "contract_products", "(contract_id)"),
        # Cargos by customer for filtering
        ("idx_cargos_customer_id", "cargos", "(customer_id)"),
        # Cargos by product for filtering
        ("idx_cargos_product_id", "cargos", "(product_id)"),
        # Monthly plans by product for filtering
        ("idx_monthly_plans_product", "monthly_plans", "(product_id)"),
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


def _convert_contract_products_to_jsonb():
    """Convert TEXT columns to JSONB in contract_products table (PostgreSQL only).

    This migrates year_quantities and original_year_quantities from TEXT to JSONB
    for better query performance and native JSON operations.
    """
    columns_to_convert = ["year_quantities", "original_year_quantities"]

    for col_name in columns_to_convert:
        try:
            with engine.begin() as conn:
                # Check current column type
                result = conn.execute(text("""
                    SELECT data_type FROM information_schema.columns
                    WHERE table_name = 'contract_products' AND column_name = :col_name
                """), {"col_name": col_name})
                row = result.fetchone()

                if row and row[0] == 'text':
                    # Convert TEXT to JSONB, handling existing data
                    # USING clause converts valid JSON text to JSONB
                    conn.execute(text(f"""
                        ALTER TABLE contract_products
                        ALTER COLUMN {col_name} TYPE JSONB
                        USING CASE
                            WHEN {col_name} IS NULL THEN NULL
                            WHEN {col_name} = '' THEN NULL
                            ELSE {col_name}::jsonb
                        END
                    """))
                    logger.info(f"Converted contract_products.{col_name} from TEXT to JSONB")
        except Exception as e:
            logger.debug(f"JSONB conversion for {col_name} skipped or failed: {e}")


def _ensure_monthly_plans_product_not_null():
    """Ensure product_id is NOT NULL in monthly_plans (PostgreSQL only)."""
    try:
        with engine.begin() as conn:
            # Check for NULL product_id values
            result = conn.execute(text("""
                SELECT COUNT(*) FROM monthly_plans WHERE product_id IS NULL
            """))
            null_count = result.scalar()

            if null_count > 0:
                logger.warning(f"Found {null_count} monthly_plans with NULL product_id - these need manual cleanup")
                return

            # Check if column is already NOT NULL
            result = conn.execute(text("""
                SELECT is_nullable FROM information_schema.columns
                WHERE table_name = 'monthly_plans' AND column_name = 'product_id'
            """))
            row = result.fetchone()
            if row and row[0] == 'YES':
                conn.execute(text("""
                    ALTER TABLE monthly_plans ALTER COLUMN product_id SET NOT NULL
                """))
                logger.info("Set product_id to NOT NULL in monthly_plans")

    except Exception as e:
        logger.debug(f"monthly_plans product_id NOT NULL migration skipped or failed: {e}")


def _ensure_quarterly_plans_not_null():
    """Ensure product_id and contract_year are NOT NULL in quarterly_plans (PostgreSQL only).

    This migration:
    1. Sets default values for any NULL records
    2. Alters columns to NOT NULL
    """
    try:
        with engine.begin() as conn:
            # First, check for NULL product_id values
            result = conn.execute(text("""
                SELECT COUNT(*) FROM quarterly_plans WHERE product_id IS NULL
            """))
            null_count = result.scalar()

            if null_count > 0:
                logger.warning(f"Found {null_count} quarterly_plans with NULL product_id - these need manual cleanup")
                # Cannot safely set NOT NULL if there are NULL values
                return

            # Check for NULL contract_year values and set default
            conn.execute(text("""
                UPDATE quarterly_plans SET contract_year = 1 WHERE contract_year IS NULL
            """))

            # Now set NOT NULL constraints
            # Check if column is already NOT NULL
            result = conn.execute(text("""
                SELECT is_nullable FROM information_schema.columns
                WHERE table_name = 'quarterly_plans' AND column_name = 'product_id'
            """))
            row = result.fetchone()
            if row and row[0] == 'YES':
                conn.execute(text("""
                    ALTER TABLE quarterly_plans ALTER COLUMN product_id SET NOT NULL
                """))
                logger.info("Set product_id to NOT NULL in quarterly_plans")

            result = conn.execute(text("""
                SELECT is_nullable FROM information_schema.columns
                WHERE table_name = 'quarterly_plans' AND column_name = 'contract_year'
            """))
            row = result.fetchone()
            if row and row[0] == 'YES':
                conn.execute(text("""
                    ALTER TABLE quarterly_plans ALTER COLUMN contract_year SET NOT NULL
                """))
                logger.info("Set contract_year to NOT NULL in quarterly_plans")

    except Exception as e:
        logger.debug(f"quarterly_plans NOT NULL migration skipped or failed: {e}")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
