"""Utility functions for general audit logging (customers, products, load_ports, inspectors, users)"""
import json
from datetime import datetime, date
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models import GeneralAuditLog
from app.audit_utils import get_current_user_initials


def serialize_value(value: Any) -> Optional[str]:
    """Serialize a value to string for storage"""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bool):
        return str(value).lower()
    return str(value)


def log_general_action(
    db: Session,
    entity_type: str,  # CUSTOMER, PRODUCT, LOAD_PORT, INSPECTOR, USER
    action: str,  # CREATE, UPDATE, DELETE
    entity_id: Optional[int] = None,
    entity_name: Optional[str] = None,
    field_name: Optional[str] = None,
    old_value: Any = None,
    new_value: Any = None,
    description: Optional[str] = None,
    entity_snapshot: Optional[dict] = None,
):
    """Log a general entity action to the audit log"""
    
    # Get user initials from context
    user_initials = get_current_user_initials()
    
    # Generate description if not provided
    if not description:
        if action == 'CREATE':
            description = f"Created {entity_type.lower().replace('_', ' ')}: {entity_name or entity_id}"
        elif action == 'UPDATE':
            if field_name:
                description = f"Updated {entity_type.lower().replace('_', ' ')} {entity_name or entity_id}: {field_name} changed from '{old_value}' to '{new_value}'"
            else:
                description = f"Updated {entity_type.lower().replace('_', ' ')}: {entity_name or entity_id}"
        elif action == 'DELETE':
            description = f"Deleted {entity_type.lower().replace('_', ' ')}: {entity_name or entity_id}"
        else:
            description = f"{action} on {entity_type.lower().replace('_', ' ')}: {entity_name or entity_id}"
    
    try:
        audit_log = GeneralAuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            action=action,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            description=description,
            entity_snapshot=json.dumps(entity_snapshot) if entity_snapshot else None,
            user_initials=user_initials
        )
        
        db.add(audit_log)
        db.flush()
        print(f"[AUDIT] Logged {action} action for {entity_type}: {entity_name or entity_id}")
        return audit_log
    except Exception as e:
        print(f"[ERROR] Failed to create general audit log: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return None

