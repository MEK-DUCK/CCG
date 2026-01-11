from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from typing import List
import logging
import json

from app.database import get_db
from app import models, schemas
from app.auth import require_auth
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
    get_product_id_by_name,
    get_product_name_by_id,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _quarterly_plan_to_schema(plan: models.QuarterlyPlan, db: Session) -> dict:
    """
    Convert a QuarterlyPlan model to a schema-compatible dict.
    
    Translates product_id back to product_name for API compatibility with frontend.
    """
    product_name = None
    if plan.product_id:
        product_name = get_product_name_by_id(db, plan.product_id)
    
    return {
        "id": plan.id,
        "product_name": product_name,
        "contract_year": plan.contract_year,
        "q1_quantity": plan.q1_quantity,
        "q2_quantity": plan.q2_quantity,
        "q3_quantity": plan.q3_quantity,
        "q4_quantity": plan.q4_quantity,
        "contract_id": plan.contract_id,
        "adjustment_notes": plan.adjustment_notes,
        "version": plan.version,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


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
def create_quarterly_plan(plan: schemas.QuarterlyPlanCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    from sqlalchemy.orm import joinedload
    
    # Verify contract exists
    contract = db.query(models.Contract).options(
        joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product)
    ).filter(models.Contract.id == plan.contract_id).first()
    if not contract:
        raise to_http_exception(contract_not_found(plan.contract_id))
    
    # Get contract products from normalized relationship
    contract_products = contract.get_products_list()
    is_multi_product = len(contract_products) > 1
    
    # Determine the product_id and product_name to use for this plan
    # For single-product contracts, always use the product from the contract
    product_id_to_store = None
    product_name_for_display = None
    
    if plan.product_name and is_multi_product:
        # Multi-product contract with specified product
        product_id_to_store = get_product_id_by_name(db, plan.product_name)
        product_name_for_display = plan.product_name
    elif len(contract_products) == 1 and contract_products[0]:
        # Single-product contract - use the contract's product
        product_id_to_store = contract_products[0].get('product_id')
        product_name_for_display = contract_products[0].get('name')
    elif len(contract_products) == 0:
        # No products in contract - cannot create quarterly plan
        raise HTTPException(
            status_code=400,
            detail="Cannot create quarterly plan: contract has no products"
        )
    elif plan.product_name:
        # Multi-product but product specified
        product_id_to_store = get_product_id_by_name(db, plan.product_name)
        product_name_for_display = plan.product_name
    
    # Check if plan already exists for this product
    existing_plan_query = db.query(models.QuarterlyPlan).filter(
        models.QuarterlyPlan.contract_id == plan.contract_id
    )
    
    if product_id_to_store:
        # Check for exact match OR null (legacy single-product plans)
        from sqlalchemy import or_
        existing_plan = existing_plan_query.filter(
            or_(
                models.QuarterlyPlan.product_id == product_id_to_store,
                models.QuarterlyPlan.product_id == None
            ) if not is_multi_product else models.QuarterlyPlan.product_id == product_id_to_store
        ).first()
    else:
        existing_plan = existing_plan_query.filter(
            models.QuarterlyPlan.product_id == None
        ).first()
    
    if existing_plan:
        product_label = product_name_for_display or "this contract"
        raise HTTPException(
            status_code=409,
            detail=f"A quarterly plan already exists for {product_label}. Please edit the existing plan or delete it first."
        )
    
    # Calculate total quarterly quantity
    total_quarterly = plan.q1_quantity + plan.q2_quantity + plan.q3_quantity + plan.q4_quantity
    
    # Use unified quantity utility for validation
    product_name_for_limits = plan.product_name if (plan.product_name and is_multi_product) else None
    authority_topup = get_authority_topup_for_product(db, contract.id, product_name=product_name_for_limits, product_id=product_id_to_store)
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
    
    # Create the quarterly plan with normalized product_id
    db_plan = models.QuarterlyPlan(
        q1_quantity=plan.q1_quantity,
        q2_quantity=plan.q2_quantity,
        q3_quantity=plan.q3_quantity,
        q4_quantity=plan.q4_quantity,
        contract_id=plan.contract_id,
        product_id=product_id_to_store,
        contract_year=plan.contract_year
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
    logger.info(f"Quarterly plan created: id={db_plan.id}, contract={plan.contract_id}, product_id={product_id_to_store}")
    return _quarterly_plan_to_schema(db_plan, db)


@router.get("/", response_model=List[schemas.QuarterlyPlan])
def read_quarterly_plans(
    contract_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    try:
        from sqlalchemy.orm import joinedload
        query = db.query(models.QuarterlyPlan).options(
            joinedload(models.QuarterlyPlan.product)
        )
        if contract_id:
            query = query.filter(models.QuarterlyPlan.contract_id == contract_id)
        plans = query.offset(skip).limit(limit).all()
        return [_quarterly_plan_to_schema(p, db) for p in plans]
    except SQLAlchemyError as e:
        logger.error(f"Database error reading quarterly plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading quarterly plans")


@router.get("/{plan_id}", response_model=schemas.QuarterlyPlan)
def read_quarterly_plan(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    from sqlalchemy.orm import joinedload
    plan = db.query(models.QuarterlyPlan).options(
        joinedload(models.QuarterlyPlan.product)
    ).filter(models.QuarterlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(quarterly_plan_not_found(plan_id))
    return _quarterly_plan_to_schema(plan, db)


@router.get("/{plan_id}/adjustments")
def get_quarterly_plan_adjustments(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """
    Get all authority-approved adjustments for a quarterly plan.
    Returns the history of cross-quarter defer/advance operations.
    """
    plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if plan is None:
        raise to_http_exception(quarterly_plan_not_found(plan_id))
    
    adjustments = db.query(models.QuarterlyPlanAdjustment).filter(
        models.QuarterlyPlanAdjustment.quarterly_plan_id == plan_id
    ).order_by(models.QuarterlyPlanAdjustment.created_at.desc()).all()
    
    return [
        {
            "id": adj.id,
            "adjustment_type": adj.adjustment_type,
            "quantity": adj.quantity,
            "from_quarter": adj.from_quarter,
            "to_quarter": adj.to_quarter,
            "from_year": adj.from_year,
            "to_year": adj.to_year,
            "authority_reference": adj.authority_reference,
            "reason": adj.reason,
            "monthly_plan_id": adj.monthly_plan_id,
            "created_at": adj.created_at.isoformat() if adj.created_at else None,
            "user_initials": adj.user_initials,
        }
        for adj in adjustments
    ]


@router.get("/contract/{contract_id}/adjustments")
def get_contract_quarterly_adjustments(contract_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """
    Get all authority-approved adjustments for all quarterly plans of a contract.
    Useful for displaying adjustment history in the quarterly plan view.
    """
    # Get all quarterly plans for this contract
    plans = db.query(models.QuarterlyPlan).filter(
        models.QuarterlyPlan.contract_id == contract_id
    ).all()
    
    if not plans:
        return []
    
    plan_ids = [p.id for p in plans]
    
    adjustments = db.query(models.QuarterlyPlanAdjustment).filter(
        models.QuarterlyPlanAdjustment.quarterly_plan_id.in_(plan_ids)
    ).order_by(models.QuarterlyPlanAdjustment.created_at.desc()).all()
    
    return [
        {
            "id": adj.id,
            "quarterly_plan_id": adj.quarterly_plan_id,
            "adjustment_type": adj.adjustment_type,
            "quantity": adj.quantity,
            "from_quarter": adj.from_quarter,
            "to_quarter": adj.to_quarter,
            "from_year": adj.from_year,
            "to_year": adj.to_year,
            "authority_reference": adj.authority_reference,
            "reason": adj.reason,
            "monthly_plan_id": adj.monthly_plan_id,
            "created_at": adj.created_at.isoformat() if adj.created_at else None,
            "user_initials": adj.user_initials,
        }
        for adj in adjustments
    ]


@router.put("/{plan_id}", response_model=schemas.QuarterlyPlan)
def update_quarterly_plan(plan_id: int, plan: schemas.QuarterlyPlanUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
    # Get product_name from product_id for validation and display
    product_name_for_display = get_product_name_by_id(db, db_plan.product_id) if db_plan.product_id else None
    product_name_for_limits = product_name_for_display if (product_name_for_display and is_multi_product) else None
    authority_topup = get_authority_topup_for_product(db, contract.id, product_id=db_plan.product_id)
    limits = get_contract_quantity_limits(contract_products, product_name_for_limits, authority_topup)
    
    target_label = product_name_for_display if (product_name_for_display and is_multi_product) else "contract"
    
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
    # Remove version and product_name from update_data since we handle them specially
    update_data.pop('version', None)
    update_data.pop('product_name', None)  # product_id is immutable after creation
    
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
    return _quarterly_plan_to_schema(db_plan, db)


@router.delete("/{plan_id}")
def delete_quarterly_plan(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
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
