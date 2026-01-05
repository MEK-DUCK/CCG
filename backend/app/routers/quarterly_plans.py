from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from typing import List
import logging
import json

from app.database import get_db
from app import models, schemas
from app.quarterly_plan_audit_utils import log_quarterly_plan_action
from app.errors import (
    quarterly_plan_not_found,
    contract_not_found,
    monthly_exceeds_quarterly,
    to_http_exception,
)
from app.config import get_fiscal_quarter_months
from app.utils.quantity import (
    parse_contract_products,
    get_contract_quantity_limits,
    get_authority_topup_for_product,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _validate_monthly_plans_fit_quarterly(db: Session, plan_id: int, new_quantities: dict, fiscal_start_month: int = 1):
    """
    Validate that existing monthly plans don't exceed new quarterly allocations.
    Raises HTTPException if validation fails.
    
    Args:
        db: Database session
        plan_id: Quarterly plan ID
        new_quantities: Dict with q1_quantity, q2_quantity, q3_quantity, q4_quantity
        fiscal_start_month: First month of fiscal year (1-12), default 1 (January)
    """
    for quarter in [1, 2, 3, 4]:
        new_qty = new_quantities.get(f'q{quarter}_quantity')
        if new_qty is None:
            continue
            
        # Get months for this fiscal quarter
        quarter_months = get_fiscal_quarter_months(quarter, fiscal_start_month)
        
        # Sum monthly plans in this quarter
        monthly_total = db.query(
            func.coalesce(func.sum(models.MonthlyPlan.month_quantity), 0)
        ).filter(
            models.MonthlyPlan.quarterly_plan_id == plan_id,
            models.MonthlyPlan.month.in_(quarter_months)
        ).scalar()
        
        monthly_total = float(monthly_total or 0)
        
        if monthly_total > new_qty:
            raise to_http_exception(monthly_exceeds_quarterly(quarter, monthly_total, new_qty))


## _get_authority_topup_quantity moved to app.utils.quantity as get_authority_topup_for_product


@router.post("/", response_model=schemas.QuarterlyPlan)
def create_quarterly_plan(plan: schemas.QuarterlyPlanCreate, db: Session = Depends(get_db)):
    # Verify contract exists
    contract = db.query(models.Contract).filter(models.Contract.id == plan.contract_id).first()
    if not contract:
        raise to_http_exception(contract_not_found(plan.contract_id))
    
    # Parse contract products
    contract_products = json.loads(contract.products) if contract.products else []
    is_multi_product = len(contract_products) > 1
    
    # For multi-product contracts with product_name, check if plan exists for this specific product
    # For single-product contracts, check if any plan exists
    if plan.product_name and is_multi_product:
        existing_plan = db.query(models.QuarterlyPlan).filter(
            models.QuarterlyPlan.contract_id == plan.contract_id,
            models.QuarterlyPlan.product_name == plan.product_name
        ).first()
        if existing_plan:
            raise HTTPException(
                status_code=409,
                detail=f"A quarterly plan already exists for {plan.product_name}. Please edit the existing plan or delete it first."
            )
    else:
        existing_plan = db.query(models.QuarterlyPlan).filter(
            models.QuarterlyPlan.contract_id == plan.contract_id,
            models.QuarterlyPlan.product_name == None
        ).first()
        if existing_plan:
            raise HTTPException(
                status_code=409,
                detail="A quarterly plan already exists for this contract. Please edit the existing plan or delete it first."
            )
    
    # Calculate total quarterly quantity
    total_quarterly = plan.q1_quantity + plan.q2_quantity + plan.q3_quantity + plan.q4_quantity
    
    # Use unified quantity utility for validation
    product_name_for_limits = plan.product_name if (plan.product_name and is_multi_product) else None
    authority_topup = get_authority_topup_for_product(db, contract.id, product_name_for_limits)
    limits = get_contract_quantity_limits(contract_products, product_name_for_limits, authority_topup)
    
    # Validate total must equal contract/product total (or up to max with optional/topups)
    target_label = plan.product_name if (plan.product_name and is_multi_product) else "contract"
    if total_quarterly < limits['min_quantity']:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) is less than the {target_label} minimum ({limits['min_quantity']:,.0f} KT). The quarterly plan total must at least equal the minimum."
        )
    elif total_quarterly > limits['max_with_topup']:
        topup_msg = f" + {authority_topup:,.0f} KT authority top-up" if authority_topup > 0 else ""
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) exceeds maximum allowed ({limits['max_with_topup']:,.0f} KT = {limits['max_quantity']:,.0f} KT base + {limits['optional_quantity']:,.0f} KT optional{topup_msg})"
        )
    
    # Determine the product_name to use
    if plan.product_name and is_multi_product:
        product_name_to_use = plan.product_name
    elif len(contract_products) == 1:
        product_name_to_use = contract_products[0].get('name')
    else:
        product_name_to_use = None
    
    db_plan = models.QuarterlyPlan(
        q1_quantity=plan.q1_quantity,
        q2_quantity=plan.q2_quantity,
        q3_quantity=plan.q3_quantity,
        q4_quantity=plan.q4_quantity,
        contract_id=plan.contract_id,
        product_name=product_name_to_use
    )
    db.add(db_plan)
    db.flush()
    
    log_quarterly_plan_action(
        db=db,
        action='CREATE',
        quarterly_plan=db_plan
    )
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Quarterly plan created: id={db_plan.id}, contract={plan.contract_id}")
    return db_plan


