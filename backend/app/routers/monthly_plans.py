from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Dict
from calendar import month_name
import logging

from app.database import get_db
from app import models, schemas
from app.monthly_plan_audit_utils import log_monthly_plan_action
from app.models import CargoStatus
from app.errors import (
    monthly_plan_not_found,
    quarterly_plan_not_found,
    quantity_exceeds_plan,
    plan_has_completed_cargos,
    plan_has_cargos,
    invalid_move_direction,
    to_http_exception,
    ValidationError,
    ErrorCode,
)
from app.config import MIN_YEAR, MAX_YEAR

logger = logging.getLogger(__name__)
router = APIRouter()


def get_cargo_info(monthly_plan_id: int, db: Session) -> Dict:
    """Get information about cargos linked to this monthly plan"""
    cargos = db.query(models.Cargo).filter(
        models.Cargo.monthly_plan_id == monthly_plan_id
    ).all()
    
    # A cargo is "completed" if it has COMPLETED_LOADING (FOB) or DISCHARGE_COMPLETE (CIF)
    completed_cargos = [c for c in cargos if c.status in (CargoStatus.COMPLETED_LOADING, CargoStatus.DISCHARGE_COMPLETE)]
    
    return {
        'total_cargos': len(cargos),
        'completed_cargos': len(completed_cargos),
        'cargo_ids': [c.cargo_id for c in cargos],
        'completed_cargo_ids': [c.cargo_id for c in completed_cargos],
        'has_completed_cargos': len(completed_cargos) > 0,
        'is_locked': len(completed_cargos) > 0
    }


