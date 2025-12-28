from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer
from sqlalchemy import inspect
from typing import List
from app.database import get_db
from app import models, schemas
from app.models import ContractCategory
from app.utils.fiscal_year import calculate_contract_years, generate_quarterly_plan_periods, generate_monthly_plan_periods
from app.contract_audit_utils import log_contract_action, log_contract_field_changes, get_contract_snapshot
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

@router.post("/", response_model=schemas.Contract)
def create_contract(contract: schemas.ContractCreate, db: Session = Depends(get_db)):
    logger.info(f"Received contract creation request: {contract}")
    try:
        import json
        # Verify customer exists
        customer = db.query(models.Customer).filter(models.Customer.id == contract.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Validate products against database
        # Fetch valid product names from database, or fall back to defaults if table doesn't exist yet
        try:
            db_products = db.query(models.Product).filter(models.Product.is_active == True).all()
            valid_products = [p.name for p in db_products] if db_products else ["JET A-1", "GASOIL", "GASOIL 10PPM", "HFO", "LSFO"]
        except Exception:
            # Products table might not exist yet
            valid_products = ["JET A-1", "GASOIL", "GASOIL 10PPM", "HFO", "LSFO"]
        
        for product in contract.products:
            if product.name not in valid_products:
                raise HTTPException(status_code=400, detail=f"Invalid product: {product.name}. Must be one of: {', '.join(valid_products)}")
        
        # Generate system contract_id
        contract_id = f"CONT-{uuid.uuid4().hex[:8].upper()}"
        
        # Store products as JSON string
        products_json = json.dumps([p.dict() for p in contract.products])
        
        # Calculate total quantity from products for backward compatibility with old schema
        # Support both fixed mode (total_quantity) and min/max mode (max_quantity)
        total_quantity = sum(
            (p.total_quantity or 0) if p.total_quantity is not None else (p.max_quantity or 0)
            for p in contract.products
        )
        
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")

        # Handle authority top-ups if provided
        authority_topups_json = None
        if contract.authority_topups:
            authority_topups_json = json.dumps([t.dict() for t in contract.authority_topups], default=str)
        
        # Handle authority amendments if provided
        authority_amendments_json = None
        if getattr(contract, 'authority_amendments', None):
            authority_amendments_json = json.dumps([a.dict() for a in contract.authority_amendments], default=str)
        
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
            products=products_json,
            authority_topups=authority_topups_json,
            authority_amendments=authority_amendments_json,
            discharge_ranges=getattr(contract, "discharge_ranges", None),
            **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
            fax_received=getattr(contract, "fax_received", None),
            fax_received_date=getattr(contract, "fax_received_date", None),
            concluded_memo_received=getattr(contract, "concluded_memo_received", None),
            concluded_memo_received_date=getattr(contract, "concluded_memo_received_date", None),
            **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
            customer_id=contract.customer_id,
            total_quantity=total_quantity,  # Set for backward compatibility
            product_id=0  # Legacy field, set to 0 for backward compatibility
        )
        db.add(db_contract)
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
        if contract_category != ContractCategory.SPOT:
            num_years = calculate_contract_years(contract.start_period, contract.end_period)
            logger.info(f"Auto-generating {num_years} year(s) of quarterly plans for contract {db_contract.id}")
            
            for product in contract.products:
                for contract_year in range(1, num_years + 1):
                    db_quarterly = models.QuarterlyPlan(
                        contract_id=db_contract.id,
                        product_name=product.name,
                        contract_year=contract_year,
                        q1_quantity=0,
                        q2_quantity=0,
                        q3_quantity=0,
                        q4_quantity=0
                    )
                    db.add(db_quarterly)
            
            db.commit()
            logger.info(f"Created quarterly plans for contract {db_contract.id}")
        
        # Convert products JSON string to list for response
        contract_dict = {
            "id": db_contract.id,
            "contract_id": db_contract.contract_id,
            "contract_number": db_contract.contract_number,
            "contract_type": db_contract.contract_type,
            "contract_category": db_contract.contract_category,
            "payment_method": db_contract.payment_method,
            "start_period": db_contract.start_period,
            "end_period": db_contract.end_period,
            "fiscal_start_month": db_contract.fiscal_start_month,
            "products": json.loads(db_contract.products) if db_contract.products else [],
            "authority_topups": json.loads(db_contract.authority_topups) if db_contract.authority_topups else None,
            "discharge_ranges": getattr(db_contract, "discharge_ranges", None),
            **({"additives_required": getattr(db_contract, "additives_required", None)} if has_additives_required else {}),
            "fax_received": getattr(db_contract, "fax_received", None),
            "fax_received_date": getattr(db_contract, "fax_received_date", None),
            "concluded_memo_received": getattr(db_contract, "concluded_memo_received", None),
            "concluded_memo_received_date": getattr(db_contract, "concluded_memo_received_date", None),
            **({"remarks": getattr(db_contract, "remarks", None)} if has_remarks else {}),
            "customer_id": db_contract.customer_id,
            "created_at": db_contract.created_at,
            "updated_at": db_contract.updated_at
        }
        return contract_dict
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
        import json
        from sqlalchemy import desc
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")
        query = db.query(models.Contract)
        if not has_remarks:
            query = query.options(defer(models.Contract.remarks))
        if not has_additives_required:
            query = query.options(defer(models.Contract.additives_required))
        if customer_id:
            query = query.filter(models.Contract.customer_id == customer_id)
        # Order by created_at descending to get newest contracts first
        contracts = query.order_by(desc(models.Contract.created_at)).offset(skip).limit(limit).all()
        
        # Convert products JSON string to list for each contract
        result = []
        for contract in contracts:
            # Skip contracts without customer_id (old data from before migration)
            if contract.customer_id is None:
                continue
            try:
                products = json.loads(contract.products) if contract.products else []
            except json.JSONDecodeError:
                print(f"[WARNING] Failed to parse products JSON for contract {contract.id}")
                products = []
            
            # Parse authority topups
            try:
                authority_topups = json.loads(contract.authority_topups) if contract.authority_topups else None
            except json.JSONDecodeError:
                authority_topups = None
            
            # Parse authority amendments
            try:
                authority_amendments = json.loads(contract.authority_amendments) if contract.authority_amendments else None
            except json.JSONDecodeError:
                authority_amendments = None
            
            contract_dict = {
                "id": contract.id,
                "contract_id": contract.contract_id,
                "contract_number": contract.contract_number,
                "contract_type": contract.contract_type,
                "contract_category": getattr(contract, "contract_category", ContractCategory.TERM),
                "payment_method": contract.payment_method,
                "start_period": contract.start_period,
                "end_period": contract.end_period,
                "fiscal_start_month": getattr(contract, "fiscal_start_month", 1),
                "products": products,
                "authority_topups": authority_topups,
                "authority_amendments": authority_amendments,
                "discharge_ranges": getattr(contract, "discharge_ranges", None),
                **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
                "fax_received": getattr(contract, "fax_received", None),
                "fax_received_date": getattr(contract, "fax_received_date", None),
                "concluded_memo_received": getattr(contract, "concluded_memo_received", None),
                "concluded_memo_received_date": getattr(contract, "concluded_memo_received_date", None),
                **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
                "customer_id": contract.customer_id,
                "version": getattr(contract, 'version', 1),
                "created_at": contract.created_at,
                "updated_at": contract.updated_at
            }
            result.append(contract_dict)
        
        return result
    except Exception as e:
        import traceback
        logger.error(f"Error reading contracts: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading contracts: {str(e)}")

