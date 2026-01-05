"""Utility functions for contract audit logging"""
import json
from datetime import datetime, date
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models import ContractAuditLog, Contract, Customer
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


def get_contract_snapshot(contract: Contract) -> dict:
    """Create a snapshot of a contract for audit logging"""
    return {
        "id": contract.id,
        "contract_id": contract.contract_id,
        "contract_number": contract.contract_number,
        "contract_type": contract.contract_type,
        "contract_category": str(contract.contract_category) if contract.contract_category else None,
        "payment_method": contract.payment_method,
        "start_period": str(contract.start_period) if contract.start_period else None,
        "end_period": str(contract.end_period) if contract.end_period else None,
        "fiscal_start_month": contract.fiscal_start_month,
        "products": contract.products,
        "discharge_ranges": contract.discharge_ranges,
        "additives_required": getattr(contract, "additives_required", None),
        "fax_received": contract.fax_received,
        "fax_received_date": str(contract.fax_received_date) if contract.fax_received_date else None,
        "concluded_memo_received": contract.concluded_memo_received,
        "concluded_memo_received_date": str(contract.concluded_memo_received_date) if contract.concluded_memo_received_date else None,
        "remarks": getattr(contract, "remarks", None),
        "customer_id": contract.customer_id,
        "created_at": str(contract.created_at) if contract.created_at else None,
        "updated_at": str(contract.updated_at) if contract.updated_at else None,
    }


def log_contract_action(
    db: Session,
    action: str,  # CREATE, UPDATE, DELETE
    contract: Contract = None,
    contract_id: int = None,
    field_name: Optional[str] = None,
    old_value: Any = None,
    new_value: Any = None,
    description: Optional[str] = None,
    contract_snapshot: Optional[dict] = None,
):
    """Log a contract action to the audit log"""
    
    # Get user initials from context
    user_initials = get_current_user_initials()
    
    # Get contract info
    if contract:
        contract_id = contract.id
        contract_number = contract.contract_number
        customer_id = contract.customer_id
    else:
        contract_number = None
        customer_id = None
    
    # Get customer name
    customer_name = None
    if customer_id:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if customer:
            customer_name = customer.name
    
    # Generate description if not provided
    if not description:
        contract_ref = contract_number or contract_id or "Unknown"
        if action == 'CREATE':
            description = f"Created contract: {contract_ref}"
            if customer_name:
                description += f" for {customer_name}"
        elif action == 'UPDATE':
            if field_name:
                description = f"Updated contract {contract_ref}: {field_name} changed"
            else:
                description = f"Updated contract: {contract_ref}"
        elif action == 'DELETE':
            description = f"Deleted contract: {contract_ref}"
            if customer_name:
                description += f" ({customer_name})"
        else:
            description = f"{action} on contract: {contract_ref}"
    
    # Create snapshot if not provided and contract is available
    if contract_snapshot is None and contract:
        contract_snapshot = get_contract_snapshot(contract)
    
    try:
        audit_log = ContractAuditLog(
            contract_id=contract_id,
            contract_db_id=contract_id,
            action=action,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            contract_number=contract_number,
            customer_name=customer_name,
            description=description,
            user_initials=user_initials
        )
        
        db.add(audit_log)
        db.flush()
        print(f"[AUDIT] Logged {action} action for contract {contract_number or contract_id}")
        return audit_log
    except Exception as e:
        print(f"[ERROR] Failed to create contract audit log: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return None


def log_contract_field_changes(
    db: Session,
    contract: Contract,
    old_values: dict,
    new_values: dict,
):
    """Log individual field changes for a contract update"""
    
    # Fields to track
    tracked_fields = [
        'contract_number', 'contract_type', 'contract_category', 'payment_method',
        'start_period', 'end_period', 'fiscal_start_month', 'products',
        'discharge_ranges', 'additives_required',
        'fax_received', 'fax_received_date', 'concluded_memo_received',
        'concluded_memo_received_date', 'remarks', 'customer_id'
    ]
    
    changes_logged = []
    
    for field in tracked_fields:
        old_val = old_values.get(field)
        new_val = new_values.get(field)
        
        # Normalize values for comparison
        old_str = serialize_value(old_val)
        new_str = serialize_value(new_val)
        
        if old_str != new_str:
            audit_log = log_contract_action(
                db=db,
                action='UPDATE',
                contract=contract,
                field_name=field,
                old_value=old_val,
                new_value=new_val,
            )
            if audit_log:
                changes_logged.append(field)
    
    return changes_logged