@router.get("/", response_model=List[schemas.QuarterlyPlan])
def read_quarterly_plans(
    contract_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(models.QuarterlyPlan)
        if contract_id:
            query = query.filter(models.QuarterlyPlan.contract_id == contract_id)
        plans = query.offset(skip).limit(limit).all()
        return plans
    except SQLAlchemyError as e:
        logger.error(f"Database error reading quarterly plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading quarterly plans")


@router.get("/{plan_id}", response_model=schemas.QuarterlyPlan)
def read_quarterly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(quarterly_plan_not_found(plan_id))
    return plan


@router.put("/{plan_id}", response_model=schemas.QuarterlyPlan)
def update_quarterly_plan(plan_id: int, plan: schemas.QuarterlyPlanUpdate, db: Session = Depends(get_db)):
    """
    Update a quarterly plan with optimistic locking.
    
    If client sends 'version', we verify it matches the current version
    to prevent lost updates from concurrent edits.
    """
    # Lock the row to prevent concurrent modifications
    db_plan = db.query(models.QuarterlyPlan).filter(
        models.QuarterlyPlan.id == plan_id
    ).with_for_update().first()
    if db_plan is None:
        raise to_http_exception(quarterly_plan_not_found(plan_id))
    
    # Get update data and check optimistic locking - version is REQUIRED
    update_data_raw = plan.dict(exclude_unset=True)
    client_version = update_data_raw.pop('version', None)
    current_version = getattr(db_plan, 'version', 1)
    if client_version is None:
        raise HTTPException(
            status_code=400,
            detail="Version field is required for updates. Please refresh the page and try again."
        )
    if client_version != current_version:
        raise HTTPException(
            status_code=409,
            detail=f"Quarterly plan was modified by another user. Please refresh and try again. (Your version: {client_version}, Current version: {current_version})"
        )
    
    contract = db.query(models.Contract).filter(models.Contract.id == db_plan.contract_id).first()
    if not contract:
        raise to_http_exception(contract_not_found(db_plan.contract_id))
    
    # Calculate new quarterly values
    q1 = plan.q1_quantity if plan.q1_quantity is not None else db_plan.q1_quantity
    q2 = plan.q2_quantity if plan.q2_quantity is not None else db_plan.q2_quantity
    q3 = plan.q3_quantity if plan.q3_quantity is not None else db_plan.q3_quantity
    q4 = plan.q4_quantity if plan.q4_quantity is not None else db_plan.q4_quantity
    total_quarterly = q1 + q2 + q3 + q4
    
    # CRITICAL: Validate that existing monthly plans fit within new quarterly allocations
    # This prevents reducing a quarter below what's already allocated in monthly plans
    # Use contract's fiscal_start_month for proper quarter calculation
    fiscal_start_month = contract.fiscal_start_month or 1
    _validate_monthly_plans_fit_quarterly(db, plan_id, {
        'q1_quantity': q1,
        'q2_quantity': q2,
        'q3_quantity': q3,
        'q4_quantity': q4,
    }, fiscal_start_month)
    
    # Use unified quantity utility for validation
    contract_products = parse_contract_products(contract)
    is_multi_product = len(contract_products) > 1
    product_name_for_limits = db_plan.product_name if (db_plan.product_name and is_multi_product) else None
    authority_topup = get_authority_topup_for_product(db, contract.id, product_name_for_limits)
    limits = get_contract_quantity_limits(contract_products, product_name_for_limits, authority_topup)
    
    target_label = db_plan.product_name if (db_plan.product_name and is_multi_product) else "contract"
    
    # Validate total must equal contract/product total (or up to max with optional/topups)
    if total_quarterly < limits['min_quantity']:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) is less than the {target_label} minimum ({limits['min_quantity']:,.0f} KT). The quarterly plan total must at least equal the minimum."
        )
    elif total_quarterly > limits['max_with_topup']:
        topup_msg = f" + {authority_topup:,.0f} KT authority top-up" if authority_topup > 0 else ""
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) exceeds maximum allowed ({limits['max_with_topup']:,.0f} KT = {limits['max_quantity']:,.0f} KT base + {limits['optional_quantity']:,.0f} KT optional{topup_msg})"
        )
    
    # Store old values for audit logging
    old_values = {}
    for field in ['q1_quantity', 'q2_quantity', 'q3_quantity', 'q4_quantity']:
        if hasattr(db_plan, field):
            old_values[field] = getattr(db_plan, field)
    
    update_data = plan.dict(exclude_unset=True)
    # Remove version from update_data since we already handled it
    update_data.pop('version', None)
    
    for field, value in update_data.items():
        old_val = old_values.get(field)
        setattr(db_plan, field, value)
        
        if old_val != value:
            log_quarterly_plan_action(
                db=db,
                action='UPDATE',
                quarterly_plan=db_plan,
                field_name=field,
                old_value=old_val,
                new_value=value
            )
    
    # Increment version for optimistic locking
    db_plan.version = getattr(db_plan, 'version', 1) + 1
    
    db.commit()
    db.refresh(db_plan)
    logger.info(f"Quarterly plan {plan_id} updated")
    return db_plan


