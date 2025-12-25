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
    
    completed_cargos = [c for c in cargos if c.status == CargoStatus.COMPLETED_LOADING]
    
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
    
    # Verify quarterly plan exists
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
        query = db.query(models.MonthlyPlan).options(
            joinedload(models.MonthlyPlan.quarterly_plan)
            .joinedload(models.QuarterlyPlan.contract)
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
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Check if plan has completed cargos (locked)
    cargo_info = get_cargo_info(plan_id, db)
    
    update_data = plan.dict(exclude_unset=True)
    
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
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Monthly plan {plan_id} updated")
    return db_plan


@router.put("/{plan_id}/move", response_model=schemas.MonthlyPlan)
def move_monthly_plan(plan_id: int, move_request: schemas.MonthlyPlanMoveRequest, db: Session = Depends(get_db)):
    """
    Move a monthly plan to a different month (defer or advance).
    Blocked if the plan has any associated cargos.
    """
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Check if plan has any cargos - block move if yes
    cargo_info = get_cargo_info(plan_id, db)
    if cargo_info['total_cargos'] > 0:
        raise to_http_exception(plan_has_cargos(cargo_info['total_cargos'], cargo_info['cargo_ids']))
    
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
    
    # Update the plan
    db_plan.month = move_request.target_month
    db_plan.year = move_request.target_year
    
    # Build description
    old_month_name = month_name[old_month]
    new_month_name = month_name[move_request.target_month]
    action_verb = "Deferred" if move_request.action == "DEFER" else "Advanced"
    description = f"{action_verb} {db_plan.month_quantity:,.0f} KT from {old_month_name} {old_year} to {new_month_name} {move_request.target_year}"
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
    This allows loading more quantity than originally planned when authorization is received.
    
    Example: March cargo was 100 KT, got authority to load 120 KT -> add 20 KT top-up
    """
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Get quarterly plan and contract for context
    quarterly_plan = db.query(models.QuarterlyPlan).filter(
        models.QuarterlyPlan.id == db_plan.quarterly_plan_id
    ).first()
    
    contract = None
    customer = None
    if quarterly_plan:
        contract = db.query(models.Contract).filter(
            models.Contract.id == quarterly_plan.contract_id
        ).first()
        if contract:
            customer = db.query(models.Customer).filter(
                models.Customer.id == contract.customer_id
            ).first()
    
    # Store old values for audit
    old_topup_qty = db_plan.authority_topup_quantity or 0
    old_month_qty = db_plan.month_quantity
    
    # Update the monthly plan with top-up info
    new_topup_qty = old_topup_qty + topup.quantity
    db_plan.authority_topup_quantity = new_topup_qty
    db_plan.authority_topup_reference = topup.authority_reference
    db_plan.authority_topup_reason = topup.reason
    db_plan.authority_topup_date = topup.date
    
    # Also increase the month_quantity by the top-up amount
    db_plan.month_quantity = old_month_qty + topup.quantity
    
    # Build description for audit log
    month_str = month_name[db_plan.month]
    product_name = quarterly_plan.product_name if quarterly_plan else "Unknown"
    description = f"Authority top-up: +{topup.quantity:,.0f} KT for {month_str} {db_plan.year} {product_name} (Ref: {topup.authority_reference})"
    if topup.reason:
        description += f" - {topup.reason}"
    
    # Log the top-up action
    log_monthly_plan_action(
        db=db,
        action='AUTHORITY_TOPUP',
        monthly_plan=db_plan,
        field_name='authority_topup_quantity',
        old_value=old_topup_qty,
        new_value=new_topup_qty,
        description=description
    )
    
    # Also log the quantity change
    log_monthly_plan_action(
        db=db,
        action='UPDATE',
        monthly_plan=db_plan,
        field_name='month_quantity',
        old_value=old_month_qty,
        new_value=db_plan.month_quantity,
        description=f"Quantity increased from {old_month_qty:,.0f} KT to {db_plan.month_quantity:,.0f} KT due to authority top-up"
    )
    
    db.commit()
    db.refresh(db_plan)
    
    logger.info(f"Authority top-up added to monthly plan {plan_id}: +{topup.quantity} KT (Ref: {topup.authority_reference})")
    return db_plan
