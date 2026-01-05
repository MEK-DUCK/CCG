from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Dict, Optional
from calendar import month_name
import logging
import json

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
)
from app.config import MIN_YEAR, MAX_YEAR, get_fiscal_quarter_field
from app.auth import get_current_user
from app.utils.quantity import (
    parse_contract_products,
    get_contract_quantity_limits,
    get_authority_topup_for_product,
    validate_quantity_against_limits,
)

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
        'cargo_ids': [c.id for c in cargos],  # Use numeric id for API calls
        'completed_cargo_ids': [c.id for c in completed_cargos],  # Use numeric id for API calls
        'cargo_unique_ids': [c.cargo_id for c in cargos],  # String cargo_id for display
        'completed_cargo_unique_ids': [c.cargo_id for c in completed_cargos],  # String cargo_id for display
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
        # SPOT/Range contract - verify contract exists
        contract = db.query(models.Contract).filter(models.Contract.id == plan.contract_id).first()
        if not contract:
            raise HTTPException(status_code=404, detail=f"Contract {plan.contract_id} not found")
        
        # Use unified quantity utility for validation
        products = parse_contract_products(contract)
        product_name = getattr(plan, "product_name", None)
        authority_topup = get_authority_topup_for_product(db, contract.id, product_name)
        limits = get_contract_quantity_limits(products, product_name, authority_topup)
        
        # Get existing monthly plans for this contract (direct link, no quarterly plan)
        existing_monthly_plans = db.query(models.MonthlyPlan).filter(
            models.MonthlyPlan.contract_id == plan.contract_id,
            models.MonthlyPlan.quarterly_plan_id.is_(None)
        ).all()
        
        # If product-specific, only count plans for that product
        if product_name:
            used_quantity = sum(mp.month_quantity or 0 for mp in existing_monthly_plans if mp.product_name == product_name)
        else:
            used_quantity = sum(mp.month_quantity or 0 for mp in existing_monthly_plans)
        
        # Validate using unified utility
        is_valid, error_msg = validate_quantity_against_limits(
            plan.month_quantity, limits, used_quantity, product_name or "contract"
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
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
            quarterly_plan_id=None,  # No quarterly plan for SPOT/Range contracts
            contract_id=plan.contract_id,
            product_name=getattr(plan, "product_name", None),  # Product name for ALL contract types
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
            quarterly_plan_id=plan.quarterly_plan_id,
            contract_id=quarterly_plan.contract_id,  # Always set contract_id from quarterly plan
            product_name=getattr(plan, "product_name", None),  # Product name for ALL contract types
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
    contract_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(models.MonthlyPlan)
        if quarterly_plan_id:
            query = query.filter(models.MonthlyPlan.quarterly_plan_id == quarterly_plan_id)
        if contract_id:
            # For SPOT contracts - get plans with this contract_id and no quarterly_plan_id
            query = query.filter(
                models.MonthlyPlan.contract_id == contract_id,
                models.MonthlyPlan.quarterly_plan_id.is_(None)
            )
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


@router.get("/cif-tng", response_model=List[schemas.MonthlyPlanEnriched])
def get_cif_monthly_plans_for_tng(
    months: str = Query(None, description="Comma-separated months, e.g., '1,2,3' (optional)"),
    year: int = Query(None, description="Year to filter by (optional)"),
    db: Session = Depends(get_db)
):
    """
    Get all monthly plans for CIF contracts that need TNG tracking.
    Returns monthly plans with their contract, customer info, and TNG status.
    Used for the Tonnage Memos tab on the homepage.
    """
    try:
        # Build query with eager loading of all related data
        query = db.query(models.MonthlyPlan).options(
            joinedload(models.MonthlyPlan.quarterly_plan)
            .joinedload(models.QuarterlyPlan.contract)
            .joinedload(models.Contract.customer),
            joinedload(models.MonthlyPlan.contract)
            .joinedload(models.Contract.customer)
        )
        
        # Filter for CIF contracts only
        # Join to get contract type - need to handle both paths (via quarterly_plan or direct)
        query = query.join(
            models.Contract,
            (models.MonthlyPlan.contract_id == models.Contract.id) |
            (models.MonthlyPlan.quarterly_plan.has(models.QuarterlyPlan.contract_id == models.Contract.id))
        ).filter(
            models.Contract.contract_type == 'CIF'
        )
        
        # Only include plans with quantity > 0 AND loading_window set
        query = query.filter(models.MonthlyPlan.month_quantity > 0)
        query = query.filter(
            models.MonthlyPlan.loading_window.isnot(None),
            models.MonthlyPlan.loading_window != ''
        )
        
        # Optional month filter
        if months:
            month_list = [int(m.strip()) for m in months.split(",") if m.strip()]
            if month_list:
                query = query.filter(models.MonthlyPlan.month.in_(month_list))
        
        # Optional year filter
        if year:
            query = query.filter(models.MonthlyPlan.year == year)
        
        # Order by year, month
        query = query.order_by(
            models.MonthlyPlan.year.desc(),
            models.MonthlyPlan.month.asc()
        )
        
        plans = query.all()
        return plans
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter format: {str(e)}")
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_cif_monthly_plans_for_tng: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading CIF monthly plans for TNG")


@router.get("/{plan_id}", response_model=schemas.MonthlyPlan)
def read_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    return plan


@router.put("/{plan_id}", response_model=schemas.MonthlyPlan)
async def update_monthly_plan(
    plan_id: int, 
    plan: schemas.MonthlyPlanUpdate, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
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
                cargo_info['completed_cargo_unique_ids']
            ))
        if 'year' in update_data and update_data['year'] != db_plan.year:
            raise to_http_exception(plan_has_completed_cargos(
                cargo_info['completed_cargos'], 
                cargo_info['completed_cargo_unique_ids']
            ))
    
    # Validate quantity against plan limits
    new_month_quantity = plan.month_quantity if plan.month_quantity is not None else db_plan.month_quantity
    
    # Determine validation path: quarterly plan or direct contract
    # Note: ALL monthly plans have contract_id set, but only TERM contracts have quarterly_plan_id
    has_quarterly_plan = db_plan.quarterly_plan_id is not None
    
    if has_quarterly_plan:
        # TERM contract - validate against quarterly plan allocation
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
        
        if new_month_quantity > remaining_quantity:
            raise to_http_exception(quantity_exceeds_plan(new_month_quantity, remaining_quantity, quarterly_total))
    else:
        # SPOT/Range contract - validate against contract quantity using unified utility
        # Always use contract_id directly (it's always set on all monthly plans)
        contract = db.query(models.Contract).filter(models.Contract.id == db_plan.contract_id).first()
        if contract:
            products = parse_contract_products(contract)
            product_name = db_plan.product_name
            authority_topup = get_authority_topup_for_product(db, contract.id, product_name)
            limits = get_contract_quantity_limits(products, product_name, authority_topup)
            
            # Get existing monthly plans for this contract (excluding current plan)
            existing_monthly_plans = db.query(models.MonthlyPlan).filter(
                models.MonthlyPlan.contract_id == db_plan.contract_id,
                models.MonthlyPlan.quarterly_plan_id.is_(None),
                models.MonthlyPlan.id != plan_id
            ).all()
            
            # If product-specific, only count plans for that product
            if product_name:
                used_quantity = sum(mp.month_quantity or 0 for mp in existing_monthly_plans if mp.product_name == product_name)
            else:
                used_quantity = sum(mp.month_quantity or 0 for mp in existing_monthly_plans)
            
            # Validate using unified utility
            is_valid, error_msg = validate_quantity_against_limits(
                new_month_quantity, limits, used_quantity, product_name or "contract"
            )
            if not is_valid:
                raise HTTPException(status_code=400, detail=error_msg)
    
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
        user_initials = current_user.initials if current_user else "SYS"
        version_service.save_version(
            db, "monthly_plan", db_plan.id, db_plan,
            user_initials=user_initials,
            change_summary=change_summary
        )
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Monthly plan {plan_id} updated")
    return db_plan