@router.delete("/{plan_id}")
def delete_quarterly_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if db_plan is None:
        raise to_http_exception(quarterly_plan_not_found(plan_id))
    
    try:
        # IMPORTANT: audit logs must not block cascading deletes
        monthly_ids = [m.id for m in db.query(models.MonthlyPlan.id).filter(models.MonthlyPlan.quarterly_plan_id == plan_id).all()]
        if monthly_ids:
            cargo_ids = [c.id for c in db.query(models.Cargo.id).filter(models.Cargo.monthly_plan_id.in_(monthly_ids)).all()]
            if cargo_ids:
                db.query(models.CargoAuditLog).filter(models.CargoAuditLog.cargo_id.in_(cargo_ids)).update(
                    {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: models.CargoAuditLog.cargo_id},
                    synchronize_session=False
                )
            db.query(models.MonthlyPlanAuditLog).filter(models.MonthlyPlanAuditLog.monthly_plan_id.in_(monthly_ids)).update(
                {models.MonthlyPlanAuditLog.monthly_plan_id: None, models.MonthlyPlanAuditLog.monthly_plan_db_id: models.MonthlyPlanAuditLog.monthly_plan_id},
                synchronize_session=False
            )

        log_quarterly_plan_action(
            db=db,
            action='DELETE',
            quarterly_plan=db_plan
        )
        db.flush()

        db.query(models.QuarterlyPlanAuditLog).filter(
            models.QuarterlyPlanAuditLog.quarterly_plan_id == db_plan.id
        ).update(
            {models.QuarterlyPlanAuditLog.quarterly_plan_id: None, models.QuarterlyPlanAuditLog.quarterly_plan_db_id: db_plan.id},
            synchronize_session=False
        )

        db.delete(db_plan)
        db.commit()
        logger.info(f"Quarterly plan {plan_id} deleted")
        return {"message": "Quarterly plan deleted successfully"}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error deleting quarterly plan {plan_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting quarterly plan")
