"""
Discharge Ports router - Admin management of CIF discharge ports.
Stores port restrictions for TNG memos and voyage durations for delivery window calculation.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc
from typing import List
from app.database import get_db
from app import models, schemas
from app.general_audit_utils import log_general_action
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=schemas.DischargePort)
def create_discharge_port(port: schemas.DischargePortCreate, db: Session = Depends(get_db)):
    """Create a new discharge port."""
    try:
        # Check for duplicate name
        existing_name = db.query(models.DischargePort).filter(
            models.DischargePort.name == port.name
        ).first()
        if existing_name:
            raise HTTPException(status_code=400, detail=f"Discharge port with name '{port.name}' already exists")
        
        db_port = models.DischargePort(
            name=port.name,
            restrictions=port.restrictions,
            voyage_days_suez=port.voyage_days_suez,
            voyage_days_cape=port.voyage_days_cape,
            is_active=port.is_active,
            sort_order=port.sort_order
        )
        db.add(db_port)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='DISCHARGE_PORT',
            action='CREATE',
            entity_id=db_port.id,
            entity_name=db_port.name,
            description=f"Created discharge port: {db_port.name}"
        )
        
        db.commit()
        db.refresh(db_port)
        
        logger.info(f"Discharge port created: {db_port.name}")
        return db_port
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating discharge port: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating discharge port: {str(e)}")


@router.get("/", response_model=List[schemas.DischargePort])
def read_discharge_ports(
    include_inactive: bool = Query(False, description="Include inactive ports"),
    db: Session = Depends(get_db)
):
    """Get all discharge ports, ordered by sort_order then name."""
    try:
        query = db.query(models.DischargePort)
        if not include_inactive:
            query = query.filter(models.DischargePort.is_active == True)
        ports = query.order_by(asc(models.DischargePort.sort_order), asc(models.DischargePort.name)).all()
        return ports
    except Exception as e:
        logger.error(f"Error fetching discharge ports: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching discharge ports: {str(e)}")


@router.get("/names", response_model=List[str])
def read_discharge_port_names(
    include_inactive: bool = Query(False, description="Include inactive ports"),
    db: Session = Depends(get_db)
):
    """Get just the port names for dropdowns."""
    try:
        query = db.query(models.DischargePort.name)
        if not include_inactive:
            query = query.filter(models.DischargePort.is_active == True)
        ports = query.order_by(asc(models.DischargePort.sort_order), asc(models.DischargePort.name)).all()
        return [p.name for p in ports]
    except Exception as e:
        logger.error(f"Error fetching discharge port names: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching discharge port names: {str(e)}")


@router.get("/by-name/{port_name}", response_model=schemas.DischargePort)
def read_discharge_port_by_name(port_name: str, db: Session = Depends(get_db)):
    """Get a specific discharge port by name (for TNG generation and delivery window calc)."""
    try:
        port = db.query(models.DischargePort).filter(models.DischargePort.name == port_name).first()
        if not port:
            raise HTTPException(status_code=404, detail=f"Discharge port '{port_name}' not found")
        return port
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching discharge port {port_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching discharge port: {str(e)}")


@router.get("/{port_id}", response_model=schemas.DischargePort)
def read_discharge_port(port_id: int, db: Session = Depends(get_db)):
    """Get a specific discharge port by ID."""
    try:
        port = db.query(models.DischargePort).filter(models.DischargePort.id == port_id).first()
        if not port:
            raise HTTPException(status_code=404, detail="Discharge port not found")
        return port
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching discharge port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching discharge port: {str(e)}")


@router.put("/{port_id}", response_model=schemas.DischargePort)
def update_discharge_port(port_id: int, port: schemas.DischargePortUpdate, db: Session = Depends(get_db)):
    """Update a discharge port."""
    try:
        db_port = db.query(models.DischargePort).filter(models.DischargePort.id == port_id).first()
        if not db_port:
            raise HTTPException(status_code=404, detail="Discharge port not found")
        
        # Check for duplicate name if being changed
        if port.name and port.name != db_port.name:
            existing = db.query(models.DischargePort).filter(
                models.DischargePort.name == port.name,
                models.DischargePort.id != port_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Discharge port with name '{port.name}' already exists")
        
        # Update fields
        update_data = port.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            old_value = getattr(db_port, field, None)
            if old_value != value:
                # Don't log full restrictions text in audit (too long)
                log_old = old_value[:100] + '...' if field == 'restrictions' and old_value and len(str(old_value)) > 100 else old_value
                log_new = value[:100] + '...' if field == 'restrictions' and value and len(str(value)) > 100 else value
                log_general_action(
                    db=db,
                    entity_type='DISCHARGE_PORT',
                    action='UPDATE',
                    entity_id=db_port.id,
                    entity_name=db_port.name,
                    field_name=field,
                    old_value=log_old,
                    new_value=log_new
                )
            setattr(db_port, field, value)
        
        db.commit()
        db.refresh(db_port)
        
        logger.info(f"Discharge port updated: {db_port.name}")
        return db_port
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating discharge port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating discharge port: {str(e)}")


@router.delete("/{port_id}")
def delete_discharge_port(port_id: int, db: Session = Depends(get_db)):
    """Delete a discharge port. Consider using is_active=false instead for ports in use."""
    try:
        db_port = db.query(models.DischargePort).filter(models.DischargePort.id == port_id).first()
        if not db_port:
            raise HTTPException(status_code=404, detail="Discharge port not found")
        
        port_name = db_port.name
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='DISCHARGE_PORT',
            action='DELETE',
            entity_id=db_port.id,
            entity_name=port_name,
            description=f"Deleted discharge port: {port_name}",
            entity_snapshot={
                'id': db_port.id,
                'name': port_name,
                'voyage_days_suez': db_port.voyage_days_suez,
                'voyage_days_cape': db_port.voyage_days_cape,
                'is_active': db_port.is_active
            }
        )
        
        db.delete(db_port)
        db.commit()
        
        logger.info(f"Discharge port deleted: {port_name}")
        return {"message": f"Discharge port '{port_name}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting discharge port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting discharge port: {str(e)}")


@router.post("/seed-defaults")
def seed_default_discharge_ports(db: Session = Depends(get_db)):
    """Seed the database with default discharge ports if none exist."""
    try:
        existing = db.query(models.DischargePort).count()
        if existing > 0:
            return {"message": f"Discharge ports already exist ({existing} ports). Skipping seed."}
        
        # Default ports with restrictions and voyage durations
        default_ports = [
            {
                "name": "Shell Haven",
                "restrictions": """All vessels must be capable of connecting to two 16-inch Woodfield loading/unloading arms.
