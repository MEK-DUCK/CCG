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
from app.auth import get_current_user, require_auth
from app.utils.quantity import (
    parse_contract_products,
    get_contract_quantity_limits,
    get_authority_topup_for_product,
    validate_quantity_against_limits,
    get_product_id_by_name,
    get_product_name_by_id,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _monthly_plan_to_schema(plan: models.MonthlyPlan, db: Session) -> dict:
    """
    Convert a MonthlyPlan model to a schema-compatible dict.
    
    Translates product_id back to product_name for API compatibility with frontend.
    """
    product_name = None
    if plan.product_id:
        # Use relationship if loaded, otherwise lookup
        if plan.product:
            product_name = plan.product.name
        else:
            product_name = get_product_name_by_id(db, plan.product_id)
    
    return {
        "id": plan.id,
        "month": plan.month,
        "year": plan.year,
        "month_quantity": plan.month_quantity,
        "number_of_liftings": plan.number_of_liftings,
        "planned_lifting_sizes": plan.planned_lifting_sizes,
        "laycan_5_days": plan.laycan_5_days,
        "laycan_2_days": plan.laycan_2_days,
        "laycan_2_days_remark": plan.laycan_2_days_remark,
        "loading_month": plan.loading_month,
        "loading_window": plan.loading_window,
        "cif_route": plan.cif_route,
        "delivery_month": plan.delivery_month,
        "delivery_window": plan.delivery_window,
        "delivery_window_remark": plan.delivery_window_remark,
        "combi_group_id": plan.combi_group_id,
        "product_name": product_name,
        "authority_topup_quantity": plan.authority_topup_quantity,
        "authority_topup_reference": plan.authority_topup_reference,
        "authority_topup_reason": plan.authority_topup_reason,
        "authority_topup_date": plan.authority_topup_date,
        "tng_issued": plan.tng_issued,
        "tng_issued_date": plan.tng_issued_date,
        "tng_issued_initials": plan.tng_issued_initials,
        "tng_revised": plan.tng_revised,
        "tng_revised_date": plan.tng_revised_date,
        "tng_revised_initials": plan.tng_revised_initials,
        "tng_remarks": plan.tng_remarks,
        "quarterly_plan_id": plan.quarterly_plan_id,
        "contract_id": plan.contract_id,
        "version": plan.version,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


def _monthly_plan_to_enriched(plan: models.MonthlyPlan, db: Session) -> dict:
    """
    Convert a MonthlyPlan model to an enriched schema-compatible dict.
    
    Includes embedded quarterly_plan and contract info.
    """
    base = _monthly_plan_to_schema(plan, db)
    
    # Add quarterly plan if present
    quarterly_plan_data = None
    if plan.quarterly_plan:
        qp = plan.quarterly_plan
        qp_product_name = None
        if qp.product_id and qp.product:
            qp_product_name = qp.product.name
        elif qp.product_id:
            qp_product_name = get_product_name_by_id(db, qp.product_id)
        
        quarterly_plan_data = {
            "id": qp.id,
            "product_name": qp_product_name,
            "contract_year": qp.contract_year,
            "q1_quantity": qp.q1_quantity,
            "q2_quantity": qp.q2_quantity,
            "q3_quantity": qp.q3_quantity,
            "q4_quantity": qp.q4_quantity,
            "contract_id": qp.contract_id,
        }
    
    # Add contract info - prefer direct contract, fall back to quarterly_plan.contract
    contract_data = None
    contract = plan.contract or (plan.quarterly_plan.contract if plan.quarterly_plan else None)
    if contract:
        customer_data = None
        if contract.customer:
            customer_data = {
                "id": contract.customer.id,
                "customer_id": contract.customer.customer_id,
                "name": contract.customer.name,
            }
        
        # Get products from relationship
        products_data = contract.get_products_list() if hasattr(contract, 'get_products_list') else []
        
        contract_data = {
            "id": contract.id,
            "contract_id": contract.contract_id,
            "contract_number": contract.contract_number,
            "contract_type": contract.contract_type.value if contract.contract_type else None,
            "contract_category": contract.contract_category.value if contract.contract_category else None,
            "payment_method": contract.payment_method.value if contract.payment_method else None,
            "start_period": contract.start_period,
            "end_period": contract.end_period,
            "fiscal_start_month": contract.fiscal_start_month,
            "products": products_data,
            "tng_lead_days": contract.tng_lead_days,
            "tng_notes": contract.tng_notes,
            "cif_destination": contract.cif_destination,
            "customer_id": contract.customer_id,
            "customer": customer_data,
        }
    
    base["quarterly_plan"] = quarterly_plan_data
    base["contract"] = contract_data
    return base


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
def create_monthly_plan(plan: schemas.MonthlyPlanCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
        product_id = get_product_id_by_name(db, product_name) if product_name else None
        authority_topup = get_authority_topup_for_product(db, contract.id, product_id=product_id)
        limits = get_contract_quantity_limits(products, product_name, authority_topup)
        
        # Get existing monthly plans for this contract (direct link, no quarterly plan)
        existing_monthly_plans = db.query(models.MonthlyPlan).filter(
            models.MonthlyPlan.contract_id == plan.contract_id,
            models.MonthlyPlan.quarterly_plan_id.is_(None)
        ).all()
        
        # If product-specific, only count plans for that product
        if product_id:
            used_quantity = sum(mp.month_quantity or 0 for mp in existing_monthly_plans if mp.product_id == product_id)
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
            product_id=product_id,  # Normalized product reference
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
        
        # Get product_id from plan.product_name or from quarterly plan
        product_name = getattr(plan, "product_name", None)
        product_id = get_product_id_by_name(db, product_name) if product_name else quarterly_plan.product_id
        
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
            product_id=product_id,  # Normalized product reference
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
    return _monthly_plan_to_schema(db_plan, db)


@router.get("/", response_model=List[schemas.MonthlyPlan])
def read_monthly_plans(
    quarterly_plan_id: int = None,
    contract_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    try:
        query = db.query(models.MonthlyPlan).options(
            joinedload(models.MonthlyPlan.product)
        )
        if quarterly_plan_id:
            query = query.filter(models.MonthlyPlan.quarterly_plan_id == quarterly_plan_id)
        if contract_id:
            # For SPOT contracts - get plans with this contract_id and no quarterly_plan_id
            query = query.filter(
                models.MonthlyPlan.contract_id == contract_id,
                models.MonthlyPlan.quarterly_plan_id.is_(None)
            )
        plans = query.offset(skip).limit(limit).all()
        return [_monthly_plan_to_schema(p, db) for p in plans]
    except SQLAlchemyError as e:
        logger.error(f"Database error reading monthly plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading monthly plans")


@router.get("/bulk", response_model=List[schemas.MonthlyPlanEnriched])
def get_monthly_plans_bulk(
    months: str = Query(..., description="Comma-separated months, e.g., '1,2,3'"),
    year: int = Query(..., description="Year to filter by"),
    include_zero_quantity: bool = Query(False, description="Include plans with 0 quantity"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
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
            .joinedload(models.Contract.customer),
            # Load product for product_name
            joinedload(models.MonthlyPlan.product)
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
        # Convert to enriched format with product_name from product relationship
        return [_monthly_plan_to_enriched(p, db) for p in plans]
        
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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
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
            .joinedload(models.Contract.customer),
            # Load product for product_name
            joinedload(models.MonthlyPlan.product)
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
        return [_monthly_plan_to_enriched(p, db) for p in plans]
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter format: {str(e)}")
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_cif_monthly_plans_for_tng: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading CIF monthly plans for TNG")


@router.get("/{plan_id}", response_model=schemas.MonthlyPlan)
def read_monthly_plan(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    plan = db.query(models.MonthlyPlan).options(
        joinedload(models.MonthlyPlan.product)
    ).filter(models.MonthlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    return _monthly_plan_to_schema(plan, db)


@router.put("/{plan_id}", response_model=schemas.MonthlyPlan)
async def update_monthly_plan(
    plan_id: int,
    plan: schemas.MonthlyPlanUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """
    Update a monthly plan with optimistic locking.
    
    If client sends 'version', we verify it matches the current version
    to prevent lost updates from concurrent edits.
    """
    # Lock the monthly plan row to prevent concurrent modifications
    # Separate locking from relationship loading to avoid PostgreSQL FOR UPDATE error
    db_plan_locked = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan_locked is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Now load the product relationship separately if needed
    db_plan = db.query(models.MonthlyPlan).options(
        joinedload(models.MonthlyPlan.product)
    ).filter(
        models.MonthlyPlan.id == plan_id
    ).first()
    
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
            # Get product_name from relationship or lookup
            product_name = None
            if db_plan.product_id:
                if db_plan.product:
                    product_name = db_plan.product.name
                else:
                    product_name = get_product_name_by_id(db, db_plan.product_id)
            authority_topup = get_authority_topup_for_product(db, contract.id, product_name)
            limits = get_contract_quantity_limits(products, product_name, authority_topup)
            
            # Get existing monthly plans for this contract (excluding current plan)
            existing_monthly_plans = db.query(models.MonthlyPlan).options(
                joinedload(models.MonthlyPlan.product)
            ).filter(
                models.MonthlyPlan.contract_id == db_plan.contract_id,
                models.MonthlyPlan.quarterly_plan_id.is_(None),
                models.MonthlyPlan.id != plan_id
            ).all()
            
            # If product-specific, only count plans for that product
            if product_name:
                used_quantity = sum(
                    mp.month_quantity or 0 for mp in existing_monthly_plans 
                    if (mp.product.name if mp.product else get_product_name_by_id(db, mp.product_id)) == product_name
                )
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
    return _monthly_plan_to_schema(db_plan, db)


def _get_fiscal_quarter(month: int, fiscal_start_month: int = 1) -> int:
    """
    Calculate the fiscal quarter for a given month.
    
    Args:
        month: Calendar month (1-12)
        fiscal_start_month: Month when fiscal Q1 starts (1=January, 4=April, etc.)
    
    Returns:
        Fiscal quarter (1-4)
    """
    # Adjust month relative to fiscal year start
    adjusted_month = (month - fiscal_start_month) % 12
    return (adjusted_month // 3) + 1


def _parse_delivery_month(delivery_month_str: str) -> tuple:
    """
    Parse delivery month string like "March 2025" into (month_num, year).
    Returns (None, None) if parsing fails.
    """
    if not delivery_month_str:
        return None, None
    
    month_names_list = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
    try:
        parts = delivery_month_str.split(' ')
        if len(parts) == 2:
            month_name_str = parts[0]
            year = int(parts[1])
            if month_name_str in month_names_list:
                month_num = month_names_list.index(month_name_str) + 1
                return month_num, year
    except Exception:
        pass
    return None, None


def _format_delivery_month(month_num: int, year: int) -> str:
    """Format month number and year into delivery month string like 'March 2025'."""
    month_names_list = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
    return f"{month_names_list[month_num - 1]} {year}"


@router.put("/{plan_id}/move", response_model=schemas.MonthlyPlan)
async def move_monthly_plan(
    plan_id: int,
    move_request: schemas.MonthlyPlanMoveRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """
    Move a monthly plan to a different month (defer or advance).
    
    Rules:
    - SPOT contracts: Not allowed (return 400)
    - Within same quarter: Allowed freely
    - Cross-quarter: Requires authority_reference and reason
    - FOB: Quarter determined by loading month
    - CIF: Quarter determined by delivery month
    
    What happens on move:
    - Month/year updated
    - For CIF: delivery_month updated (user selects target delivery month)
    - Laycan dates on cargos are cleared
    - quarterly_plan_id updated for cross-quarter moves
    - Move tracking fields populated
    - Audit logs created with authority_reference
    """
    from app.version_history import version_service
    from datetime import date as date_type
    
    # Get user initials for version history
    user_initials = current_user.initials if current_user else "SYS"
    
    # Lock the row to prevent concurrent modifications
    db_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Get the contract
    contract = None
    old_quarterly_plan = None
    if db_plan.quarterly_plan_id:
        old_quarterly_plan = db.query(models.QuarterlyPlan).filter(
            models.QuarterlyPlan.id == db_plan.quarterly_plan_id
        ).first()
        if old_quarterly_plan:
            contract = db.query(models.Contract).filter(
                models.Contract.id == old_quarterly_plan.contract_id
            ).first()
    if not contract and db_plan.contract_id:
        contract = db.query(models.Contract).filter(
            models.Contract.id == db_plan.contract_id
        ).first()
    
    if not contract:
        raise HTTPException(status_code=400, detail="Cannot determine contract for this monthly plan")
    
    # Block SPOT contracts from defer/advance
    contract_category = getattr(contract, 'contract_category', None)
    if contract_category == 'SPOT':
        raise HTTPException(
            status_code=400,
            detail="Defer/Advance is not allowed for SPOT contracts. SPOT contracts are one-time operations."
        )
    
    # Check cargo status - only block if cargos are COMPLETED
    cargo_info = get_cargo_info(plan_id, db)
    if cargo_info['has_completed_cargos']:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move monthly plan. It has {cargo_info['completed_cargos']} completed cargo(s): "
                   f"{', '.join(cargo_info['completed_cargo_ids'])}. Completed operations cannot be moved."
        )
    
    # Determine source and target months based on contract type
    # For CIF: use delivery month for quarter calculation
    # For FOB: use loading month
    is_cif = contract.contract_type == 'CIF'
    fiscal_start_month = getattr(contract, 'fiscal_start_month', 1) or 1
    
    if is_cif:
        # For CIF, target_month/target_year in the request IS the delivery month
        # Source is the current delivery_month - MUST be set for CIF moves
        source_month, source_year = _parse_delivery_month(db_plan.delivery_month)
        if source_month is None:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move CIF monthly plan: delivery_month is not set or invalid ('{db_plan.delivery_month}'). "
                       f"Please set the delivery month before moving this plan."
            )
        target_month = move_request.target_month
        target_year = move_request.target_year
    else:
        # For FOB, use loading month directly
        source_month = db_plan.month
        source_year = db_plan.year
        target_month = move_request.target_month
        target_year = move_request.target_year
    
    # Validate move direction matches action
    old_date = source_year * 12 + source_month
    new_date = target_year * 12 + target_month
    
    if move_request.action == "DEFER" and new_date <= old_date:
        raise to_http_exception(invalid_move_direction("DEFER", "Cannot defer to an earlier or same month. Use ADVANCE action instead."))
    elif move_request.action == "ADVANCE" and new_date >= old_date:
        raise to_http_exception(invalid_move_direction("ADVANCE", "Cannot advance to a later or same month. Use DEFER action instead."))
    
    # Calculate quarters to determine if cross-quarter move
    source_quarter = _get_fiscal_quarter(source_month, fiscal_start_month)
    target_quarter = _get_fiscal_quarter(target_month, fiscal_start_month)
    
    # Cross-quarter if quarters differ OR years differ
    is_cross_quarter = (source_quarter != target_quarter) or (source_year != target_year)
    
    # Validate authority for cross-quarter moves
    if is_cross_quarter:
        if not move_request.authority_reference:
            raise HTTPException(
                status_code=400,
                detail=f"Cross-quarter move requires authority reference. "
                       f"Moving from Q{source_quarter} {source_year} to Q{target_quarter} {target_year}."
            )
        if not move_request.reason:
            raise HTTPException(
                status_code=400,
                detail="Cross-quarter move requires a reason."
            )
    
    # Store old values for audit
    old_month = db_plan.month
    old_year = db_plan.year
    old_month_name = month_name[source_month]
    new_month_name = month_name[target_month]
    action_verb = "Deferred" if move_request.action == "DEFER" else "Advanced"
    
    # Save version history for the monthly plan before moving
    version_service.save_version(
        db, "monthly_plan", db_plan.id, db_plan,
        user_initials=user_initials,
        change_summary=f"{action_verb} from {old_month_name} {source_year} to {new_month_name} {target_year}"
    )
    
    # If there are cargos, save version history, clear laycan, and update them
    cargos = db.query(models.Cargo).filter(models.Cargo.monthly_plan_id == plan_id).all()
    moved_cargo_ids = []
    
    for cargo in cargos:
        # Save version history for each cargo before the move
        version_service.save_version(
            db, "cargo", cargo.id, cargo,
            user_initials=user_initials,
            change_summary=f"{action_verb} with monthly plan from {old_month_name} {source_year} to {new_month_name} {target_year}"
        )
        
        # Clear laycan dates - they need to be re-negotiated
        cargo.laycan_start = None
        cargo.laycan_end = None
        
        # Log the cargo move in the cargo audit log
        audit_entry = models.CargoAuditLog(
            cargo_id=cargo.id,
            cargo_db_id=cargo.id,
            cargo_cargo_id=cargo.cargo_id,
            action=move_request.action,
            field_name='monthly_plan_month',
            old_value=f"{old_month_name} {source_year}",
            new_value=f"{new_month_name} {target_year}",
            old_month=source_month,
            old_year=source_year,
            new_month=target_month,
            new_year=target_year,
            description=move_request.reason or f"{action_verb} with monthly plan",
            authority_reference=move_request.authority_reference if is_cross_quarter else None
        )
        db.add(audit_entry)
        moved_cargo_ids.append(cargo.cargo_id)
        
        logger.info(f"Cargo {cargo.cargo_id} {action_verb.lower()} with monthly plan: {old_month_name} {source_year} -> {new_month_name} {target_year}")
    
    # Update the monthly plan based on contract type
    if is_cif:
        # For CIF: target is delivery month, calculate new loading month
        month_diff = (target_year * 12 + target_month) - (source_year * 12 + source_month)
        new_loading_month = old_month + (month_diff % 12)
        new_loading_year = old_year + (month_diff // 12)
        if new_loading_month > 12:
            new_loading_month -= 12
            new_loading_year += 1
        elif new_loading_month < 1:
            new_loading_month += 12
            new_loading_year -= 1
        
        db_plan.month = new_loading_month
        db_plan.year = new_loading_year
        db_plan.delivery_month = _format_delivery_month(target_month, target_year)
        logger.info(f"CIF: Updated delivery_month to '{db_plan.delivery_month}', loading month to {new_loading_month}/{new_loading_year}")
    else:
        # For FOB: target is loading month
        db_plan.month = target_month
        db_plan.year = target_year
    
    db_plan.version = (db_plan.version or 1) + 1
    
    # Track original month/year (first move only)
    if db_plan.original_month is None:
        db_plan.original_month = old_month
        db_plan.original_year = old_year
    
    # Update move tracking fields
    if is_cross_quarter:
        db_plan.last_move_authority_reference = move_request.authority_reference
        db_plan.last_move_reason = move_request.reason
        db_plan.last_move_date = date_type.today()
        db_plan.last_move_action = move_request.action
    
    # Handle cross-quarter: adjust quarterly plan quantities
    if is_cross_quarter and old_quarterly_plan:
        move_quantity = db_plan.month_quantity
        
        # Map quarter number to field name
        quarter_field_map = {1: 'q1_quantity', 2: 'q2_quantity', 3: 'q3_quantity', 4: 'q4_quantity'}
        source_field = quarter_field_map[source_quarter]
        target_field = quarter_field_map[target_quarter]
        
        # 1. Decrease source quarter quantity
        old_source_qty = getattr(old_quarterly_plan, source_field) or 0
        new_source_qty = max(0, old_source_qty - move_quantity)
        setattr(old_quarterly_plan, source_field, new_source_qty)
        
        # Create adjustment record for source (outgoing)
        source_adjustment = models.QuarterlyPlanAdjustment(
            quarterly_plan_id=old_quarterly_plan.id,
            adjustment_type=f"{move_request.action}_OUT",  # DEFER_OUT or ADVANCE_OUT
            quantity=move_quantity,
            from_quarter=source_quarter,
            to_quarter=target_quarter,
            from_year=source_year,
            to_year=target_year,
            authority_reference=move_request.authority_reference,
            reason=move_request.reason,
            monthly_plan_id=db_plan.id,
            user_id=current_user.id if current_user else None,
            user_initials=user_initials,
        )
        db.add(source_adjustment)
        
        logger.info(f"Decreased Q{source_quarter} from {old_source_qty} to {new_source_qty} KT")
        
        # 2. Increase target quarter quantity
        old_target_qty = getattr(old_quarterly_plan, target_field) or 0
        new_target_qty = old_target_qty + move_quantity
        setattr(old_quarterly_plan, target_field, new_target_qty)
        
        # Create adjustment record for target (incoming)
        target_adjustment = models.QuarterlyPlanAdjustment(
            quarterly_plan_id=old_quarterly_plan.id,
            adjustment_type=f"{move_request.action}_IN",  # DEFER_IN or ADVANCE_IN
            quantity=move_quantity,
            from_quarter=source_quarter,
            to_quarter=target_quarter,
            from_year=source_year,
            to_year=target_year,
            authority_reference=move_request.authority_reference,
            reason=move_request.reason,
            monthly_plan_id=db_plan.id,
            user_id=current_user.id if current_user else None,
            user_initials=user_initials,
        )
        db.add(target_adjustment)
        
        logger.info(f"Increased Q{target_quarter} from {old_target_qty} to {new_target_qty} KT")
        
        # Update adjustment notes (human-readable summary)
        if move_request.action == "DEFER":
            note = f"-{move_quantity:,.0f} KT deferred from Q{source_quarter} to Q{target_quarter} ({move_request.authority_reference})"
        else:
            note = f"-{move_quantity:,.0f} KT advanced from Q{source_quarter} to Q{target_quarter} ({move_request.authority_reference})"
        
        if old_quarterly_plan.adjustment_notes:
            old_quarterly_plan.adjustment_notes += f"\n{note}"
        else:
            old_quarterly_plan.adjustment_notes = note
    
    # Build description for monthly plan audit log
    quarter_info = f" (Q{source_quarter} → Q{target_quarter})" if is_cross_quarter else ""
    description = f"{action_verb} {db_plan.month_quantity:,.0f} KT from {old_month_name} {source_year} to {new_month_name} {target_year}{quarter_info}"
    if moved_cargo_ids:
        description += f" (with cargo(s): {', '.join(moved_cargo_ids)})"
    if move_request.reason:
        description += f" - Reason: {move_request.reason}"
    if is_cross_quarter and move_request.authority_reference:
        description += f" [Authority: {move_request.authority_reference}]"
    
    # Create audit log entry with authority_reference
    audit_entry = models.MonthlyPlanAuditLog(
        monthly_plan_id=db_plan.id,
        monthly_plan_db_id=db_plan.id,
        action=move_request.action,
        field_name='month',
        old_value=f"{source_month}/{source_year}",
        new_value=f"{target_month}/{target_year}",
        month=db_plan.month,
        year=db_plan.year,
        contract_id=contract.id,
        contract_number=contract.contract_number,
        quarterly_plan_id=db_plan.quarterly_plan_id,
        description=description,
        authority_reference=move_request.authority_reference if is_cross_quarter else None,
        user_initials=user_initials
    )
    db.add(audit_entry)
    
    db.commit()
    db.refresh(db_plan)
    
    logger.info(f"Monthly plan {plan_id} {action_verb.lower()}: {old_month_name} {source_year} -> {new_month_name} {target_year}")
    if is_cross_quarter:
        logger.info(f"Cross-quarter move Q{source_quarter} -> Q{target_quarter}, Authority: {move_request.authority_reference}")
    if moved_cargo_ids:
        logger.info(f"Moved {len(moved_cargo_ids)} cargo(s) with the plan (laycan cleared): {', '.join(moved_cargo_ids)}")
    
    return _monthly_plan_to_schema(db_plan, db)


@router.delete("/{plan_id}")
def delete_monthly_plan(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
def get_monthly_plans_status_bulk(plan_ids: List[int], db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
def get_monthly_plan_status(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
def add_authority_topup(plan_id: int, topup: schemas.AuthorityTopUpRequest, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """
    Add an authority top-up to a specific monthly plan.
    
    Authority top-ups are tracked ONLY at the monthly plan level.
    The system aggregates from monthly plans when contract/quarterly totals are needed.
    
    Example: March cargo was 100 KT, got authority to load 120 KT -> add 20 KT top-up
    """
    # Lock the monthly plan row to prevent concurrent modifications
    # Separate locking from relationship loading to avoid PostgreSQL FOR UPDATE error
    db_plan_locked = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan_locked is None:
        raise to_http_exception(monthly_plan_not_found(plan_id))
    
    # Now load the product relationship separately if needed
    db_plan = db.query(models.MonthlyPlan).options(
        joinedload(models.MonthlyPlan.product)
    ).filter(
        models.MonthlyPlan.id == plan_id
    ).first()
    
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
    # Get product_name from relationship or lookup
    product_name = "Unknown"
    if db_plan.product_id:
        if db_plan.product:
            product_name = db_plan.product.name
        else:
            product_name = get_product_name_by_id(db, db_plan.product_id) or "Unknown"
    
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
    return _monthly_plan_to_schema(db_plan, db)
