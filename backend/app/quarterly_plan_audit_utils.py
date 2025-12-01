"""Utility functions for quarterly plan audit logging"""
import json
from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models import QuarterlyPlanAuditLog, QuarterlyPlan, Contract, Customer


def serialize_value(value):
    """Serialize a value to string for storage"""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def log_quarterly_plan_action(
    db: Session,
    action: str,
    quarterly_plan: QuarterlyPlan = None,
    quarterly_plan_id: int = None,
    field_name: str = None,
    old_value=None,
    new_value=None,
    description: str = None
):
    """Log a quarterly plan action to the audit log"""
    
    # Get quarterly plan info if plan is provided
    if quarterly_plan:
        quarterly_plan_id = quarterly_plan.id
        contract_id = quarterly_plan.contract_id
        
        # Get contract details
        contract_number = None
        contract_name = None
        if contract_id:
            contract = db.query(Contract).filter(Contract.id == contract_id).first()
            if contract:
                contract_number = contract.contract_number
                customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
                contract_name = customer.name if customer else None
        
        # Store full quarterly plan snapshot for DELETE actions
        if action == 'DELETE':
            quarterly_plan_snapshot = json.dumps({
                'id': quarterly_plan.id,
                'q1_quantity': quarterly_plan.q1_quantity,
                'q2_quantity': quarterly_plan.q2_quantity,
                'q3_quantity': quarterly_plan.q3_quantity,
                'q4_quantity': quarterly_plan.q4_quantity,
                'contract_id': quarterly_plan.contract_id,
            }, default=str)
        else:
            quarterly_plan_snapshot = None
    else:
        # Try to get quarterly plan info from ID
        if quarterly_plan_id:
            plan = db.query(QuarterlyPlan).filter(QuarterlyPlan.id == quarterly_plan_id).first()
            if plan:
                contract_id = plan.contract_id
                # Get contract details
                contract_number = None
                contract_name = None
                if contract_id:
                    contract = db.query(Contract).filter(Contract.id == contract_id).first()
                    if contract:
                        contract_number = contract.contract_number
                        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
                        contract_name = customer.name if customer else None
            else:
                contract_id = None
                contract_number = None
                contract_name = None
        else:
            contract_id = None
            contract_number = None
            contract_name = None
        quarterly_plan_snapshot = None
    
    # Generate description if not provided
    if not description:
        if action == 'CREATE':
            description = "Created quarterly plan"
        elif action == 'UPDATE':
            if field_name:
                description = f"Updated {field_name} from '{old_value}' to '{new_value}'"
            else:
                description = "Updated quarterly plan"
        elif action == 'DELETE':
            description = "Deleted quarterly plan"
        else:
            description = f"{action} on quarterly plan"
    
    # Create audit log entry
    try:
        audit_log = QuarterlyPlanAuditLog(
            quarterly_plan_id=quarterly_plan_id,
            action=action,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            contract_id=contract_id,
            contract_number=contract_number,
            contract_name=contract_name,
            description=description,
            quarterly_plan_snapshot=quarterly_plan_snapshot
        )
        
        db.add(audit_log)
        db.flush()  # Flush to get the ID without committing
        print(f"[AUDIT] Logged {action} action for quarterly plan {quarterly_plan_id}")
        return audit_log
    except Exception as e:
        print(f"[ERROR] Failed to create quarterly plan audit log: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        # Don't fail the main operation if audit logging fails
        return None