All vessels must be capable of discharging at a rate of 2500 Cubic meters per hour, or of maintaining a discharge pressure at the vessel's manifold of at least 100PSIG (7.5Bar).
It is Seller's responsibility to provide vessels which do not exceed the Maximum Limitations as follows: -
Maximum draft on arrival at S Jetty is 14.9 meters.
Max. LOA: 250 M
Max displacement of 135,000 MT
SDWT maximum 116,000 MT""",
                "voyage_days_suez": 43,
                "voyage_days_cape": 57,
                "sort_order": 1
            },
            {
                "name": "Milford Haven",
                "restrictions": """All vessels must be capable of connecting to standard loading/unloading arms.
Maximum draft on arrival is 14.5 meters.
Max. LOA: 274 M
Max displacement of 150,000 MT
SDWT maximum 125,000 MT""",
                "voyage_days_suez": 43,
                "voyage_days_cape": 57,
                "sort_order": 2
            },
            {
                "name": "Rotterdam",
                "restrictions": """All vessels must be capable of connecting to standard loading/unloading arms.
Maximum draft on arrival is 15.2 meters.
Max. LOA: 280 M
Max displacement of 160,000 MT
SDWT maximum 130,000 MT""",
                "voyage_days_suez": 39,
                "voyage_days_cape": 53,
                "sort_order": 3
            },
            {
                "name": "Le Havre",
                "restrictions": """All vessels must be capable of connecting to standard loading/unloading arms.
Maximum draft on arrival is 14.0 meters.
Max. LOA: 260 M
Max displacement of 140,000 MT
SDWT maximum 115,000 MT""",
                "voyage_days_suez": 41,
                "voyage_days_cape": 55,
                "sort_order": 4
            },
            {
                "name": "Naples",
                "restrictions": """All vessels must be capable of connecting to standard loading/unloading arms.
Maximum draft on arrival is 13.5 meters.
Max. LOA: 245 M
Max displacement of 130,000 MT
SDWT maximum 110,000 MT""",
                "voyage_days_suez": 30,
                "voyage_days_cape": 44,
                "sort_order": 5
            },
        ]
        
        for p in default_ports:
            db_port = models.DischargePort(
                name=p["name"],
                restrictions=p["restrictions"],
                voyage_days_suez=p["voyage_days_suez"],
                voyage_days_cape=p["voyage_days_cape"],
                is_active=True,
                sort_order=p["sort_order"]
            )
            db.add(db_port)
        
        db.commit()
        logger.info(f"Seeded {len(default_ports)} default discharge ports")
        return {"message": f"Successfully seeded {len(default_ports)} default discharge ports"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding default discharge ports: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error seeding discharge ports: {str(e)}")

