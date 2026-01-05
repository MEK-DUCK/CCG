from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer, joinedload
from sqlalchemy import inspect
from typing import List
from app.database import get_db
from app import models, schemas
from app.models import ContractCategory
from app.utils.fiscal_year import calculate_contract_years, generate_quarterly_plan_periods, generate_monthly_plan_periods
from app.contract_audit_utils import log_contract_action, log_contract_field_changes, get_contract_snapshot
from app.utils.quantity import get_product_name_by_id
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

def _contracts_has_column(db: Session, column_name: str) -> bool:
    """Backward-compatible guard for deployments where DB schema lags behind code."""
    try:
        cols = inspect(db.bind).get_columns("contracts")
        return any(c.get("name") == column_name for c in cols)
    except Exception:
        return False


def _get_product_by_name(db: Session, name: str) -> models.Product:
    """Get product by name, raise HTTPException if not found."""
    product = db.query(models.Product).filter(
        models.Product.name == name,
        models.Product.is_active == True
    ).first()
    if not product:
        raise HTTPException(status_code=400, detail=f"Invalid product: {name}")
    return product


def _contract_to_dict(db_contract: models.Contract, has_remarks: bool = True, has_additives_required: bool = True) -> dict:
    """Convert a Contract model to dict with products and amendments as lists."""
    return {
        "id": db_contract.id,
        "contract_id": db_contract.contract_id,
        "contract_number": db_contract.contract_number,
        "contract_type": db_contract.contract_type,
        "contract_category": getattr(db_contract, "contract_category", ContractCategory.TERM),
        "payment_method": db_contract.payment_method,
        "start_period": db_contract.start_period,
        "end_period": db_contract.end_period,
        "fiscal_start_month": getattr(db_contract, "fiscal_start_month", 1),
        "products": db_contract.get_products_list(),
        "authority_amendments": db_contract.get_amendments_list(),
        "discharge_ranges": getattr(db_contract, "discharge_ranges", None),
        **({"additives_required": getattr(db_contract, "additives_required", None)} if has_additives_required else {}),
        "fax_received": getattr(db_contract, "fax_received", None),
        "fax_received_date": getattr(db_contract, "fax_received_date", None),
        "concluded_memo_received": getattr(db_contract, "concluded_memo_received", None),
        "concluded_memo_received_date": getattr(db_contract, "concluded_memo_received_date", None),
        "tng_lead_days": getattr(db_contract, "tng_lead_days", None),
        "tng_notes": getattr(db_contract, "tng_notes", None),
        "cif_destination": getattr(db_contract, "cif_destination", None),
        **({"remarks": getattr(db_contract, "remarks", None)} if has_remarks else {}),
        "customer_id": db_contract.customer_id,
        "version": getattr(db_contract, 'version', 1),
        "created_at": db_contract.created_at,
        "updated_at": db_contract.updated_at
    }


def _sync_contract_products(db: Session, contract: models.Contract, products_data: list):
    """
    Sync contract products - delete existing and create new ones.
    products_data is a list of dicts with product info.
    """
    import json
    
    # Delete existing contract products
    db.query(models.ContractProduct).filter(
        models.ContractProduct.contract_id == contract.id
    ).delete(synchronize_session=False)
    
    # Create new contract products
    for product_data in products_data:
        product_name = product_data.get("name") if isinstance(product_data, dict) else product_data.name
        product = _get_product_by_name(db, product_name)
        
        # Handle both dict and Pydantic model
        if isinstance(product_data, dict):
            total_qty = product_data.get("total_quantity")
            optional_qty = product_data.get("optional_quantity", 0)
            min_qty = product_data.get("min_quantity")
            max_qty = product_data.get("max_quantity")
            year_quantities = product_data.get("year_quantities")
        else:
            total_qty = product_data.total_quantity
            optional_qty = product_data.optional_quantity or 0
            min_qty = product_data.min_quantity
            max_qty = product_data.max_quantity
            year_quantities = product_data.year_quantities
        
        # Convert year_quantities to JSON if present
        year_quantities_json = None
        if year_quantities:
            if isinstance(year_quantities, list):
                year_quantities_json = json.dumps([
                    yq if isinstance(yq, dict) else yq.dict()
                    for yq in year_quantities
                ])
            else:
                year_quantities_json = json.dumps(year_quantities)
        
        cp = models.ContractProduct(
            contract_id=contract.id,
            product_id=product.id,
            total_quantity=total_qty,
            optional_quantity=optional_qty,
            min_quantity=min_qty,
            max_quantity=max_qty,
            year_quantities=year_quantities_json
        )
        db.add(cp)