@router.put("/{plan_id}/move", response_model=schemas.MonthlyPlan)
async def move_monthly_plan(
    plan_id: int, 
    move_request: schemas.MonthlyPlanMoveRequest, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user)
):
    """
    Move a monthly plan to a different month (defer or advance).
    If the plan has cargos, they will be moved along with it (with version history).
    Blocked if the plan has COMPLETED cargos (completed operations can't be moved).
    """
    from app.version_history import version_service
    
    # Get user initials for version history
    user_initials = current_user.initials if current_user else "SYS"
    
    # Lock the row to prevent concurrent modifications
    db_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
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
        user_initials=user_initials,
        change_summary=f"{action_verb} from {old_month_name} {old_year} to {new_month_name} {move_request.target_year}"
    )
    
    # If there are cargos, save version history and update them
    cargos = db.query(models.Cargo).filter(models.Cargo.monthly_plan_id == plan_id).all()
    moved_cargo_ids = []
    
    for cargo in cargos:
        # Save version history for each cargo before the move
        version_service.save_version(
            db, "cargo", cargo.id, cargo,
            user_initials=user_initials,
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
    
    # For CIF contracts, update delivery_month to match the new loading month
    # This ensures the quantity is tracked against the correct delivery quarter
    # Get the contract to check if it's CIF
    contract = None
    if db_plan.quarterly_plan_id:
        quarterly_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == db_plan.quarterly_plan_id).first()
        if quarterly_plan:
            contract = db.query(models.Contract).filter(models.Contract.id == quarterly_plan.contract_id).first()
    elif db_plan.contract_id:
        contract = db.query(models.Contract).filter(models.Contract.id == db_plan.contract_id).first()
    
    if contract and contract.contract_type == 'CIF' and db_plan.delivery_month:
        # Calculate new delivery month based on the move
        # The delivery month should shift by the same amount as the loading month
        old_delivery_month = db_plan.delivery_month  # e.g., "January 2026"
        month_diff = (move_request.target_year * 12 + move_request.target_month) - (old_year * 12 + old_month)
        
        # Parse the old delivery month
        try:
            parts = old_delivery_month.split(' ')
            if len(parts) == 2:
                old_del_month_name = parts[0]
                old_del_year = int(parts[1])
                # Convert month name to number
                month_names_list = ['January', 'February', 'March', 'April', 'May', 'June', 
                                   'July', 'August', 'September', 'October', 'November', 'December']
                if old_del_month_name in month_names_list:
                    old_del_month_num = month_names_list.index(old_del_month_name) + 1
                    # Calculate new delivery month
                    new_del_total = old_del_year * 12 + old_del_month_num + month_diff
                    new_del_year = (new_del_total - 1) // 12
                    new_del_month_num = ((new_del_total - 1) % 12) + 1
                    new_del_month_name = month_names_list[new_del_month_num - 1]
                    db_plan.delivery_month = f"{new_del_month_name} {new_del_year}"
                    logger.info(f"Updated delivery_month from '{old_delivery_month}' to '{db_plan.delivery_month}'")
        except Exception as e:
            logger.warning(f"Could not update delivery_month: {e}")
    
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
            cargo_info['completed_cargo_unique_ids']
        ))
    
    if cargo_info['total_cargos'] > 0:
        raise to_http_exception(plan_has_cargos(cargo_info['total_cargos'], cargo_info['cargo_unique_ids']))
    
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