@router.post("/", response_model=schemas.MonthlyPlan)
def create_monthly_plan(plan: schemas.MonthlyPlanCreate, db: Session = Depends(get_db)):
    # Validate month/year
    if plan.month < 1 or plan.month > 12:
        raise HTTPException(status_code=400, detail=f"Invalid month: {plan.month}. Must be 1-12.")
    if plan.year < MIN_YEAR or plan.year > MAX_YEAR:
        raise HTTPException(status_code=400, detail=f"Invalid year: {plan.year}. Must be {MIN_YEAR}-{MAX_YEAR}.")
    
    # Check if this is a SPOT contract (uses contract_id instead of quarterly_plan_id)
    is_spot_contract = plan.contract_id is not None and plan.quarterly_plan_id is None
    
    if is_spot_contract:
        # SPOT contract - verify contract exists
        contract = db.query(models.Contract).filter(models.Contract.id == plan.contract_id).first()
        if not contract:
            raise HTTPException(status_code=404, detail=f"Contract {plan.contract_id} not found")
        
        # For SPOT contracts, we don't validate against quarterly plan quantities
        db_plan = models.MonthlyPlan(
            month=plan.month,
            year=plan.year,
            month_quantity=plan.month_quantity,
            number_of_liftings=plan.number_of_liftings,
            planned_lifting_sizes=plan.planned_lifting_sizes,
            laycan_5_days=plan.laycan_5_days,
            laycan_2_days=plan.laycan_2_days,
            laycan_2_days_remark=getattr(plan, "laycan_2_days_remark", None),
            loading_month=getattr(plan, "loading_month", None),
            loading_window=getattr(plan, "loading_window", None),
            delivery_month=getattr(plan, "delivery_month", None),
            delivery_window=getattr(plan, "delivery_window", None),
            delivery_window_remark=getattr(plan, "delivery_window_remark", None),
            combi_group_id=getattr(plan, "combi_group_id", None),
            quarterly_plan_id=None,  # No quarterly plan for SPOT
            contract_id=plan.contract_id,
            product_name=getattr(plan, "product_name", None),
        )
    else:
        # Regular contract - verify quarterly plan exists
        quarterly_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan.quarterly_plan_id).first()
        if not quarterly_plan:
            raise to_http_exception(quarterly_plan_not_found(plan.quarterly_plan_id))
        
        # Calculate quarterly total
        quarterly_total = (quarterly_plan.q1_quantity or 0) + (quarterly_plan.q2_quantity or 0) + (quarterly_plan.q3_quantity or 0) + (quarterly_plan.q4_quantity or 0)
        
        # Get existing monthly plans for this quarterly plan
        existing_monthly_plans = db.query(models.MonthlyPlan).filter(
            models.MonthlyPlan.quarterly_plan_id == plan.quarterly_plan_id
        ).all()
        
        used_quantity = sum(mp.month_quantity for mp in existing_monthly_plans)
        remaining_quantity = quarterly_total - used_quantity
        
        # Validate monthly quantity doesn't exceed remaining quarterly quantity
        if plan.month_quantity > remaining_quantity:
            raise to_http_exception(quantity_exceeds_plan(plan.month_quantity, remaining_quantity, quarterly_total))
        
        db_plan = models.MonthlyPlan(
            month=plan.month,
            year=plan.year,
            month_quantity=plan.month_quantity,
            number_of_liftings=plan.number_of_liftings,
            planned_lifting_sizes=plan.planned_lifting_sizes,
            laycan_5_days=plan.laycan_5_days,
            laycan_2_days=plan.laycan_2_days,
            laycan_2_days_remark=getattr(plan, "laycan_2_days_remark", None),
            loading_month=getattr(plan, "loading_month", None),
            loading_window=getattr(plan, "loading_window", None),
            delivery_month=getattr(plan, "delivery_month", None),
            delivery_window=getattr(plan, "delivery_window", None),
            delivery_window_remark=getattr(plan, "delivery_window_remark", None),
            combi_group_id=getattr(plan, "combi_group_id", None),
            quarterly_plan_id=plan.quarterly_plan_id
        )
    
    db.add(db_plan)
    db.flush()
    
    # Log the creation with quantity information
    log_monthly_plan_action(
        db=db,
        action='CREATE',
        monthly_plan=db_plan,
        field_name='month_quantity',
        old_value=0.0,
        new_value=db_plan.month_quantity
    )

    # Also log CIF window/month fields + remark fields on creation
    for field_name in ['loading_month', 'loading_window', 'delivery_month', 'delivery_window', 'laycan_2_days_remark', 'delivery_window_remark']:
        val = getattr(db_plan, field_name, None)
        if val is not None and val != '':
            log_monthly_plan_action(
                db=db,
                action='CREATE',
                monthly_plan=db_plan,
                field_name=field_name,
                old_value=None,
                new_value=val
    )
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Monthly plan created: id={db_plan.id}, month={plan.month}/{plan.year}, qty={plan.month_quantity}")
    return db_plan