def _sync_authority_amendments(db: Session, contract: models.Contract, amendments_data: list):
    """
    Sync authority amendments - delete existing and create new ones.
    Also applies amendments to contract product quantities.
    """
    from datetime import datetime
    
    # Delete existing amendments
    db.query(models.AuthorityAmendment).filter(
        models.AuthorityAmendment.contract_id == contract.id
    ).delete(synchronize_session=False)
    
    if not amendments_data:
        return
    
    # Get contract products for applying amendments
    contract_products = {cp.product.name: cp for cp in contract.contract_products}
    
    for amendment_data in amendments_data:
        # Handle both dict and Pydantic model
        if isinstance(amendment_data, dict):
            product_name = amendment_data.get("product_name")
            amendment_type = amendment_data.get("amendment_type")
            quantity_change = amendment_data.get("quantity_change")
            new_min = amendment_data.get("new_min_quantity")
            new_max = amendment_data.get("new_max_quantity")
            auth_ref = amendment_data.get("authority_reference")
            reason = amendment_data.get("reason")
            effective_date_str = amendment_data.get("effective_date")
            year = amendment_data.get("year")
        else:
            product_name = amendment_data.product_name
            amendment_type = amendment_data.amendment_type
            quantity_change = amendment_data.quantity_change
            new_min = amendment_data.new_min_quantity
            new_max = amendment_data.new_max_quantity
            auth_ref = amendment_data.authority_reference
            reason = amendment_data.reason
            effective_date_str = amendment_data.effective_date
            year = amendment_data.year
        
        # Validate product exists in contract
        if product_name not in contract_products:
            raise HTTPException(
                status_code=400,
                detail=f"Amendment product '{product_name}' not found in contract products"
            )
        
        product = _get_product_by_name(db, product_name)
        
        # Parse effective date
        effective_date = None
        if effective_date_str:
            if isinstance(effective_date_str, str):
                try:
                    effective_date = datetime.fromisoformat(effective_date_str.replace('Z', '+00:00')).date()
                except ValueError:
                    effective_date = datetime.strptime(effective_date_str, "%Y-%m-%d").date()
            else:
                effective_date = effective_date_str
        
        # Create amendment record
        aa = models.AuthorityAmendment(
            contract_id=contract.id,
            product_id=product.id,
            amendment_type=amendment_type,
            quantity_change=quantity_change,
            new_min_quantity=new_min,
            new_max_quantity=new_max,
            authority_reference=auth_ref,
            reason=reason,
            effective_date=effective_date,
            year=year
        )
        db.add(aa)
        
        # Apply amendment to contract product
        cp = contract_products[product_name]
        qty_change = quantity_change or 0
        
        if amendment_type == 'increase_max':
            cp.max_quantity = (cp.max_quantity or 0) + qty_change
        elif amendment_type == 'decrease_max':
            cp.max_quantity = max(0, (cp.max_quantity or 0) - qty_change)
        elif amendment_type == 'increase_min':
            cp.min_quantity = (cp.min_quantity or 0) + qty_change
        elif amendment_type == 'decrease_min':
            cp.min_quantity = max(0, (cp.min_quantity or 0) - qty_change)
        elif amendment_type == 'set_min' and new_min is not None:
            cp.min_quantity = new_min
        elif amendment_type == 'set_max' and new_max is not None:
            cp.max_quantity = new_max
        
        # Validate min <= max
        min_qty = cp.min_quantity or 0
        max_qty = cp.max_quantity or 0
        if min_qty > max_qty and max_qty > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Amendment would make min_quantity ({min_qty}) greater than max_quantity ({max_qty}) for product '{product_name}'"
            )