@router.post("/status/bulk")
def get_monthly_plans_status_bulk(plan_ids: List[int], db: Session = Depends(get_db)):
    """Get status for multiple monthly plans in a single request (optimization)"""
    if not plan_ids:
        return []
    
    # Fetch all plans in one query
    db_plans = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id.in_(plan_ids)).all()
    plans_by_id = {plan.id: plan for plan in db_plans}
    
    results = []
    for plan_id in plan_ids:
        db_plan = plans_by_id.get(plan_id)
        if db_plan is None:
            # Skip missing plans instead of erroring
            continue
        
        cargo_info = get_cargo_info(plan_id, db)
        
        results.append({
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
        })
    
    return results


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
    Add an authority top-up to a specific monthly plan.
    
    Authority top-ups are tracked ONLY at the monthly plan level.
    The system aggregates from monthly plans when contract/quarterly totals are needed.
    
    Example: March cargo was 100 KT, got authority to load 120 KT -> add 20 KT top-up
    """
    # Lock the monthly plan row to prevent concurrent modifications
    db_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Get contract for audit log
    contract = db.query(models.Contract).filter(
        models.Contract.id == db_plan.contract_id
    ).first()
    
    if not contract:
        raise HTTPException(status_code=400, detail="Monthly plan has no associated contract")
    
    customer = db.query(models.Customer).filter(
        models.Customer.id == contract.customer_id
    ).first()
    
    # ========================
    # UPDATE MONTHLY PLAN (single source of truth for top-ups)
    # ========================
    old_topup_qty = db_plan.authority_topup_quantity or 0
    old_month_qty = db_plan.month_quantity
    
    db_plan.authority_topup_quantity = old_topup_qty + topup.quantity
    db_plan.authority_topup_reference = topup.authority_reference
    db_plan.authority_topup_reason = topup.reason
    db_plan.authority_topup_date = topup.authorization_date
    db_plan.month_quantity = old_month_qty + topup.quantity
    
    month_str = month_name[db_plan.month]
    product_name = db_plan.product_name or "Unknown"
    
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
    
    # Log to contract audit log for visibility
    contract_audit = models.ContractAuditLog(
        contract_id=contract.id,
        contract_db_id=contract.id,
        action='AUTHORITY_TOPUP',
        field_name='monthly_plan_topup',
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
    
    logger.info(f"Authority top-up completed: Monthly plan {plan_id}, Contract {contract.contract_number}: +{topup.quantity} KT {product_name}")
    return db_plan
