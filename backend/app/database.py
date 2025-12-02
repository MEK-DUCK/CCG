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

def ensure_schema_upgrades():
    """Apply lightweight schema adjustments that don't require full migrations."""
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        if 'cargos' in existing_tables:
            cargo_columns = {col['name'] for col in inspector.get_columns('cargos')}
            
    except Exception as exc:
        print(f"⚠ Could not verify/upgrade cargos table schema: {exc}")

def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

