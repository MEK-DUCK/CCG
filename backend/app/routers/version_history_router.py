"""
Version History and Recycle Bin API Router.

Provides endpoints for:
- Viewing version history of entities
- Restoring to previous versions
- Viewing and managing the recycle bin (soft-deleted entities)
- Restoring deleted entities
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import logging

from app.database import get_db
from app.auth import require_auth, require_admin
from app import models
from app.version_history import version_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Version History"])


# =============================================================================
# SCHEMAS
# =============================================================================

class VersionSummary(BaseModel):
    """Summary of a version for list display."""
    id: int
    version_number: int
    change_summary: Optional[str] = None
    changed_fields: Optional[List[str]] = None
    created_by_initials: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class VersionDetail(BaseModel):
    """Full version details including snapshot data."""
    id: int
    entity_type: str
    entity_id: int
    version_number: int
    snapshot_data: dict
    change_summary: Optional[str] = None
    changed_fields: Optional[List[str]] = None
    created_by_id: Optional[int] = None
    created_by_initials: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class DeletedEntitySummary(BaseModel):
    """Summary of a deleted entity for recycle bin list."""
    id: int
    entity_type: str
    entity_id: int
    entity_display_name: Optional[str] = None
    deleted_by_initials: Optional[str] = None
    deleted_at: datetime
    deletion_reason: Optional[str] = None
    permanent_delete_after: Optional[datetime] = None
    restored_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class DeletedEntityDetail(BaseModel):
    """Full details of a deleted entity."""
    id: int
    entity_type: str
    entity_id: int
    entity_display_name: Optional[str] = None
    snapshot_data: dict
    related_info: Optional[dict] = None
    deleted_by_id: Optional[int] = None
    deleted_by_initials: Optional[str] = None
    deleted_at: datetime
    deletion_reason: Optional[str] = None
    permanent_delete_after: Optional[datetime] = None
    restored_at: Optional[datetime] = None
    restored_by_initials: Optional[str] = None
    new_entity_id: Optional[int] = None
    
    class Config:
        from_attributes = True


class RestoreVersionRequest(BaseModel):
    """Request to restore to a specific version."""
    version_number: int


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    entity_id: Optional[int] = None


# =============================================================================
# VERSION HISTORY ENDPOINTS
# =============================================================================

@router.get("/versions/{entity_type}/{entity_id}", response_model=List[VersionSummary])
def get_entity_versions(
    entity_type: str,
    entity_id: int,
    limit: int = Query(default=50, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Get version history for an entity.
    
    Returns a list of versions with summaries, newest first.
    """
    if entity_type not in version_service.ENTITY_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    
    versions = version_service.get_versions(db, entity_type, entity_id, limit=limit)
    
    result = []
    for v in versions:
        changed_fields = None
        if v.changed_fields:
            try:
                changed_fields = json.loads(v.changed_fields)
            except json.JSONDecodeError:
                pass
        
        result.append(VersionSummary(
            id=v.id,
            version_number=v.version_number,
            change_summary=v.change_summary,
            changed_fields=changed_fields,
            created_by_initials=v.created_by_initials,
            created_at=v.created_at
        ))
    
    return result


