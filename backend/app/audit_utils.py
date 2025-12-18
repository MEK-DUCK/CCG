"""Utility functions for cargo audit logging"""
import json
from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models import CargoAuditLog, Cargo, MonthlyPlan


def serialize_value(value):
    """Serialize a value to string for storage"""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def log_cargo_action(
    db: Session,
    action: str,
    cargo: Cargo = None,
    cargo_id: int = None,
    cargo_cargo_id: str = None,
    field_name: str = None,
    old_value=None,
    new_value=None,
    old_monthly_plan_id: int = None,
    new_monthly_plan_id: int = None,
    description: str = None
):
    """Log a cargo action to the audit log"""
    
    # Get cargo info if cargo is provided
    if cargo:
        cargo_id = cargo.id
        cargo_cargo_id = cargo.cargo_id
        # Store full cargo snapshot for DELETE actions
        if action == 'DELETE':
            cargo_snapshot = json.dumps({
                'cargo_id': cargo.cargo_id,
                'vessel_name': cargo.vessel_name,
                'customer_id': cargo.customer_id,
                'product_name': cargo.product_name,
                'contract_id': cargo.contract_id,
                'monthly_plan_id': cargo.monthly_plan_id,
                'cargo_quantity': cargo.cargo_quantity,
                'status': cargo.status.value if cargo.status else None,
                'lc_status': cargo.lc_status,
            }, default=str)
        else:
            cargo_snapshot = None
    else:
        cargo_snapshot = None
    
    # Get monthly plan info for month/year display
    old_month = None
    old_year = None
    new_month = None
    new_year = None
    
    if old_monthly_plan_id:
        old_plan = db.query(MonthlyPlan).filter(MonthlyPlan.id == old_monthly_plan_id).first()
        if old_plan:
            old_month = old_plan.month
            old_year = old_plan.year
    
    if new_monthly_plan_id:
        new_plan = db.query(MonthlyPlan).filter(MonthlyPlan.id == new_monthly_plan_id).first()
        if new_plan:
            new_month = new_plan.month
            new_year = new_plan.year
    
    # Generate description if not provided
    if not description:
        if action == 'CREATE':
            description = f"Created cargo {cargo_cargo_id}"
        elif action == 'UPDATE':
            if field_name:
                description = f"Updated {field_name} from '{old_value}' to '{new_value}'"
            else:
                description = f"Updated cargo {cargo_cargo_id}"
        elif action == 'DELETE':
            description = f"Deleted cargo {cargo_cargo_id}"
        elif action == 'MOVE':
            if old_month and new_month:
                month_names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                description = f"Moved cargo from {month_names[old_month]} {old_year} to {month_names[new_month]} {new_year}"
            else:
                description = f"Moved cargo {cargo_cargo_id}"
        else:
            description = f"{action} on cargo {cargo_cargo_id}"
    
    # Create audit log entry
    try:
        audit_log = CargoAuditLog(
            cargo_id=cargo_id,
            cargo_db_id=cargo_id,
            cargo_cargo_id=cargo_cargo_id or (cargo.cargo_id if cargo else 'UNKNOWN'),
            action=action,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            old_monthly_plan_id=old_monthly_plan_id,
            new_monthly_plan_id=new_monthly_plan_id,
            old_month=old_month,
            old_year=old_year,
            new_month=new_month,
            new_year=new_year,
            description=description,
            cargo_snapshot=cargo_snapshot
        )
        
        db.add(audit_log)
        db.flush()  # Flush to get the ID without committing
        print(f"[AUDIT] Logged {action} action for cargo {cargo_cargo_id or (cargo.cargo_id if cargo else 'UNKNOWN')}")
        return audit_log
    except Exception as e:
        print(f"[ERROR] Failed to create audit log: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        # Don't fail the main operation if audit logging fails
        return None

