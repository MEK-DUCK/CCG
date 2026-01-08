from sqlalchemy import create_engine, text
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
    Create all tables defined in models.
    All constraints and indexes are now defined in models.py via __table_args__.
    """
    from app import models  # Import models to register them with Base
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema ensured")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