@router.get("/", response_model=List[schemas.MonthlyPlan])
def read_monthly_plans(
    quarterly_plan_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(models.MonthlyPlan)
        if quarterly_plan_id:
            query = query.filter(models.MonthlyPlan.quarterly_plan_id == quarterly_plan_id)
        plans = query.offset(skip).limit(limit).all()
        return plans
    except SQLAlchemyError as e:
        logger.error(f"Database error reading monthly plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading monthly plans")


@router.get("/bulk", response_model=List[schemas.MonthlyPlanEnriched])
def get_monthly_plans_bulk(
    months: str = Query(..., description="Comma-separated months, e.g., '1,2,3'"),
    year: int = Query(..., description="Year to filter by"),
    include_zero_quantity: bool = Query(False, description="Include plans with 0 quantity"),
    db: Session = Depends(get_db)
):
    """
    Get all monthly plans for given months/year across ALL contracts in a single query.
    Returns monthly plans with their quarterly plan, contract, and customer info embedded.
    """
    try:
        # Parse months
        month_list = [int(m.strip()) for m in months.split(",") if m.strip()]
        if not month_list:
            raise HTTPException(status_code=400, detail="At least one month is required")
        
        # Validate months
        for m in month_list:
            if m < 1 or m > 12:
                raise HTTPException(status_code=400, detail=f"Invalid month: {m}")
        
        # Build query with eager loading of all related data
        # Load both quarterly_plan->contract path AND direct contract for SPOT contracts
        query = db.query(models.MonthlyPlan).options(
            joinedload(models.MonthlyPlan.quarterly_plan)
            .joinedload(models.QuarterlyPlan.contract)
            .joinedload(models.Contract.customer),
            # Also load direct contract relationship for SPOT contracts
            joinedload(models.MonthlyPlan.contract)
            .joinedload(models.Contract.customer)
        ).filter(
            models.MonthlyPlan.month.in_(month_list),
            models.MonthlyPlan.year == year
        )
        
        if not include_zero_quantity:
            query = query.filter(models.MonthlyPlan.month_quantity > 0)
        
        query = query.order_by(
            models.MonthlyPlan.quarterly_plan_id,
            models.MonthlyPlan.month
        )
        
        plans = query.all()
        return plans
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid month format: {str(e)}")
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_monthly_plans_bulk: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading monthly plans")


@router.get("/{plan_id}", response_model=schemas.MonthlyPlan)
def read_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    return plan


@router.put("/{plan_id}", response_model=schemas.MonthlyPlan)
def update_monthly_plan(plan_id: int, plan: schemas.MonthlyPlanUpdate, db: Session = Depends(get_db)):
    """
    Update a monthly plan with optimistic locking.
    
    If client sends 'version', we verify it matches the current version
    to prevent lost updates from concurrent edits.
    """
    # Lock the monthly plan row to prevent concurrent modifications
    db_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Check if plan has completed cargos (locked)
    cargo_info = get_cargo_info(plan_id, db)
    
    # Use exclude_unset=True but keep explicitly set None/empty values
    # This allows clearing fields by sending null or empty string
    update_data = plan.dict(exclude_unset=True)
    
    # Optimistic locking check - version is REQUIRED to prevent lost updates
    client_version = update_data.pop('version', None)
    current_version = getattr(db_plan, 'version', 1)
    if client_version is None:
        raise HTTPException(
            status_code=400,
            detail="Version field is required for updates. Please refresh the page and try again."
        )
    if client_version != current_version:
        raise HTTPException(
            status_code=409,
            detail=f"Monthly plan was modified by another user. Please refresh and try again. (Your version: {client_version}, Current version: {current_version})"
        )
    
    # Validate month/year if being updated
    if 'month' in update_data:
        if update_data['month'] < 1 or update_data['month'] > 12:
            raise HTTPException(status_code=400, detail=f"Invalid month: {update_data['month']}. Must be 1-12.")
    if 'year' in update_data:
        if update_data['year'] < MIN_YEAR or update_data['year'] > MAX_YEAR:
            raise HTTPException(status_code=400, detail=f"Invalid year: {update_data['year']}. Must be {MIN_YEAR}-{MAX_YEAR}.")
    
    # Prevent month/year changes if there are completed cargos
    if cargo_info['has_completed_cargos']:
        if 'month' in update_data and update_data['month'] != db_plan.month:
            raise to_http_exception(plan_has_completed_cargos(
                cargo_info['completed_cargos'], 
                cargo_info['completed_cargo_ids']
            ))
        if 'year' in update_data and update_data['year'] != db_plan.year:
            raise to_http_exception(plan_has_completed_cargos(
                cargo_info['completed_cargos'], 
                cargo_info['completed_cargo_ids']
            ))
    
    # Get quarterly plan for validation
    quarterly_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == db_plan.quarterly_plan_id).first()
    if not quarterly_plan:
        raise to_http_exception(quarterly_plan_not_found(db_plan.quarterly_plan_id))
    
    # Calculate quarterly total
    quarterly_total = (quarterly_plan.q1_quantity or 0) + (quarterly_plan.q2_quantity or 0) + (quarterly_plan.q3_quantity or 0) + (quarterly_plan.q4_quantity or 0)
    
    # Get existing monthly plans for this quarterly plan (excluding current plan)
    existing_monthly_plans = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.quarterly_plan_id == db_plan.quarterly_plan_id,
        models.MonthlyPlan.id != plan_id
    ).all()
    
    used_quantity = sum(mp.month_quantity for mp in existing_monthly_plans)
    remaining_quantity = quarterly_total - used_quantity
    
    new_month_quantity = plan.month_quantity if plan.month_quantity is not None else db_plan.month_quantity
    
    if new_month_quantity > remaining_quantity:
        raise to_http_exception(quantity_exceeds_plan(new_month_quantity, remaining_quantity, quarterly_total))
    
    # Store old values for audit logging
    old_values = {}
    for field in [
        'month_quantity', 'number_of_liftings', 'planned_lifting_sizes',
        'laycan_5_days', 'laycan_2_days', 'laycan_2_days_remark',
        'loading_month', 'loading_window', 'delivery_month', 'delivery_window',
        'delivery_window_remark', 'month', 'year',
    ]:
        if hasattr(db_plan, field):
            old_values[field] = getattr(db_plan, field)
    
    # Check if any fields are actually changing
    changed_fields = []
    for field, value in update_data.items():
        old_val = old_values.get(field)
        if old_val != value:
            changed_fields.append(field)
    
    # Apply the changes
    for field, value in update_data.items():
        old_val = old_values.get(field)
        setattr(db_plan, field, value)
        
        if old_val != value:
            if field == 'month_quantity':
                old_qty = float(old_val) if old_val is not None else 0.0
                new_qty = float(value) if value is not None else 0.0
                
                if new_qty == 0.0 and old_qty > 0.0:
                    log_monthly_plan_action(db=db, action='DELETE', monthly_plan=db_plan, field_name=field, old_value=old_val, new_value=value)
                elif new_qty > 0.0 and old_qty == 0.0:
                    log_monthly_plan_action(db=db, action='CREATE', monthly_plan=db_plan, field_name=field, old_value=old_val, new_value=value)
                else:
                    log_monthly_plan_action(db=db, action='UPDATE', monthly_plan=db_plan, field_name=field, old_value=old_val, new_value=value)
            else:
                log_monthly_plan_action(db=db, action='UPDATE', monthly_plan=db_plan, field_name=field, old_value=old_val, new_value=value)
    
    # Increment version for optimistic locking
    db_plan.version = getattr(db_plan, 'version', 1) + 1
    
    # Save version history AFTER making changes (snapshot contains NEW state)
    if changed_fields:
        from app.version_history import version_service
        change_summary = f"Updated: {', '.join(changed_fields)}"
        version_service.save_version(
            db, "monthly_plan", db_plan.id, db_plan,
            user_initials="SYS",
            change_summary=change_summary
        )
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Monthly plan {plan_id} updated")
    return db_plan