@router.post("/", response_model=schemas.Contract)
def create_contract(contract: schemas.ContractCreate, db: Session = Depends(get_db)):
    logger.info(f"Received contract creation request: {contract}")
    try:
        # Verify customer exists
        customer = db.query(models.Customer).filter(models.Customer.id == contract.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Validate products against database
        for product in contract.products:
            _get_product_by_name(db, product.name)
        
        # Generate system contract_id
        contract_id = f"CONT-{uuid.uuid4().hex[:8].upper()}"
        
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")
        
        # Determine fiscal start month (default to contract start month if not provided)
        fiscal_start_month = getattr(contract, "fiscal_start_month", None)
        if fiscal_start_month is None:
            fiscal_start_month = contract.start_period.month
        
        # Determine contract category
        contract_category = getattr(contract, "contract_category", None)
        if contract_category is None:
            contract_category = ContractCategory.TERM
        
        db_contract = models.Contract(
            contract_id=contract_id,
            contract_number=contract.contract_number,
            contract_type=contract.contract_type,
            contract_category=contract_category,
            payment_method=contract.payment_method,
            start_period=contract.start_period,
            end_period=contract.end_period,
            fiscal_start_month=fiscal_start_month,
            discharge_ranges=getattr(contract, "discharge_ranges", None),
            **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
            fax_received=getattr(contract, "fax_received", None),
            fax_received_date=getattr(contract, "fax_received_date", None),
            concluded_memo_received=getattr(contract, "concluded_memo_received", None),
            concluded_memo_received_date=getattr(contract, "concluded_memo_received_date", None),
            tng_lead_days=getattr(contract, "tng_lead_days", None),
            tng_notes=getattr(contract, "tng_notes", None),
            cif_destination=getattr(contract, "cif_destination", None),
            **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
            customer_id=contract.customer_id,
        )
        db.add(db_contract)
        db.flush()  # Get the contract ID
        
        # Create contract products (normalized)
        _sync_contract_products(db, db_contract, [p.dict() for p in contract.products])
        
        # Handle authority amendments if provided
        if getattr(contract, 'authority_amendments', None):
            db.flush()  # Ensure contract_products are created first
            db.refresh(db_contract)  # Reload to get contract_products
            _sync_authority_amendments(db, db_contract, [a.dict() for a in contract.authority_amendments])
        
        db.commit()
        db.refresh(db_contract)
        
        # Log contract creation
        log_contract_action(
            db=db,
            action='CREATE',
            contract=db_contract,
            description=f"Created contract {db_contract.contract_number} for customer {customer.name}"
        )
        db.commit()
        
        # Auto-generate quarterly plans for TERM and SEMI_TERM contracts
        # Skip for SPOT contracts and Range contracts (min/max mode)
        is_range_contract = any(
            (p.min_quantity is not None and p.min_quantity > 0) or 
            (p.max_quantity is not None and p.max_quantity > 0)
            for p in contract.products
        )
        
        if contract_category != ContractCategory.SPOT and not is_range_contract:
            num_years = calculate_contract_years(contract.start_period, contract.end_period)
            logger.info(f"Auto-generating {num_years} year(s) of quarterly plans for contract {db_contract.id}")
            
            for product in contract.products:
                # Get product_id from product name
                product_id = _get_product_by_name(db, product.name).id
                for contract_year in range(1, num_years + 1):
                    db_quarterly = models.QuarterlyPlan(
                        contract_id=db_contract.id,
                        product_id=product_id,
                        contract_year=contract_year,
                        q1_quantity=0,
                        q2_quantity=0,
                        q3_quantity=0,
                        q4_quantity=0
                    )
                    db.add(db_quarterly)
            
            db.commit()
            logger.info(f"Created quarterly plans for contract {db_contract.id}")
        elif is_range_contract:
            logger.info(f"Skipping quarterly plans for range contract {db_contract.id} (min/max mode)")
        
        # Reload contract with relationships
        db.refresh(db_contract)
        
        return _contract_to_dict(db_contract, has_remarks, has_additives_required)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error creating contract: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error creating contract: {str(e)}")

@router.get("/", response_model=List[schemas.Contract])
def read_contracts(
    customer_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        from sqlalchemy import desc
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")
        
        query = db.query(models.Contract).options(
            joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product),
            joinedload(models.Contract.authority_amendments).joinedload(models.AuthorityAmendment.product)
        )
        
        if not has_remarks:
            query = query.options(defer(models.Contract.remarks))
        if not has_additives_required:
            query = query.options(defer(models.Contract.additives_required))
        if customer_id:
            query = query.filter(models.Contract.customer_id == customer_id)
        
        # Order by created_at descending to get newest contracts first
        contracts = query.order_by(desc(models.Contract.created_at)).offset(skip).limit(limit).all()
        
        result = []
        for contract in contracts:
            # Skip contracts without customer_id (old data from before migration)
            if contract.customer_id is None:
                continue
            result.append(_contract_to_dict(contract, has_remarks, has_additives_required))
        
        return result
    except Exception as e:
        import traceback
        logger.error(f"Error reading contracts: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading contracts: {str(e)}")

@router.get("/eligible-for-cross-combi/{contract_id}")
def get_eligible_contracts_for_cross_combi(
    contract_id: int,
    month: int = Query(..., ge=1, le=12, description="Month for the combi cargo"),
    year: int = Query(..., ge=2020, le=2100, description="Year for the combi cargo"),
    db: Session = Depends(get_db)
):
    """
    Get contracts eligible for cross-contract combi with the specified contract.
    
    Eligibility criteria:
    - Same customer
    - Same contract type (FOB or CIF)
    - Contract period overlaps with the specified month/year
    - Has products (not empty)
    - Excludes the source contract itself
    
    Returns contracts with their products and monthly plans for the specified month.
    """
    from datetime import date
    
    try:
        # Get the source contract
        source_contract = db.query(models.Contract).options(
            joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product)
        ).filter(
            models.Contract.id == contract_id
        ).first()
        
        if not source_contract:
            raise HTTPException(status_code=404, detail="Source contract not found")
        
        # Build the target date for period check
        target_date = date(year, month, 1)
        
        # Find eligible contracts
        eligible_contracts = db.query(models.Contract).options(
            joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product)
        ).filter(
            models.Contract.customer_id == source_contract.customer_id,
            models.Contract.contract_type == source_contract.contract_type,
            models.Contract.id != contract_id,
            models.Contract.start_period <= target_date,
            models.Contract.end_period >= target_date
        ).all()
        
        result = []
        for contract in eligible_contracts:
            products = contract.get_products_list()
            
            if not products:
                continue  # Skip contracts with no products
            
            # Get monthly plans for this contract in the specified month/year
            monthly_plans = db.query(models.MonthlyPlan).filter(
                models.MonthlyPlan.contract_id == contract.id,
                models.MonthlyPlan.month == month,
                models.MonthlyPlan.year == year
            ).all()
            
            # Build monthly plans info
            plans_info = []
            for mp in monthly_plans:
                # Check if this plan already has a cargo
                existing_cargo = db.query(models.Cargo).filter(
                    models.Cargo.monthly_plan_id == mp.id
                ).first()
                
                plans_info.append({
                    "id": mp.id,
                    "product_name": get_product_name_by_id(db, mp.product_id) if mp.product_id else None,
                    "month_quantity": mp.month_quantity,
                    "has_cargo": existing_cargo is not None,
                    "combi_group_id": mp.combi_group_id,
                    "laycan_5_days": mp.laycan_5_days,
                    "laycan_2_days": mp.laycan_2_days,
                    "loading_window": mp.loading_window,
                })
            
            result.append({
                "id": contract.id,
                "contract_id": contract.contract_id,
                "contract_number": contract.contract_number,
                "contract_type": contract.contract_type.value if hasattr(contract.contract_type, 'value') else contract.contract_type,
                "products": products,
                "monthly_plans": plans_info
            })
        
        return {
            "source_contract": {
                "id": source_contract.id,
                "contract_number": source_contract.contract_number,
                "contract_type": source_contract.contract_type.value if hasattr(source_contract.contract_type, 'value') else source_contract.contract_type,
                "customer_id": source_contract.customer_id,
            },
            "eligible_contracts": result,
            "month": month,
            "year": year
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Error getting eligible contracts for cross-combi: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{contract_id}", response_model=schemas.Contract)
def read_contract(contract_id: int, db: Session = Depends(get_db)):
    try:
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")
        
        query = db.query(models.Contract).options(
            joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product),
            joinedload(models.Contract.authority_amendments).joinedload(models.AuthorityAmendment.product)
        )
        
        if not has_remarks:
            query = query.options(defer(models.Contract.remarks))
        if not has_additives_required:
            query = query.options(defer(models.Contract.additives_required))
        
        contract = query.filter(models.Contract.id == contract_id).first()
        if contract is None:
            raise HTTPException(status_code=404, detail="Contract not found")
        
        return _contract_to_dict(contract, has_remarks, has_additives_required)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error loading contract {contract_id}: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=f"Error loading contract: {str(e)}")