@router.get("/versions/{entity_type}/{entity_id}/{version_number}", response_model=VersionDetail)
def get_entity_version_detail(
    entity_type: str,
    entity_id: int,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Get full details of a specific version, including the complete snapshot.
    """
    if entity_type not in version_service.ENTITY_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    
    version = version_service.get_version(db, entity_type, entity_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail=f"Version {version_number} not found")
    
    try:
        snapshot_data = json.loads(version.snapshot_data)
    except json.JSONDecodeError:
        snapshot_data = {}
    
    changed_fields = None
    if version.changed_fields:
        try:
            changed_fields = json.loads(version.changed_fields)
        except json.JSONDecodeError:
            pass
    
    return VersionDetail(
        id=version.id,
        entity_type=version.entity_type,
        entity_id=version.entity_id,
        version_number=version.version_number,
        snapshot_data=snapshot_data,
        change_summary=version.change_summary,
        changed_fields=changed_fields,
        created_by_id=version.created_by_id,
        created_by_initials=version.created_by_initials,
        created_at=version.created_at
    )


@router.post("/versions/{entity_type}/{entity_id}/restore", response_model=MessageResponse)
def restore_entity_version(
    entity_type: str,
    entity_id: int,
    request: RestoreVersionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Restore an entity to a specific version.
    
    This creates a new version with the restored data.
    """
    if entity_type not in version_service.ENTITY_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    
    try:
        restored = version_service.restore_version(
            db, entity_type, entity_id, request.version_number,
            user_id=current_user.id,
            user_initials=current_user.initials
        )
        
        if not restored:
            raise HTTPException(status_code=404, detail="Entity or version not found")
        
        db.commit()
        
        return MessageResponse(
            message=f"Successfully restored {entity_type} to version {request.version_number}",
            entity_id=entity_id
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to restore version: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# RECYCLE BIN ENDPOINTS
# =============================================================================

@router.get("/recycle-bin", response_model=List[DeletedEntitySummary])
def get_recycle_bin(
    entity_type: Optional[str] = Query(default=None),
    include_restored: bool = Query(default=False),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Get list of soft-deleted entities (recycle bin).
    
    Optionally filter by entity type.
    """
    if entity_type and entity_type not in version_service.ENTITY_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
    
    deleted = version_service.get_deleted_entities(
        db, entity_type=entity_type, include_restored=include_restored, limit=limit
    )
    
    return [
        DeletedEntitySummary(
            id=d.id,
            entity_type=d.entity_type,
            entity_id=d.entity_id,
            entity_display_name=d.entity_display_name,
            deleted_by_initials=d.deleted_by_initials,
            deleted_at=d.deleted_at,
            deletion_reason=d.deletion_reason,
            permanent_delete_after=d.permanent_delete_after,
            restored_at=d.restored_at
        )
        for d in deleted
    ]


@router.get("/recycle-bin/{deleted_id}", response_model=DeletedEntityDetail)
def get_deleted_entity_detail(
    deleted_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Get full details of a deleted entity, including the snapshot data.
    """
    deleted = version_service.get_deleted_entity(db, deleted_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deleted entity not found")
    
    try:
        snapshot_data = json.loads(deleted.snapshot_data)
    except json.JSONDecodeError:
        snapshot_data = {}
    
    related_info = None
    if deleted.related_info:
        try:
            related_info = json.loads(deleted.related_info)
        except json.JSONDecodeError:
            pass
    
    return DeletedEntityDetail(
        id=deleted.id,
        entity_type=deleted.entity_type,
        entity_id=deleted.entity_id,
        entity_display_name=deleted.entity_display_name,
        snapshot_data=snapshot_data,
        related_info=related_info,
        deleted_by_id=deleted.deleted_by_id,
        deleted_by_initials=deleted.deleted_by_initials,
        deleted_at=deleted.deleted_at,
        deletion_reason=deleted.deletion_reason,
        permanent_delete_after=deleted.permanent_delete_after,
        restored_at=deleted.restored_at,
        restored_by_initials=deleted.restored_by_initials,
        new_entity_id=deleted.new_entity_id
    )


@router.post("/recycle-bin/{deleted_id}/restore", response_model=MessageResponse)
def restore_deleted_entity(
    deleted_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth)
):
    """
    Restore a soft-deleted entity from the recycle bin.
    
    Creates a new entity with the same data (may have a different ID).
    """
    try:
        restored = version_service.restore_deleted(
            db, deleted_id,
            user_id=current_user.id,
            user_initials=current_user.initials
        )
        
        if not restored:
            raise HTTPException(status_code=404, detail="Deleted entity not found or already restored")
        
        db.commit()
        
        return MessageResponse(
            message="Successfully restored entity from recycle bin",
            entity_id=restored.id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to restore deleted entity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/recycle-bin/{deleted_id}", response_model=MessageResponse)
def permanently_delete_entity(
    deleted_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)  # Admin only for permanent delete
):
    """
    Permanently delete an entity from the recycle bin.
    
    WARNING: This cannot be undone!
    Admin only.
    """
    try:
        success = version_service.permanent_delete(db, deleted_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Deleted entity not found")
        
        db.commit()
        
        return MessageResponse(message="Entity permanently deleted")
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to permanently delete entity: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recycle-bin/cleanup", response_model=MessageResponse)
def cleanup_expired_entities(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin)  # Admin only
):
    """
    Permanently delete all entities past their retention period.
    
    Admin only. Typically called by a scheduled job.
    """
    try:
        count = version_service.cleanup_expired(db)
        db.commit()
        
        return MessageResponse(message=f"Cleaned up {count} expired entities")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to cleanup expired entities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

