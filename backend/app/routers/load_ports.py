"""
Load Ports router - Admin management of available loading ports.
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


@router.post("/", response_model=schemas.LoadPort)
def create_load_port(port: schemas.LoadPortCreate, db: Session = Depends(get_db)):
    """Create a new load port."""
    try:
        # Check for duplicate code
        existing_code = db.query(models.LoadPort).filter(
            models.LoadPort.code == port.code.upper()
        ).first()
        if existing_code:
            raise HTTPException(status_code=400, detail=f"Load port with code '{port.code}' already exists")
        
        # Check for duplicate name
        existing_name = db.query(models.LoadPort).filter(
            models.LoadPort.name == port.name
        ).first()
        if existing_name:
            raise HTTPException(status_code=400, detail=f"Load port with name '{port.name}' already exists")
        
        db_port = models.LoadPort(
            code=port.code.upper(),
            name=port.name,
            country=port.country,
            description=port.description,
            is_active=port.is_active,
            sort_order=port.sort_order
        )
        db.add(db_port)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='LOAD_PORT',
            action='CREATE',
            entity_id=db_port.id,
            entity_name=db_port.name,
            description=f"Created load port: {db_port.name} ({db_port.code})"
        )
        
        db.commit()
        db.refresh(db_port)
        
        logger.info(f"Load port created: {db_port.code} - {db_port.name}")
        return db_port
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating load port: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating load port: {str(e)}")


@router.get("/", response_model=List[schemas.LoadPort])
def read_load_ports(
    include_inactive: bool = Query(False, description="Include inactive ports"),
    db: Session = Depends(get_db)
):
    """Get all load ports, ordered by sort_order then name."""
    try:
        query = db.query(models.LoadPort)
        if not include_inactive:
            query = query.filter(models.LoadPort.is_active == True)
        ports = query.order_by(asc(models.LoadPort.sort_order), asc(models.LoadPort.name)).all()
        return ports
    except Exception as e:
        logger.error(f"Error fetching load ports: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching load ports: {str(e)}")


@router.get("/codes", response_model=List[str])
def read_load_port_codes(
    include_inactive: bool = Query(False, description="Include inactive ports"),
    db: Session = Depends(get_db)
):
    """Get just the port codes for dropdowns."""
    try:
        query = db.query(models.LoadPort.code)
        if not include_inactive:
            query = query.filter(models.LoadPort.is_active == True)
        ports = query.order_by(asc(models.LoadPort.sort_order), asc(models.LoadPort.name)).all()
        return [p.code for p in ports]
    except Exception as e:
        logger.error(f"Error fetching load port codes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching load port codes: {str(e)}")


@router.get("/{port_id}", response_model=schemas.LoadPort)
def read_load_port(port_id: int, db: Session = Depends(get_db)):
    """Get a specific load port by ID."""
    try:
        port = db.query(models.LoadPort).filter(models.LoadPort.id == port_id).first()
        if not port:
            raise HTTPException(status_code=404, detail="Load port not found")
        return port
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching load port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching load port: {str(e)}")


@router.put("/{port_id}", response_model=schemas.LoadPort)
def update_load_port(port_id: int, port: schemas.LoadPortUpdate, db: Session = Depends(get_db)):
    """Update a load port."""
    try:
        db_port = db.query(models.LoadPort).filter(models.LoadPort.id == port_id).first()
        if not db_port:
            raise HTTPException(status_code=404, detail="Load port not found")
        
        # Check for duplicate code if being changed
        if port.code and port.code.upper() != db_port.code:
            existing = db.query(models.LoadPort).filter(
                models.LoadPort.code == port.code.upper(),
                models.LoadPort.id != port_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Load port with code '{port.code}' already exists")
        
        # Check for duplicate name if being changed
        if port.name and port.name != db_port.name:
            existing = db.query(models.LoadPort).filter(
                models.LoadPort.name == port.name,
                models.LoadPort.id != port_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Load port with name '{port.name}' already exists")
        
        # Update fields
        update_data = port.model_dump(exclude_unset=True)
        if 'code' in update_data:
            update_data['code'] = update_data['code'].upper()
        
        for field, value in update_data.items():
            old_value = getattr(db_port, field, None)
            if old_value != value:
                log_general_action(
                    db=db,
                    entity_type='LOAD_PORT',
                    action='UPDATE',
                    entity_id=db_port.id,
                    entity_name=db_port.name,
                    field_name=field,
                    old_value=old_value,
                    new_value=value
                )
            setattr(db_port, field, value)
        
        db.commit()
        db.refresh(db_port)
        
        logger.info(f"Load port updated: {db_port.code} - {db_port.name}")
        return db_port
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating load port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating load port: {str(e)}")


@router.delete("/{port_id}")
def delete_load_port(port_id: int, db: Session = Depends(get_db)):
    """Delete a load port. Consider using is_active=false instead for ports in use."""
    try:
        db_port = db.query(models.LoadPort).filter(models.LoadPort.id == port_id).first()
        if not db_port:
            raise HTTPException(status_code=404, detail="Load port not found")
        
        port_name = db_port.name
        port_code = db_port.code
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='LOAD_PORT',
            action='DELETE',
            entity_id=db_port.id,
            entity_name=port_name,
            description=f"Deleted load port: {port_name} ({port_code})",
            entity_snapshot={
                'id': db_port.id,
                'code': port_code,
                'name': port_name,
                'country': db_port.country,
                'is_active': db_port.is_active
            }
        )
        
        db.delete(db_port)
        db.commit()
        
        logger.info(f"Load port deleted: {port_name}")
        return {"message": f"Load port '{port_name}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting load port {port_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting load port: {str(e)}")


@router.post("/seed-defaults")
def seed_default_load_ports(db: Session = Depends(get_db)):
    """Seed the database with default load ports if none exist."""
    try:
        existing = db.query(models.LoadPort).count()
        if existing > 0:
            return {"message": f"Load ports already exist ({existing} ports). Skipping seed."}
        
        default_ports = [
            {"code": "MAA", "name": "Mina Al Ahmadi", "country": "Kuwait", "description": "Main oil export terminal", "sort_order": 1},
            {"code": "MAB", "name": "Mina Abdullah", "country": "Kuwait", "description": "Secondary oil terminal", "sort_order": 2},
            {"code": "SHU", "name": "Shuaiba", "country": "Kuwait", "description": "Industrial port", "sort_order": 3},
            {"code": "ZOR", "name": "Zour", "country": "Kuwait", "description": "Al Zour LNG terminal", "sort_order": 4},
        ]
        
        for p in default_ports:
            db_port = models.LoadPort(
                code=p["code"],
                name=p["name"],
                country=p["country"],
                description=p["description"],
                is_active=True,
                sort_order=p["sort_order"]
            )
            db.add(db_port)
        
        db.commit()
        logger.info(f"Seeded {len(default_ports)} default load ports")
        return {"message": f"Successfully seeded {len(default_ports)} default load ports"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding default load ports: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error seeding load ports: {str(e)}")

