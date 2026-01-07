#!/usr/bin/env python3
"""
Script to clear discharge_ports table so seeding logic can run.
This will delete all discharge ports, allowing the seeding function
to add the default ports including the new ones (Djibouti, Keamari/Fotco).
"""

import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import DischargePort

def clear_discharge_ports():
    """Delete all discharge ports from the database."""
    db = SessionLocal()
    
    try:
        # Count existing ports
        count = db.query(DischargePort).count()
        print(f"📊 Found {count} discharge ports in database")
        
        if count == 0:
            print("✅ Database is already empty. Seeding will run on next startup.")
            return
        
        # Delete all discharge ports
        db.query(DischargePort).delete()
        db.commit()
        
        print(f"✅ Deleted {count} discharge ports")
        print("✅ Database is now empty. Seeding will run on next backend restart.")
        print("   Or you can call: POST /api/discharge-ports/seed-defaults")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error clearing discharge ports: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    print("🗑️  Clearing discharge_ports table...")
    clear_discharge_ports()
    print("✅ Done!")

