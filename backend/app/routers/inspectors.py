"""
Inspectors router - Admin management of available inspection companies.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc
from typing import List
from app.database import get_db
from app import models, schemas
from app.general_audit_utils import log_general_action
from app.auth import require_auth
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=schemas.Inspector)
def create_inspector(inspector: schemas.InspectorCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Create a new inspector."""
    try:
        # Check for duplicate code
        existing_code = db.query(models.Inspector).filter(
            models.Inspector.code == inspector.code.upper()
        ).first()
        if existing_code:
            raise HTTPException(status_code=400, detail=f"Inspector with code '{inspector.code}' already exists")
        
        # Check for duplicate name
        existing_name = db.query(models.Inspector).filter(
            models.Inspector.name == inspector.name
        ).first()
        if existing_name:
            raise HTTPException(status_code=400, detail=f"Inspector with name '{inspector.name}' already exists")
        
        db_inspector = models.Inspector(
            code=inspector.code.upper(),
            name=inspector.name,
            description=inspector.description,
            is_active=inspector.is_active,
            sort_order=inspector.sort_order
        )
        db.add(db_inspector)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='INSPECTOR',
            action='CREATE',
            entity_id=db_inspector.id,
            entity_name=db_inspector.name,
            description=f"Created inspector: {db_inspector.name} ({db_inspector.code})"
        )
        
        db.commit()
        db.refresh(db_inspector)
        
        logger.info(f"Inspector created: {db_inspector.code} - {db_inspector.name}")
        return db_inspector
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating inspector: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating inspector: {str(e)}")


@router.get("/", response_model=List[schemas.Inspector])
def read_inspectors(
    include_inactive: bool = Query(False, description="Include inactive inspectors"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get all inspectors, ordered by sort_order then name."""
    try:
        query = db.query(models.Inspector)
        if not include_inactive:
            query = query.filter(models.Inspector.is_active == True)
        inspectors = query.order_by(asc(models.Inspector.sort_order), asc(models.Inspector.name)).all()
        return inspectors
    except Exception as e:
        logger.error(f"Error fetching inspectors: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching inspectors: {str(e)}")


@router.get("/names", response_model=List[str])
def read_inspector_names(
    include_inactive: bool = Query(False, description="Include inactive inspectors"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """Get just the inspector names for dropdowns."""
    try:
        query = db.query(models.Inspector.name)
        if not include_inactive:
            query = query.filter(models.Inspector.is_active == True)
        inspectors = query.order_by(asc(models.Inspector.sort_order), asc(models.Inspector.name)).all()
        return [i.name for i in inspectors]
    except Exception as e:
        logger.error(f"Error fetching inspector names: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching inspector names: {str(e)}")


@router.get("/{inspector_id}", response_model=schemas.Inspector)
def read_inspector(inspector_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Get a specific inspector by ID."""
    try:
        inspector = db.query(models.Inspector).filter(models.Inspector.id == inspector_id).first()
        if not inspector:
            raise HTTPException(status_code=404, detail="Inspector not found")
        return inspector
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching inspector {inspector_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching inspector: {str(e)}")


@router.put("/{inspector_id}", response_model=schemas.Inspector)
def update_inspector(inspector_id: int, inspector: schemas.InspectorUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Update an inspector."""
    try:
        db_inspector = db.query(models.Inspector).filter(models.Inspector.id == inspector_id).first()
        if not db_inspector:
            raise HTTPException(status_code=404, detail="Inspector not found")
        
        # Check for duplicate code if being changed
        if inspector.code and inspector.code.upper() != db_inspector.code:
            existing = db.query(models.Inspector).filter(
                models.Inspector.code == inspector.code.upper(),
                models.Inspector.id != inspector_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Inspector with code '{inspector.code}' already exists")
        
        # Check for duplicate name if being changed
        if inspector.name and inspector.name != db_inspector.name:
            existing = db.query(models.Inspector).filter(
                models.Inspector.name == inspector.name,
                models.Inspector.id != inspector_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Inspector with name '{inspector.name}' already exists")
        
        # Update fields
        update_data = inspector.model_dump(exclude_unset=True)
        if 'code' in update_data:
            update_data['code'] = update_data['code'].upper()
        
        for field, value in update_data.items():
            old_value = getattr(db_inspector, field, None)
            if old_value != value:
                log_general_action(
                    db=db,
                    entity_type='INSPECTOR',
                    action='UPDATE',
                    entity_id=db_inspector.id,
                    entity_name=db_inspector.name,
                    field_name=field,
                    old_value=old_value,
                    new_value=value
                )
            setattr(db_inspector, field, value)
        
        db.commit()
        db.refresh(db_inspector)
        
        logger.info(f"Inspector updated: {db_inspector.code} - {db_inspector.name}")
        return db_inspector
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating inspector {inspector_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating inspector: {str(e)}")


@router.delete("/{inspector_id}")
def delete_inspector(inspector_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete an inspector. Consider using is_active=false instead for inspectors in use."""
    try:
        db_inspector = db.query(models.Inspector).filter(models.Inspector.id == inspector_id).first()
        if not db_inspector:
            raise HTTPException(status_code=404, detail="Inspector not found")
        
        inspector_name = db_inspector.name
        inspector_code = db_inspector.code
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='INSPECTOR',
            action='DELETE',
            entity_id=db_inspector.id,
            entity_name=inspector_name,
            description=f"Deleted inspector: {inspector_name} ({inspector_code})",
            entity_snapshot={
                'id': db_inspector.id,
                'code': inspector_code,
                'name': inspector_name,
                'description': db_inspector.description,
                'is_active': db_inspector.is_active
            }
        )
        
        db.delete(db_inspector)
        db.commit()
        
        logger.info(f"Inspector deleted: {inspector_name}")
        return {"message": f"Inspector '{inspector_name}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting inspector {inspector_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting inspector: {str(e)}")


@router.post("/seed-defaults")
def seed_default_inspectors(db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Seed the database with default inspectors if none exist."""
    try:
        existing = db.query(models.Inspector).count()
        if existing > 0:
            return {"message": f"Inspectors already exist ({existing} inspectors). Skipping seed."}
        
        default_inspectors = [
            {"code": "SGS", "name": "SGS", "description": "SGS SA - Global inspection company", "sort_order": 1},
            {"code": "INTERTEK", "name": "Intertek", "description": "Intertek Group plc", "sort_order": 2},
            {"code": "SAYBOLT", "name": "Saybolt", "description": "Core Laboratories - Saybolt", "sort_order": 3},
            {"code": "BUREAU", "name": "Bureau Veritas", "description": "Bureau Veritas SA", "sort_order": 4},
            {"code": "AMSPEC", "name": "AmSpec", "description": "AmSpec LLC", "sort_order": 5},
        ]
        
        for i in default_inspectors:
            db_inspector = models.Inspector(
                code=i["code"],
                name=i["name"],
                description=i["description"],
                is_active=True,
                sort_order=i["sort_order"]
            )
            db.add(db_inspector)
        
        db.commit()
        logger.info(f"Seeded {len(default_inspectors)} default inspectors")
        return {"message": f"Successfully seeded {len(default_inspectors)} default inspectors"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding default inspectors: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error seeding inspectors: {str(e)}")

