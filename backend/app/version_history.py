"""
Version History and Soft Delete Service for the Oil Lifting Program.

Provides:
1. Version History: Save snapshots of entities before changes, allowing restoration
2. Soft Delete: Move deleted entities to recycle bin instead of permanent deletion

Usage:
    from app.version_history import version_service
    
    # Save a version before making changes
    version_service.save_version(db, "cargo", cargo.id, cargo, user_initials="ADM")
    
    # Soft delete instead of hard delete
    version_service.soft_delete(db, "cargo", cargo, user_initials="ADM")
    
    # Restore from recycle bin
    version_service.restore_deleted(db, deleted_entity_id, user_initials="ADM")
    
    # Get version history
    versions = version_service.get_versions(db, "cargo", cargo_id)
    
    # Restore to a specific version
    version_service.restore_version(db, "cargo", cargo_id, version_number, user_initials="ADM")
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Type
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from app import models
from app.database import Base

logger = logging.getLogger(__name__)

# Default retention period for deleted entities (days)
DEFAULT_RETENTION_DAYS = 90


class VersionHistoryService:
    """
    Service for managing version history and soft deletes.
    """
    
    # Entity type to model mapping
    ENTITY_MODELS: Dict[str, Type[Base]] = {
        "cargo": models.Cargo,
        "contract": models.Contract,
        "monthly_plan": models.MonthlyPlan,
        "quarterly_plan": models.QuarterlyPlan,
        "customer": models.Customer,
    }
    
    # Fields to exclude from snapshots (sensitive or computed)
    EXCLUDE_FIELDS = {"_sa_instance_state", "password_hash"}
    
    def _entity_to_dict(self, entity: Base) -> Dict[str, Any]:
        """Convert a SQLAlchemy model to a dictionary for JSON serialization."""
        from datetime import date
        result = {}
        for column in entity.__table__.columns:
            if column.name in self.EXCLUDE_FIELDS:
                continue
            value = getattr(entity, column.name)
            # Handle special types
            if isinstance(value, datetime):
                value = value.isoformat()
            elif isinstance(value, date):
                value = value.isoformat()
            elif isinstance(value, (models.ContractType, models.ContractCategory, 
                                   models.PaymentMethod, models.LCStatus, 
                                   models.CargoStatus, models.UserRole, models.UserStatus)):
                value = value.value if value else None
            result[column.name] = value
        return result
    
    def _get_display_name(self, entity_type: str, entity: Base) -> str:
        """Get a human-readable display name for an entity."""
        if entity_type == "cargo":
            return f"{getattr(entity, 'cargo_id', '')} - {getattr(entity, 'vessel_name', '')}"
        elif entity_type == "contract":
            return f"{getattr(entity, 'contract_number', '')} ({getattr(entity, 'contract_id', '')})"
        elif entity_type == "monthly_plan":
            month = getattr(entity, 'month', '')
            year = getattr(entity, 'year', '')
            return f"Monthly Plan {month}/{year}"
        elif entity_type == "quarterly_plan":
            year = getattr(entity, 'contract_year', '')
            product = getattr(entity, 'product_name', '')
            return f"Quarterly Plan Year {year} - {product}"
        elif entity_type == "customer":
            return getattr(entity, 'name', '')
        return f"{entity_type}:{getattr(entity, 'id', '')}"
    
    def _get_related_info(self, entity_type: str, entity: Base, db: Session) -> Dict[str, Any]:
        """Get related entity info for context."""
        info = {}
        
        if entity_type == "cargo":
            info["monthly_plan_id"] = getattr(entity, "monthly_plan_id", None)
            info["contract_id"] = getattr(entity, "contract_id", None)
            info["customer_id"] = getattr(entity, "customer_id", None)
            # Get contract number
            if info["contract_id"]:
                contract = db.query(models.Contract).filter(
                    models.Contract.id == info["contract_id"]
                ).first()
                if contract:
                    info["contract_number"] = contract.contract_number
        
        elif entity_type == "monthly_plan":
            info["quarterly_plan_id"] = getattr(entity, "quarterly_plan_id", None)
            info["contract_id"] = getattr(entity, "contract_id", None)
        
        elif entity_type == "quarterly_plan":
            info["contract_id"] = getattr(entity, "contract_id", None)
        
        elif entity_type == "contract":
            info["customer_id"] = getattr(entity, "customer_id", None)
            # Get customer name
            if info["customer_id"]:
                customer = db.query(models.Customer).filter(
                    models.Customer.id == info["customer_id"]
                ).first()
                if customer:
                    info["customer_name"] = customer.name
        
        return info
    
    def _compare_snapshots(self, old_data: Dict, new_data: Dict) -> tuple[List[str], str]:
        """Compare two snapshots and return changed fields and summary."""
        changed_fields = []
        changes = []
        
        all_keys = set(old_data.keys()) | set(new_data.keys())
        
        for key in all_keys:
            old_val = old_data.get(key)
            new_val = new_data.get(key)
            
            if old_val != new_val:
                changed_fields.append(key)
                # Create human-readable change description
                if old_val is None:
                    changes.append(f"{key}: set to '{new_val}'")
                elif new_val is None:
                    changes.append(f"{key}: cleared (was '{old_val}')")
                else:
                    changes.append(f"{key}: '{old_val}' → '{new_val}'")
        
        summary = "; ".join(changes) if changes else "No changes"
        return changed_fields, summary
    
    # =========================================================================
    # VERSION HISTORY METHODS
    # =========================================================================
    
    def save_version(
        self,
        db: Session,
        entity_type: str,
        entity_id: int,
        entity: Base,
        user_id: Optional[int] = None,
        user_initials: Optional[str] = None,
        change_summary: Optional[str] = None
    ) -> models.EntityVersion:
        """
        Save a version snapshot of an entity.
        
        Call this BEFORE making changes to preserve the current state.
        
        Args:
            db: Database session
            entity_type: Type of entity (cargo, contract, etc.)
            entity_id: ID of the entity
            entity: The entity object to snapshot
            user_id: ID of user making the change
            user_initials: Initials of user making the change
            change_summary: Optional summary of what's changing
            
        Returns:
            The created EntityVersion record
        """
        # Get current version number
        latest_version = db.query(models.EntityVersion).filter(
            and_(
                models.EntityVersion.entity_type == entity_type,
                models.EntityVersion.entity_id == entity_id
            )
        ).order_by(desc(models.EntityVersion.version_number)).first()
        
        version_number = (latest_version.version_number + 1) if latest_version else 1
        
        # Create snapshot
        snapshot_data = self._entity_to_dict(entity)
        
        # Calculate changed fields if we have a previous version
        changed_fields = []
        if latest_version and not change_summary:
            try:
                old_data = json.loads(latest_version.snapshot_data)
                changed_fields, change_summary = self._compare_snapshots(old_data, snapshot_data)
            except json.JSONDecodeError:
                pass
        
        # Create version record
        version = models.EntityVersion(
            entity_type=entity_type,
            entity_id=entity_id,
            version_number=version_number,
            snapshot_data=json.dumps(snapshot_data),
            change_summary=change_summary,
            changed_fields=json.dumps(changed_fields) if changed_fields else None,
            created_by_id=user_id,
            created_by_initials=user_initials
        )
        
        db.add(version)
        db.flush()
        
        logger.info(f"Saved version {version_number} for {entity_type}:{entity_id}")
        return version
    
    def get_versions(
        self,
        db: Session,
        entity_type: str,
        entity_id: int,
        limit: int = 50
    ) -> List[models.EntityVersion]:
        """
        Get version history for an entity.
        
        Args:
            db: Database session
            entity_type: Type of entity
            entity_id: ID of the entity
            limit: Maximum number of versions to return
            
        Returns:
            List of EntityVersion records, newest first
        """
        return db.query(models.EntityVersion).filter(
            and_(
                models.EntityVersion.entity_type == entity_type,
                models.EntityVersion.entity_id == entity_id
            )
        ).order_by(desc(models.EntityVersion.version_number)).limit(limit).all()
    
    def get_version(
        self,
        db: Session,
        entity_type: str,
        entity_id: int,
        version_number: int
    ) -> Optional[models.EntityVersion]:
        """Get a specific version of an entity."""
        return db.query(models.EntityVersion).filter(
            and_(
                models.EntityVersion.entity_type == entity_type,
                models.EntityVersion.entity_id == entity_id,
                models.EntityVersion.version_number == version_number
            )
        ).first()
    
    def restore_version(
        self,
        db: Session,
        entity_type: str,
        entity_id: int,
        version_number: int,
        user_id: Optional[int] = None,
        user_initials: Optional[str] = None
    ) -> Optional[Base]:
        """
        Restore an entity to a specific version.
        
        This saves the current state as a new version, then applies the old version's data.
        
        Args:
            db: Database session
            entity_type: Type of entity
            entity_id: ID of the entity
            version_number: Version number to restore to
            user_id: ID of user performing the restore
            user_initials: Initials of user performing the restore
            
        Returns:
            The restored entity, or None if not found
        """
        # Get the version to restore
        version = self.get_version(db, entity_type, entity_id, version_number)
        if not version:
            logger.warning(f"Version {version_number} not found for {entity_type}:{entity_id}")
            return None
        
        # Get the current entity
        model_class = self.ENTITY_MODELS.get(entity_type)
        if not model_class:
            logger.error(f"Unknown entity type: {entity_type}")
            return None
        
        entity = db.query(model_class).filter(model_class.id == entity_id).first()
        if not entity:
            logger.warning(f"Entity {entity_type}:{entity_id} not found")
            return None
        
        # Save current state as a new version before restoring
        self.save_version(
            db, entity_type, entity_id, entity,
            user_id=user_id,
            user_initials=user_initials,
            change_summary=f"State before restore to version {version_number}"
        )
        
        # Apply the old version's data
        try:
            old_data = json.loads(version.snapshot_data)
        except json.JSONDecodeError:
            logger.error(f"Invalid snapshot data for version {version_number}")
            return None
        
        # Update entity fields (excluding id, created_at, and relationships)
        skip_fields = {"id", "created_at", "_sa_instance_state"}
        for key, value in old_data.items():
            if key in skip_fields:
                continue
            if hasattr(entity, key):
                setattr(entity, key, value)
        
        # Increment version for optimistic locking
        if hasattr(entity, 'version'):
            entity.version = (entity.version or 1) + 1
        
        # Update timestamp
        if hasattr(entity, 'updated_at'):
            entity.updated_at = datetime.now(timezone.utc)
        
        db.flush()
        
        # Save the restored state as a new version
        self.save_version(
            db, entity_type, entity_id, entity,
            user_id=user_id,
            user_initials=user_initials,
            change_summary=f"Restored to version {version_number}"
        )
        
        logger.info(f"Restored {entity_type}:{entity_id} to version {version_number}")
        return entity
    
    # =========================================================================
    # SOFT DELETE METHODS
    # =========================================================================
    
    def soft_delete(
        self,
        db: Session,
        entity_type: str,
        entity: Base,
        user_id: Optional[int] = None,
        user_initials: Optional[str] = None,
        reason: Optional[str] = None,
        retention_days: int = DEFAULT_RETENTION_DAYS
    ) -> models.DeletedEntity:
        """
        Soft delete an entity by moving it to the recycle bin.
        
        Args:
            db: Database session
            entity_type: Type of entity
            entity: The entity to delete
            user_id: ID of user performing the delete
            user_initials: Initials of user performing the delete
            reason: Optional reason for deletion
            retention_days: Days to keep in recycle bin before permanent deletion
            
        Returns:
            The DeletedEntity record
        """
        entity_id = entity.id
        
        # Save final version before deletion
        self.save_version(
            db, entity_type, entity_id, entity,
            user_id=user_id,
            user_initials=user_initials,
            change_summary="Final state before deletion"
        )
        
        # Create snapshot
        snapshot_data = self._entity_to_dict(entity)
        display_name = self._get_display_name(entity_type, entity)
        related_info = self._get_related_info(entity_type, entity, db)
        
        # Calculate permanent delete date
        permanent_delete_after = datetime.now(timezone.utc) + timedelta(days=retention_days)
        
        # Create deleted entity record
        deleted = models.DeletedEntity(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_display_name=display_name,
            snapshot_data=json.dumps(snapshot_data),
            related_info=json.dumps(related_info) if related_info else None,
            deleted_by_id=user_id,
            deleted_by_initials=user_initials,
            deletion_reason=reason,
            permanent_delete_after=permanent_delete_after
        )
        
        db.add(deleted)
        
        # Now actually delete the entity from its table
        db.delete(entity)
        db.flush()
        
        logger.info(f"Soft deleted {entity_type}:{entity_id} ({display_name})")
        return deleted
    
    def get_deleted_entities(
        self,
        db: Session,
        entity_type: Optional[str] = None,
        include_restored: bool = False,
        limit: int = 100
    ) -> List[models.DeletedEntity]:
        """
        Get list of soft-deleted entities (recycle bin).
        
        Args:
            db: Database session
            entity_type: Filter by entity type (optional)
            include_restored: Include already-restored entities
            limit: Maximum number to return
            
        Returns:
            List of DeletedEntity records
        """
        query = db.query(models.DeletedEntity)
        
        if entity_type:
            query = query.filter(models.DeletedEntity.entity_type == entity_type)
        
        if not include_restored:
            query = query.filter(models.DeletedEntity.restored_at.is_(None))
        
        return query.order_by(desc(models.DeletedEntity.deleted_at)).limit(limit).all()
    
    def get_deleted_entity(
        self,
        db: Session,
        deleted_id: int
    ) -> Optional[models.DeletedEntity]:
        """Get a specific deleted entity by its DeletedEntity ID."""
        return db.query(models.DeletedEntity).filter(
            models.DeletedEntity.id == deleted_id
        ).first()
    
    def restore_deleted(
        self,
        db: Session,
        deleted_id: int,
        user_id: Optional[int] = None,
        user_initials: Optional[str] = None
    ) -> Optional[Base]:
        """
        Restore a soft-deleted entity from the recycle bin.
        
        Args:
            db: Database session
            deleted_id: ID of the DeletedEntity record
            user_id: ID of user performing the restore
            user_initials: Initials of user performing the restore
            
        Returns:
            The restored entity, or None if not found/already restored
        """
        deleted = self.get_deleted_entity(db, deleted_id)
        if not deleted:
            logger.warning(f"Deleted entity {deleted_id} not found")
            return None
        
        if deleted.restored_at:
            logger.warning(f"Deleted entity {deleted_id} was already restored")
            return None
        
        # Get the model class
        model_class = self.ENTITY_MODELS.get(deleted.entity_type)
        if not model_class:
            logger.error(f"Unknown entity type: {deleted.entity_type}")
            return None
        
        # Parse snapshot data
        try:
            snapshot_data = json.loads(deleted.snapshot_data)
        except json.JSONDecodeError:
            logger.error(f"Invalid snapshot data for deleted entity {deleted_id}")
            return None
        
        # Remove fields that shouldn't be set on creation
        skip_fields = {"id", "created_at", "updated_at", "_sa_instance_state"}
        create_data = {k: v for k, v in snapshot_data.items() if k not in skip_fields}
        
        # Handle enum fields
        if deleted.entity_type == "cargo":
            if "contract_type" in create_data and create_data["contract_type"]:
                create_data["contract_type"] = models.ContractType(create_data["contract_type"])
            if "status" in create_data and create_data["status"]:
                create_data["status"] = models.CargoStatus(create_data["status"])
        elif deleted.entity_type == "contract":
            if "contract_type" in create_data and create_data["contract_type"]:
                create_data["contract_type"] = models.ContractType(create_data["contract_type"])
            if "payment_method" in create_data and create_data["payment_method"]:
                create_data["payment_method"] = models.PaymentMethod(create_data["payment_method"])
            if "contract_category" in create_data and create_data["contract_category"]:
                create_data["contract_category"] = models.ContractCategory(create_data["contract_category"])
        
        # Create new entity
        try:
            new_entity = model_class(**create_data)
            db.add(new_entity)
            db.flush()
            
            # Mark as restored
            deleted.restored_at = datetime.now(timezone.utc)
            deleted.restored_by_id = user_id
            deleted.restored_by_initials = user_initials
            deleted.new_entity_id = new_entity.id
            
            # Save initial version for the restored entity
            self.save_version(
                db, deleted.entity_type, new_entity.id, new_entity,
                user_id=user_id,
                user_initials=user_initials,
                change_summary=f"Restored from recycle bin (original ID: {deleted.entity_id})"
            )
            
            logger.info(f"Restored {deleted.entity_type}:{deleted.entity_id} as new entity {new_entity.id}")
            return new_entity
            
        except Exception as e:
            logger.error(f"Failed to restore deleted entity {deleted_id}: {e}")
            db.rollback()
            raise
    
    def permanent_delete(
        self,
        db: Session,
        deleted_id: int
    ) -> bool:
        """
        Permanently delete a soft-deleted entity (cannot be undone).
        
        Args:
            db: Database session
            deleted_id: ID of the DeletedEntity record
            
        Returns:
            True if deleted, False if not found
        """
        deleted = self.get_deleted_entity(db, deleted_id)
        if not deleted:
            return False
        
        # Also delete version history for this entity
        db.query(models.EntityVersion).filter(
            and_(
                models.EntityVersion.entity_type == deleted.entity_type,
                models.EntityVersion.entity_id == deleted.entity_id
            )
        ).delete()
        
        db.delete(deleted)
        db.flush()
        
        logger.info(f"Permanently deleted {deleted.entity_type}:{deleted.entity_id}")
        return True
    
    def cleanup_expired(self, db: Session) -> int:
        """
        Permanently delete entities past their retention period.
        
        Should be called periodically (e.g., daily cron job).
        
        Returns:
            Number of entities permanently deleted
        """
        now = datetime.now(timezone.utc)
        
        expired = db.query(models.DeletedEntity).filter(
            and_(
                models.DeletedEntity.restored_at.is_(None),
                models.DeletedEntity.permanent_delete_after <= now
            )
        ).all()
        
        count = 0
        for deleted in expired:
            if self.permanent_delete(db, deleted.id):
                count += 1
        
        if count > 0:
            logger.info(f"Cleaned up {count} expired deleted entities")
        
        return count


# Global service instance
version_service = VersionHistoryService()

