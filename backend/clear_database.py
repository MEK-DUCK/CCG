#!/usr/bin/env python3
"""
Script to clear all data from the database.
This will delete all records from all tables while preserving the schema.
"""

import sys
from sqlalchemy import text
from app.database import SessionLocal, engine
from app.models import (
    CargoAuditLog,
    MonthlyPlanAuditLog,
    QuarterlyPlanAuditLog,
    Cargo,
    MonthlyPlan,
    QuarterlyPlan,
    Contract,
    Customer,
    Base
)

def clear_database():
    """Delete all data from all tables"""
    db = SessionLocal()
    
    try:
        print("🗑️  Starting database cleanup...")
        
        # Get database type
        is_postgresql = "postgresql" in str(engine.url)
        
        if is_postgresql:
            print("📊 Detected PostgreSQL database")
            # Use TRUNCATE CASCADE for PostgreSQL (faster and handles foreign keys)
            tables = [
                "cargo_audit_logs",
                "monthly_plan_audit_logs",
                "quarterly_plan_audit_logs",
                "cargos",
                "monthly_plans",
                "quarterly_plans",
                "contracts",
                "customers"
            ]
            
            # Disable foreign key checks temporarily
            db.execute(text("SET session_replication_role = 'replica';"))
            
            for table in tables:
                try:
                    db.execute(text(f'TRUNCATE TABLE "{table}" CASCADE;'))
                    print(f"  ✓ Cleared {table}")
                except Exception as e:
                    print(f"  ⚠ Could not clear {table}: {e}")
            
            # Re-enable foreign key checks
            db.execute(text("SET session_replication_role = 'origin';"))
            
        else:
            print("📊 Detected SQLite database")
            # For SQLite, delete in order respecting foreign keys
            # Delete audit logs first
            db.query(CargoAuditLog).delete()
            print("  ✓ Cleared cargo_audit_logs")
            
            db.query(MonthlyPlanAuditLog).delete()
            print("  ✓ Cleared monthly_plan_audit_logs")
            
            db.query(QuarterlyPlanAuditLog).delete()
            print("  ✓ Cleared quarterly_plan_audit_logs")
            
            # Delete cargos (has foreign keys to monthly_plans)
            db.query(Cargo).delete()
            print("  ✓ Cleared cargos")
            
            # Delete monthly plans (has foreign keys to quarterly_plans)
            db.query(MonthlyPlan).delete()
            print("  ✓ Cleared monthly_plans")
            
            # Delete quarterly plans (has foreign keys to contracts)
            db.query(QuarterlyPlan).delete()
            print("  ✓ Cleared quarterly_plans")
            
            # Delete contracts (has foreign keys to customers)
            db.query(Contract).delete()
            print("  ✓ Cleared contracts")
            
            # Delete customers (no dependencies)
            db.query(Customer).delete()
            print("  ✓ Cleared customers")
        
        # Commit all changes
        db.commit()
        print("\n✅ Database cleared successfully!")
        print("   All data has been deleted. Schema structure is preserved.")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error clearing database: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    # Check for --yes flag to skip confirmation
    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv
    
    if not skip_confirmation:
        # Confirm before proceeding
        print("⚠️  WARNING: This will delete ALL data from the database!")
        print("   This action cannot be undone.")
        print()
        response = input("Are you sure you want to continue? (yes/no): ")
        
        if response.lower() not in ['yes', 'y']:
            print("❌ Operation cancelled.")
            sys.exit(0)
    
    clear_database()