@router.get("/{contract_id}", response_model=schemas.Contract)
def read_contract(contract_id: int, db: Session = Depends(get_db)):
    import json
    try:
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")
        query = db.query(models.Contract)
        if not has_remarks:
            query = query.options(defer(models.Contract.remarks))
        if not has_additives_required:
            query = query.options(defer(models.Contract.additives_required))
        contract = query.filter(models.Contract.id == contract_id).first()
        if contract is None:
            raise HTTPException(status_code=404, detail="Contract not found")
        
        # Parse products JSON string to list for response
        products_list = []
        if contract.products:
            try:
                products_list = json.loads(contract.products)
            except json.JSONDecodeError as e:
                print(f"[ERROR] Failed to parse products JSON for contract {contract_id}: {e}")
                print(f"[ERROR] Products value: {contract.products}")
                products_list = []
        
        # Parse authority topups
        authority_topups_list = None
        if contract.authority_topups:
            try:
                authority_topups_list = json.loads(contract.authority_topups)
            except json.JSONDecodeError:
                authority_topups_list = None
        
        # Parse authority amendments
        authority_amendments_list = None
        if contract.authority_amendments:
            try:
                authority_amendments_list = json.loads(contract.authority_amendments)
            except json.JSONDecodeError:
                authority_amendments_list = None
        
        # Convert products JSON string to list for response
        contract_dict = {
            "id": contract.id,
            "contract_id": contract.contract_id,
            "contract_number": contract.contract_number,
            "contract_type": contract.contract_type,
            "contract_category": getattr(contract, "contract_category", ContractCategory.TERM),
            "payment_method": contract.payment_method,
            "start_period": contract.start_period,
            "end_period": contract.end_period,
            "fiscal_start_month": getattr(contract, "fiscal_start_month", 1),
            "products": products_list,
            "authority_topups": authority_topups_list,
            "authority_amendments": authority_amendments_list,
            "discharge_ranges": getattr(contract, "discharge_ranges", None),
            **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
            "fax_received": getattr(contract, "fax_received", None),
            "fax_received_date": getattr(contract, "fax_received_date", None),
            "concluded_memo_received": getattr(contract, "concluded_memo_received", None),
            "concluded_memo_received_date": getattr(contract, "concluded_memo_received_date", None),
            **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
            "customer_id": contract.customer_id,
            "version": getattr(contract, 'version', 1),
            "created_at": contract.created_at,
            "updated_at": contract.updated_at
        }
        return contract_dict
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
    import json
    has_remarks = _contracts_has_column(db, "remarks")
    has_additives_required = _contracts_has_column(db, "additives_required")
    
    # Use SELECT FOR UPDATE to prevent concurrent modifications
    query = db.query(models.Contract)
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
    
    # Handle products conversion to JSON
    if "products" in update_data:
        valid_products = ["JET A-1", "GASOIL", "GASOIL 10PPM", "HFO", "LSFO"]
        for product in update_data["products"]:
            if product["name"] not in valid_products:
                raise HTTPException(status_code=400, detail=f"Invalid product: {product['name']}. Must be one of: {', '.join(valid_products)}")
        update_data["products"] = json.dumps(update_data["products"])
    
    # Handle authority_topups conversion to JSON
    if "authority_topups" in update_data:
        if update_data["authority_topups"]:
            # Validate that top-up products exist in contract products
            contract_products = json.loads(db_contract.products) if db_contract.products else []
            if "products" in update_data:
                contract_products = json.loads(update_data["products"])
            product_names = {p.get('name') for p in contract_products}
            
            for topup in update_data["authority_topups"]:
                if topup.get("product_name") not in product_names:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Top-up product '{topup.get('product_name')}' not found in contract products: {product_names}"
                    )
            
            # Convert to JSON, handling date serialization
            update_data["authority_topups"] = json.dumps(update_data["authority_topups"], default=str)
        else:
            update_data["authority_topups"] = None
    
    # Handle authority_amendments conversion to JSON
    if "authority_amendments" in update_data:
        if update_data["authority_amendments"]:
            # Validate that amendment products exist in contract products
            contract_products = json.loads(db_contract.products) if db_contract.products else []
            if "products" in update_data:
                contract_products = json.loads(update_data["products"])
            product_names = {p.get('name') for p in contract_products}
            
            for amendment in update_data["authority_amendments"]:
                if amendment.get("product_name") not in product_names:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Amendment product '{amendment.get('product_name')}' not found in contract products: {product_names}"
                    )
            
            # Convert to JSON, handling date serialization
            update_data["authority_amendments"] = json.dumps(update_data["authority_amendments"], default=str)
        else:
            update_data["authority_amendments"] = None
    
    # Verify customer if being updated
    if "customer_id" in update_data:
        customer = db.query(models.Customer).filter(models.Customer.id == update_data["customer_id"]).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    
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
    
    # Convert products JSON string to list for response
    contract_dict = {
        "id": db_contract.id,
        "contract_id": db_contract.contract_id,
        "contract_number": db_contract.contract_number,
        "contract_type": db_contract.contract_type,
        "contract_category": getattr(db_contract, "contract_category", "TERM"),
        "payment_method": db_contract.payment_method,
        "start_period": db_contract.start_period,
        "end_period": db_contract.end_period,
        "fiscal_start_month": getattr(db_contract, "fiscal_start_month", None),
        "products": json.loads(db_contract.products) if db_contract.products else [],
        "authority_topups": json.loads(db_contract.authority_topups) if db_contract.authority_topups else None,
        "authority_amendments": json.loads(db_contract.authority_amendments) if db_contract.authority_amendments else None,
        "discharge_ranges": getattr(db_contract, "discharge_ranges", None),
        **({"additives_required": getattr(db_contract, "additives_required", None)} if has_additives_required else {}),
        "fax_received": getattr(db_contract, "fax_received", None),
        "fax_received_date": getattr(db_contract, "fax_received_date", None),
        "concluded_memo_received": getattr(db_contract, "concluded_memo_received", None),
        "concluded_memo_received_date": getattr(db_contract, "concluded_memo_received_date", None),
        **({"remarks": getattr(db_contract, "remarks", None)} if has_remarks else {}),
        "customer_id": db_contract.customer_id,
        "version": getattr(db_contract, 'version', 1),
        "created_at": db_contract.created_at,
        "updated_at": db_contract.updated_at
    }
    return contract_dict