@router.put("/{plan_id}/move", response_model=schemas.MonthlyPlan)
def move_monthly_plan(plan_id: int, move_request: schemas.MonthlyPlanMoveRequest, db: Session = Depends(get_db)):
    """
    Move a monthly plan to a different month (defer or advance).
    If the plan has cargos, they will be moved along with it (with version history).
    Blocked if the plan has COMPLETED cargos (completed operations can't be moved).
    """
    from app.version_history import version_service
    
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Check cargo status - only block if cargos are COMPLETED
    cargo_info = get_cargo_info(plan_id, db)
    if cargo_info['has_completed_cargos']:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move monthly plan. It has {cargo_info['completed_cargos']} completed cargo(s): "
                   f"{', '.join(cargo_info['completed_cargo_ids'])}. Completed operations cannot be moved."
        )
    
    # Validate move direction matches action
    old_date = db_plan.year * 12 + db_plan.month
    new_date = move_request.target_year * 12 + move_request.target_month
    
    if move_request.action == "DEFER" and new_date <= old_date:
        raise to_http_exception(invalid_move_direction("DEFER", "Cannot defer to an earlier or same month. Use ADVANCE action instead."))
    elif move_request.action == "ADVANCE" and new_date >= old_date:
        raise to_http_exception(invalid_move_direction("ADVANCE", "Cannot advance to a later or same month. Use DEFER action instead."))
    
    # Store old values for audit
    old_month = db_plan.month
    old_year = db_plan.year
    old_month_name = month_name[old_month]
    new_month_name = month_name[move_request.target_month]
    action_verb = "Deferred" if move_request.action == "DEFER" else "Advanced"
    
    # Save version history for the monthly plan before moving
    version_service.save_version(
        db, "monthly_plan", db_plan.id, db_plan,
        user_initials="SYS",
        change_summary=f"{action_verb} from {old_month_name} {old_year} to {new_month_name} {move_request.target_year}"
    )
    
    # If there are cargos, save version history and update them
    cargos = db.query(models.Cargo).filter(models.Cargo.monthly_plan_id == plan_id).all()
    moved_cargo_ids = []
    
    for cargo in cargos:
        # Save version history for each cargo before the move
        version_service.save_version(
            db, "cargo", cargo.id, cargo,
            user_initials="SYS",
            change_summary=f"{action_verb} with monthly plan from {old_month_name} {old_year} to {new_month_name} {move_request.target_year}"
        )
        
        # Log the cargo move in the cargo audit log
        audit_entry = models.CargoAuditLog(
            cargo_id=cargo.id,
            cargo_db_id=cargo.id,
            cargo_cargo_id=cargo.cargo_id,
            action=move_request.action,
            field_name='monthly_plan_month',
            old_value=f"{old_month_name} {old_year}",
            new_value=f"{new_month_name} {move_request.target_year}",
            old_month=old_month,
            old_year=old_year,
            new_month=move_request.target_month,
            new_year=move_request.target_year,
            description=move_request.reason or f"{action_verb} with monthly plan"
        )
        db.add(audit_entry)
        moved_cargo_ids.append(cargo.cargo_id)
        
        logger.info(f"Cargo {cargo.cargo_id} {action_verb.lower()} with monthly plan: {old_month_name} {old_year} -> {new_month_name} {move_request.target_year}")
    
    # Update the monthly plan
    db_plan.month = move_request.target_month
    db_plan.year = move_request.target_year
    db_plan.version = (db_plan.version or 1) + 1  # Increment version for optimistic locking
    
    # Build description for monthly plan audit log
    description = f"{action_verb} {db_plan.month_quantity:,.0f} KT from {old_month_name} {old_year} to {new_month_name} {move_request.target_year}"
    if moved_cargo_ids:
        description += f" (with cargo(s): {', '.join(moved_cargo_ids)})"
    if move_request.reason:
        description += f" - Reason: {move_request.reason}"
    
    log_monthly_plan_action(
        db=db,
        action=move_request.action,
        monthly_plan=db_plan,
        field_name='month',
        old_value=f"{old_month}/{old_year}",
        new_value=f"{move_request.target_month}/{move_request.target_year}",
        description=description
    )
    
    db.commit()
    db.refresh(db_plan)
    
    logger.info(f"Monthly plan {plan_id} {action_verb.lower()}: {old_month_name} {old_year} -> {new_month_name} {move_request.target_year}")
    if moved_cargo_ids:
        logger.info(f"Moved {len(moved_cargo_ids)} cargo(s) with the plan: {', '.join(moved_cargo_ids)}")
    
    return db_plan