@router.put("/{contract_id}", response_model=schemas.Contract)
def update_contract(contract_id: int, contract: schemas.ContractUpdate, db: Session = Depends(get_db)):
    """
    Update a contract with optimistic locking.
    
    If client sends 'version', we verify it matches the current version
    to prevent lost updates from concurrent edits.
    """
    has_remarks = _contracts_has_column(db, "remarks")
    has_additives_required = _contracts_has_column(db, "additives_required")
    
    # Use SELECT FOR UPDATE to prevent concurrent modifications
    query = db.query(models.Contract).options(
        joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product),
        joinedload(models.Contract.authority_amendments).joinedload(models.AuthorityAmendment.product)
    )
    if not has_remarks:
        query = query.options(defer(models.Contract.remarks))
    if not has_additives_required:
        query = query.options(defer(models.Contract.additives_required))
    
    db_contract = query.filter(models.Contract.id == contract_id).with_for_update().first()
    if db_contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Capture old values for audit logging
    old_values = get_contract_snapshot(db_contract)
    
    update_data = contract.dict(exclude_unset=True)
    
    # Optimistic locking check - version is REQUIRED to prevent lost updates
    client_version = update_data.pop('version', None)
    current_version = getattr(db_contract, 'version', 1)
    if client_version is None:
        raise HTTPException(
            status_code=400,
            detail="Version field is required for updates. Please refresh the page and try again."
        )
    if client_version != current_version:
        raise HTTPException(
            status_code=409,
            detail=f"Contract was modified by another user. Please refresh and try again. (Your version: {client_version}, Current version: {current_version})"
        )

    if "remarks" in update_data and not has_remarks:
        raise HTTPException(
            status_code=400,
            detail="Contract remarks field is not available in the database yet. Please apply the remarks migration and try again."
        )

    if "additives_required" in update_data and not has_additives_required:
        raise HTTPException(
            status_code=400,
            detail="Contract additives_required field is not available in the database yet. Please apply the additives_required migration and try again."
        )

    # Validate date range even for partial updates (one side changed)
    new_start = update_data.get("start_period", db_contract.start_period)
    new_end = update_data.get("end_period", db_contract.end_period)
    if new_start and new_end and new_start > new_end:
        raise HTTPException(status_code=400, detail="start_period must be on or before end_period")
    
    # Handle products update (normalized)
    if "products" in update_data:
        for product in update_data["products"]:
            _get_product_by_name(db, product["name"])
        _sync_contract_products(db, db_contract, update_data["products"])
        del update_data["products"]  # Don't try to set as attribute
    
    # Handle authority_amendments update (normalized)
    if "authority_amendments" in update_data:
        db.flush()  # Ensure products are synced first
        db.refresh(db_contract)
        _sync_authority_amendments(db, db_contract, update_data["authority_amendments"])
        del update_data["authority_amendments"]  # Don't try to set as attribute
    
    # Verify customer if being updated
    if "customer_id" in update_data:
        customer = db.query(models.Customer).filter(models.Customer.id == update_data["customer_id"]).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    
    # Update remaining fields
    for field, value in update_data.items():
        setattr(db_contract, field, value)
    
    # Increment version for optimistic locking
    db_contract.version = getattr(db_contract, 'version', 1) + 1
    
    db.commit()
    db.refresh(db_contract)
    
    # Log contract update with field changes
    new_values = get_contract_snapshot(db_contract)
    log_contract_field_changes(db, db_contract, old_values, new_values)
    db.commit()
    
    return _contract_to_dict(db_contract, has_remarks, has_additives_required)


