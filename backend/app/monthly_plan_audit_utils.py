"""Utility functions for monthly plan audit logging"""
import json
from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models import MonthlyPlanAuditLog, MonthlyPlan, QuarterlyPlan, Contract, Customer
from app.audit_utils import get_current_user_initials


def serialize_value(value):
    """Serialize a value to string for storage"""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def log_monthly_plan_action(
    db: Session,
    action: str,
    monthly_plan: MonthlyPlan = None,
    monthly_plan_id: int = None,
    field_name: str = None,
    old_value=None,
    new_value=None,
    description: str = None
):
    """Log a monthly plan action to the audit log"""
    
    # Get monthly plan info if plan is provided
    if monthly_plan:
        monthly_plan_id = monthly_plan.id
        month = monthly_plan.month
        year = monthly_plan.year
        quarterly_plan_id = monthly_plan.quarterly_plan_id
        
        # Get contract_id - first try from quarterly plan, then from monthly plan directly (SPOT/Range contracts)
        contract_id = None
        if quarterly_plan_id:
            quarterly_plan = db.query(QuarterlyPlan).filter(QuarterlyPlan.id == quarterly_plan_id).first()
            contract_id = quarterly_plan.contract_id if quarterly_plan else None
        
        # For SPOT/Range contracts, contract_id is stored directly on the monthly plan
        if not contract_id and hasattr(monthly_plan, 'contract_id') and monthly_plan.contract_id:
            contract_id = monthly_plan.contract_id
        
        # Get contract details
        contract_number = None
        contract_name = None
        if contract_id:
            contract = db.query(Contract).filter(Contract.id == contract_id).first()
            if contract:
                contract_number = contract.contract_number
                # Get customer name for contract name
                customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
                contract_name = customer.name if customer else None
        
        # Store full monthly plan snapshot for DELETE actions
        if action == 'DELETE':
            monthly_plan_snapshot = json.dumps({
                'id': monthly_plan.id,
                'month': monthly_plan.month,
                'year': monthly_plan.year,
                'month_quantity': monthly_plan.month_quantity,
                'number_of_liftings': monthly_plan.number_of_liftings,
                'quarterly_plan_id': monthly_plan.quarterly_plan_id,
            }, default=str)
        else:
            monthly_plan_snapshot = None
    else:
        # Try to get monthly plan info from ID
        if monthly_plan_id:
            plan = db.query(MonthlyPlan).filter(MonthlyPlan.id == monthly_plan_id).first()
            if plan:
                month = plan.month
                year = plan.year
                quarterly_plan_id = plan.quarterly_plan_id
                
                # Get contract_id - first try from quarterly plan, then from monthly plan directly (SPOT/Range contracts)
                contract_id = None
                if quarterly_plan_id:
                    quarterly_plan = db.query(QuarterlyPlan).filter(QuarterlyPlan.id == quarterly_plan_id).first()
                    contract_id = quarterly_plan.contract_id if quarterly_plan else None
                
                # For SPOT/Range contracts, contract_id is stored directly on the monthly plan
                if not contract_id and hasattr(plan, 'contract_id') and plan.contract_id:
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
                month = None
                year = None
                contract_id = None
                contract_number = None
                contract_name = None
                quarterly_plan_id = None
        else:
            month = None
            year = None
            contract_id = None
            contract_number = None
            contract_name = None
            quarterly_plan_id = None
        monthly_plan_snapshot = None
    
    # Generate description if not provided
    if not description:
        month_names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        month_str = f"{month_names[month]} {year}" if month and year else "Unknown"
        
        if action == 'CREATE':
            if field_name == 'month_quantity' and new_value is not None:
                description = f"Created monthly plan for {month_str} with quantity {new_value}"
            else:
                description = f"Created monthly plan for {month_str}"
        elif action == 'UPDATE':
            if field_name:
                description = f"Updated {field_name} from '{old_value}' to '{new_value}' in {month_str}"
            else:
                description = f"Updated monthly plan for {month_str}"
        elif action == 'DELETE':
            description = f"Deleted monthly plan for {month_str}"
        else:
            description = f"{action} on monthly plan for {month_str}"
    
    # Get user initials from context
    user_initials = get_current_user_initials()
    
    # Create audit log entry
    try:
        audit_log = MonthlyPlanAuditLog(
            monthly_plan_id=monthly_plan_id,
            monthly_plan_db_id=monthly_plan_id,
            action=action,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            month=month,
            year=year,
            contract_id=contract_id,
            contract_number=contract_number,
            contract_name=contract_name,
            quarterly_plan_id=quarterly_plan_id,
            description=description,
            monthly_plan_snapshot=monthly_plan_snapshot,
            user_initials=user_initials
        )
        
        db.add(audit_log)
        db.flush()  # Flush to get the ID without committing
        print(f"[AUDIT] Logged {action} action for monthly plan {monthly_plan_id} ({month}/{year if year else '?'})")
        return audit_log
    except Exception as e:
        print(f"[ERROR] Failed to create monthly plan audit log: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        # Don't fail the main operation if audit logging fails
        return None