@router.delete("/{plan_id}")
def delete_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    cargo_info = get_cargo_info(plan_id, db)
    
    if cargo_info['has_completed_cargos']:
        raise to_http_exception(plan_has_completed_cargos(
            cargo_info['completed_cargos'], 
            cargo_info['completed_cargo_ids']
        ))
    
    if cargo_info['total_cargos'] > 0:
        raise to_http_exception(plan_has_cargos(cargo_info['total_cargos'], cargo_info['cargo_ids']))
    
    try:
        log_monthly_plan_action(db=db, action='DELETE', monthly_plan=db_plan)
        db.flush()

        db.query(models.MonthlyPlanAuditLog).filter(
            models.MonthlyPlanAuditLog.monthly_plan_id == db_plan.id
        ).update(
            {models.MonthlyPlanAuditLog.monthly_plan_id: None, models.MonthlyPlanAuditLog.monthly_plan_db_id: db_plan.id},
            synchronize_session=False
        )
    
        db.delete(db_plan)
        db.commit()
        logger.info(f"Monthly plan {plan_id} deleted")
        return {"message": "Monthly plan deleted successfully"}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error deleting monthly plan {plan_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting monthly plan")


@router.get("/{plan_id}/status")
def get_monthly_plan_status(plan_id: int, db: Session = Depends(get_db)):
    """Get monthly plan status including cargo information and lock status"""
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    cargo_info = get_cargo_info(plan_id, db)
    
    return {
        'monthly_plan_id': plan_id,
        'month': db_plan.month,
        'year': db_plan.year,
        'is_locked': cargo_info['is_locked'],
        'has_cargos': cargo_info['total_cargos'] > 0,
        'has_completed_cargos': cargo_info['has_completed_cargos'],
        'total_cargos': cargo_info['total_cargos'],
        'completed_cargos': cargo_info['completed_cargos'],
        'cargo_ids': cargo_info['cargo_ids'],
        'completed_cargo_ids': cargo_info['completed_cargo_ids']
    }


@router.post("/{plan_id}/authority-topup", response_model=schemas.MonthlyPlan)
def add_authority_topup(plan_id: int, topup: schemas.AuthorityTopUpRequest, db: Session = Depends(get_db)):
    """
    Add an authority top-up to a specific monthly plan cargo.
    This CASCADE updates quantities at all levels:
    - Monthly Plan: increases month_quantity
    - Quarterly Plan: increases the relevant quarter's quantity AND tracks top-up separately
    - Contract: adds to authority_topups JSON array
    
    Example: March cargo was 100 KT, got authority to load 120 KT -> add 20 KT top-up
    """
    import json
    
    # Lock the monthly plan row to prevent concurrent modifications
    db_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Get quarterly plan and contract for cascading updates - also lock them
    quarterly_plan = db.query(models.QuarterlyPlan).filter(
        models.QuarterlyPlan.id == db_plan.quarterly_plan_id
    ).with_for_update().first()
    
    if not quarterly_plan:
        raise HTTPException(status_code=400, detail="Monthly plan has no associated quarterly plan")
    
    # Lock the contract row as well
    contract = db.query(models.Contract).filter(
        models.Contract.id == quarterly_plan.contract_id
    ).with_for_update().first()
    
    if not contract:
        raise HTTPException(status_code=400, detail="Quarterly plan has no associated contract")
    
    customer = db.query(models.Customer).filter(
        models.Customer.id == contract.customer_id
    ).first()
    
    # Determine which quarter this month belongs to
    month = db_plan.month
    if month in [1, 2, 3]:
        quarter = 'Q1'
        quarter_field = 'q1_quantity'
        topup_field = 'q1_topup'
    elif month in [4, 5, 6]:
        quarter = 'Q2'
        quarter_field = 'q2_quantity'
        topup_field = 'q2_topup'
    elif month in [7, 8, 9]:
        quarter = 'Q3'
        quarter_field = 'q3_quantity'
        topup_field = 'q3_topup'
    else:
        quarter = 'Q4'
        quarter_field = 'q4_quantity'
        topup_field = 'q4_topup'
    
    # ========================
    # 1. UPDATE MONTHLY PLAN
    # ========================
    old_topup_qty = db_plan.authority_topup_quantity or 0
    old_month_qty = db_plan.month_quantity
    
    db_plan.authority_topup_quantity = old_topup_qty + topup.quantity
    db_plan.authority_topup_reference = topup.authority_reference
    db_plan.authority_topup_reason = topup.reason
    db_plan.authority_topup_date = topup.authorization_date
    db_plan.month_quantity = old_month_qty + topup.quantity
    
    month_str = month_name[db_plan.month]
    product_name = quarterly_plan.product_name or "Unknown"
    
    # Log monthly plan changes
    log_monthly_plan_action(
        db=db,
        action='AUTHORITY_TOPUP',
        monthly_plan=db_plan,
        field_name='authority_topup_quantity',
        old_value=old_topup_qty,
        new_value=db_plan.authority_topup_quantity,
        description=f"Authority top-up: +{topup.quantity:,.0f} KT for {month_str} {db_plan.year} {product_name} (Ref: {topup.authority_reference})"
    )
    
    # ========================
    # 2. UPDATE QUARTERLY PLAN
    # ========================
    old_quarter_qty = getattr(quarterly_plan, quarter_field) or 0
    old_quarter_topup = getattr(quarterly_plan, topup_field) or 0
    
    # Increase both the quarter quantity AND track the top-up separately
    setattr(quarterly_plan, quarter_field, old_quarter_qty + topup.quantity)
    setattr(quarterly_plan, topup_field, old_quarter_topup + topup.quantity)
    
    logger.info(f"Quarterly plan {quarterly_plan.id} {quarter} updated: {old_quarter_qty} -> {old_quarter_qty + topup.quantity} KT (top-up: {old_quarter_topup + topup.quantity} KT)")
    
    # ========================
    # 3. UPDATE CONTRACT
    # ========================
    # Parse existing authority_topups or create new array
    existing_topups = []
    if contract.authority_topups:
        try:
            existing_topups = json.loads(contract.authority_topups)
        except (json.JSONDecodeError, TypeError):
            existing_topups = []
    
    # Add new top-up entry
    new_topup_entry = {
        "product_name": product_name,
        "quantity": topup.quantity,
        "authority_reference": topup.authority_reference,
        "reason": topup.reason,
        "authorization_date": str(topup.authorization_date) if topup.authorization_date else None,
        "month": db_plan.month,
        "year": db_plan.year,
        "monthly_plan_id": db_plan.id
    }
    existing_topups.append(new_topup_entry)
    
    contract.authority_topups = json.dumps(existing_topups)
    
    # Also update the product's total_quantity in the products JSON
    try:
        products = json.loads(contract.products) if contract.products else []
        for product in products:
            if product.get('name') == product_name:
                old_product_qty = product.get('total_quantity', 0)
                product['total_quantity'] = old_product_qty + topup.quantity
                # Track top-up amount in product
                product['topup_quantity'] = product.get('topup_quantity', 0) + topup.quantity
                logger.info(f"Contract {contract.contract_number} product {product_name}: {old_product_qty} -> {product['total_quantity']} KT (top-up: {product['topup_quantity']} KT)")
                break
        contract.products = json.dumps(products)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"Could not update contract products JSON: {e}")
    
    # Log contract authority top-up
    contract_audit = models.ContractAuditLog(
        contract_id=contract.id,
        contract_db_id=contract.id,
        action='AUTHORITY_TOPUP',
        field_name='authority_topups',
        product_name=product_name,
        topup_quantity=topup.quantity,
        authority_reference=topup.authority_reference,
        topup_reason=topup.reason,
        contract_number=contract.contract_number,
        customer_name=customer.name if customer else None,
        description=f"Authority top-up: +{topup.quantity:,.0f} KT {product_name} for {month_str} {db_plan.year} (Ref: {topup.authority_reference})"
    )
    db.add(contract_audit)
    
    db.commit()
    db.refresh(db_plan)
    
    logger.info(f"Authority top-up CASCADE completed: Monthly plan {plan_id}, Quarterly plan {quarterly_plan.id}, Contract {contract.contract_number}: +{topup.quantity} KT {product_name}")
    return db_plan