@router.delete("/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db)):
    try:
        db_contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
        if db_contract is None:
            raise HTTPException(status_code=404, detail="Contract not found")
        
        # Capture contract info for audit log before deletion
        contract_number = db_contract.contract_number
        customer = db.query(models.Customer).filter(models.Customer.id == db_contract.customer_id).first()
        customer_name = customer.name if customer else None
        contract_snapshot = get_contract_snapshot(db_contract)
        
        # Log contract deletion before actually deleting
        log_contract_action(
            db=db,
            action='DELETE',
            contract=db_contract,
            description=f"Deleted contract {contract_number}" + (f" ({customer_name})" if customer_name else ""),
            contract_snapshot=contract_snapshot
        )

        # IMPORTANT: audit logs must not block cascading deletes.
        # Null FK references first, preserve history via snapshots + identifiers.
        cargo_ids = [c.id for c in db.query(models.Cargo.id).filter(models.Cargo.contract_id == contract_id).all()]
        if cargo_ids:
            db.query(models.CargoAuditLog).filter(models.CargoAuditLog.cargo_id.in_(cargo_ids)).update(
                {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: models.CargoAuditLog.cargo_id},
                synchronize_session=False
            )

        quarterly_ids = [q.id for q in db.query(models.QuarterlyPlan.id).filter(models.QuarterlyPlan.contract_id == contract_id).all()]
        if quarterly_ids:
            monthly_ids = [m.id for m in db.query(models.MonthlyPlan.id).filter(models.MonthlyPlan.quarterly_plan_id.in_(quarterly_ids)).all()]
            if monthly_ids:
                db.query(models.MonthlyPlanAuditLog).filter(models.MonthlyPlanAuditLog.monthly_plan_id.in_(monthly_ids)).update(
                    {models.MonthlyPlanAuditLog.monthly_plan_id: None, models.MonthlyPlanAuditLog.monthly_plan_db_id: models.MonthlyPlanAuditLog.monthly_plan_id},
                    synchronize_session=False
                )
            db.query(models.QuarterlyPlanAuditLog).filter(models.QuarterlyPlanAuditLog.quarterly_plan_id.in_(quarterly_ids)).update(
                {models.QuarterlyPlanAuditLog.quarterly_plan_id: None, models.QuarterlyPlanAuditLog.quarterly_plan_db_id: models.QuarterlyPlanAuditLog.quarterly_plan_id},
                synchronize_session=False
            )
        
        # Null out contract audit log FK references
        db.query(models.ContractAuditLog).filter(models.ContractAuditLog.contract_id == contract_id).update(
            {models.ContractAuditLog.contract_id: None},
            synchronize_session=False
        )

        db.delete(db_contract)
        db.commit()
        return {"message": "Contract deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        logger.error(f"Error deleting contract: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting contract: {str(e)}")

@router.get("/authorities/all")
def get_all_authorities(
    contract_id: int | None = Query(None, description="Filter by contract ID"),
    product_name: str | None = Query(None, description="Filter by product name"),
    db: Session = Depends(get_db)
):
    """
    Get all authority amendments and top-ups across all contracts.
    Top-ups are tracked at monthly plan level, amendments at contract level.
    """
    from datetime import datetime
    
    authorities = []
    
    # Get all contracts with their amendments
    query = db.query(models.Contract).options(
        joinedload(models.Contract.authority_amendments).joinedload(models.AuthorityAmendment.product)
    )
    if contract_id:
        query = query.filter(models.Contract.id == contract_id)
    contracts = query.all()
    
    # Get customer names for display
    customer_map = {c.id: c.name for c in db.query(models.Customer).all()}
    
    for contract in contracts:
        customer_name = customer_map.get(contract.customer_id, "Unknown")
        
        # Process Authority Amendments (now from relationship)
        for amendment in contract.authority_amendments:
            if product_name and amendment.product.name != product_name:
                continue
            authorities.append({
                "type": "Amendment",
                "contract_id": contract.id,
                "contract_number": contract.contract_number,
                "customer_name": customer_name,
                "product_name": amendment.product.name,
                "amendment_type": amendment.amendment_type,
                "quantity_change": amendment.quantity_change or 0,
                "authority_reference": amendment.authority_reference,
                "effective_date": amendment.effective_date.isoformat() if amendment.effective_date else None,
                "year": amendment.year,
                "reason": amendment.reason or '',
                "created_at": contract.updated_at.isoformat() if contract.updated_at else None
            })
    
    # Process Monthly Plan-Level Authority Top-Ups
    monthly_plan_query = db.query(models.MonthlyPlan).options(
        joinedload(models.MonthlyPlan.product)
    ).filter(
        models.MonthlyPlan.authority_topup_quantity > 0
    )
    if contract_id:
        monthly_plan_query = monthly_plan_query.filter(models.MonthlyPlan.contract_id == contract_id)
    if product_name:
        # Look up product_id from product_name
        from app.utils.quantity import get_product_id_by_name
        product_id = get_product_id_by_name(db, product_name)
        if product_id:
            monthly_plan_query = monthly_plan_query.filter(models.MonthlyPlan.product_id == product_id)
    
    monthly_plans = monthly_plan_query.all()
    
    for mp in monthly_plans:
        # Get contract info
        contract = db.query(models.Contract).filter(models.Contract.id == mp.contract_id).first()
        if not contract:
            continue
        
        customer_name = customer_map.get(contract.customer_id, "Unknown")
        mp_product_name = mp.product.name if mp.product else ''
        
        authorities.append({
            "type": "Top-Up (Monthly Plan)",
            "contract_id": contract.id,
            "contract_number": contract.contract_number,
            "customer_name": customer_name,
            "product_name": mp_product_name,
            "quantity": mp.authority_topup_quantity or 0,
            "authority_reference": mp.authority_topup_reference or '',
            "authorization_date": mp.authority_topup_date.isoformat() if mp.authority_topup_date else None,
            "reason": mp.authority_topup_reason or '',
            "month": mp.month,
            "year": mp.year,
            "monthly_plan_id": mp.id,
            "created_at": mp.updated_at.isoformat() if mp.updated_at else None
        })
    
    # Sort by date (most recent first)
    authorities.sort(key=lambda x: x.get('created_at') or x.get('authorization_date') or x.get('effective_date') or '', reverse=True)
    
    return {
        "authorities": authorities,
        "total_count": len(authorities)
    }