@router.post("/{contract_id}/authority-topup", response_model=schemas.Contract)
def add_authority_topup(contract_id: int, topup: schemas.AuthorityTopUp, db: Session = Depends(get_db)):
    """
    Add an authority top-up to a contract.
    This allows loading more quantity than originally contracted when authorization is received.
    """
    import json
    
    db_contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if db_contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Get customer for audit log
    customer = db.query(models.Customer).filter(models.Customer.id == db_contract.customer_id).first()
    customer_name = customer.name if customer else None
    
    # Validate product exists in contract
    contract_products = json.loads(db_contract.products) if db_contract.products else []
    product_names = {p.get('name') for p in contract_products}
    
    if topup.product_name not in product_names:
        raise HTTPException(
            status_code=400,
            detail=f"Product '{topup.product_name}' not found in contract products: {product_names}"
        )
    
    # Get existing top-ups or initialize empty list
    existing_topups = []
    if db_contract.authority_topups:
        try:
            existing_topups = json.loads(db_contract.authority_topups)
        except json.JSONDecodeError:
            existing_topups = []
    
    # Calculate total existing top-up for this product
    existing_topup_for_product = sum(
        t.get('quantity', 0) for t in existing_topups 
        if t.get('product_name') == topup.product_name
    )
    
    # Add new top-up
    new_topup = topup.dict()
    # Convert date to string for JSON serialization
    if new_topup.get('date'):
        new_topup['date'] = str(new_topup['date'])
    existing_topups.append(new_topup)
    
    # Save updated top-ups
    db_contract.authority_topups = json.dumps(existing_topups)
    
    # Create audit log entry for the authority top-up
    audit_log = models.ContractAuditLog(
        contract_id=db_contract.id,
        contract_db_id=db_contract.id,
        action='AUTHORITY_TOPUP',
        field_name='authority_topups',
        old_value=str(existing_topup_for_product),
        new_value=str(existing_topup_for_product + topup.quantity),
        product_name=topup.product_name,
        topup_quantity=topup.quantity,
        authority_reference=topup.authority_reference,
        topup_reason=topup.reason,
        contract_number=db_contract.contract_number,
        customer_name=customer_name,
        description=f"Authority top-up: {topup.quantity:,.0f} KT of {topup.product_name} added (Ref: {topup.authority_reference})"
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(db_contract)
    
    # Return updated contract
    has_remarks = _contracts_has_column(db, "remarks")
    has_additives_required = _contracts_has_column(db, "additives_required")
    
    contract_dict = {
        "id": db_contract.id,
        "contract_id": db_contract.contract_id,
        "contract_number": db_contract.contract_number,
        "contract_type": db_contract.contract_type,
        "payment_method": db_contract.payment_method,
        "start_period": db_contract.start_period,
        "end_period": db_contract.end_period,
        "products": json.loads(db_contract.products) if db_contract.products else [],
        "authority_topups": json.loads(db_contract.authority_topups) if db_contract.authority_topups else None,
        "discharge_ranges": getattr(db_contract, "discharge_ranges", None),
        **({"additives_required": getattr(db_contract, "additives_required", None)} if has_additives_required else {}),
        "fax_received": getattr(db_contract, "fax_received", None),
        "fax_received_date": getattr(db_contract, "fax_received_date", None),
        "concluded_memo_received": getattr(db_contract, "concluded_memo_received", None),
        "concluded_memo_received_date": getattr(db_contract, "concluded_memo_received_date", None),
        **({"remarks": getattr(db_contract, "remarks", None)} if has_remarks else {}),
        "customer_id": db_contract.customer_id,
        "created_at": db_contract.created_at,
        "updated_at": db_contract.updated_at
    }
    return contract_dict


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
        print(f"[ERROR] Error deleting contract: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting contract: {str(e)}")

