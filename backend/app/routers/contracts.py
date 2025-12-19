from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer
from sqlalchemy import inspect
from typing import List
from app.database import get_db
from app import models, schemas
import uuid

router = APIRouter()

def _contracts_has_column(db: Session, column_name: str) -> bool:
    """Backward-compatible guard for deployments where DB schema lags behind code."""
    try:
        cols = inspect(db.bind).get_columns("contracts")
        return any(c.get("name") == column_name for c in cols)
    except Exception:
        return False

@router.post("/", response_model=schemas.Contract)
def create_contract(contract: schemas.ContractCreate, db: Session = Depends(get_db)):
    try:
        import json
        # Verify customer exists
        customer = db.query(models.Customer).filter(models.Customer.id == contract.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Validate products
        valid_products = ["JET A-1", "GASOIL", "GASOIL 10PPM", "HFO", "LSFO"]
        for product in contract.products:
            if product.name not in valid_products:
                raise HTTPException(status_code=400, detail=f"Invalid product: {product.name}. Must be one of: {', '.join(valid_products)}")
        
        # Generate system contract_id
        contract_id = f"CONT-{uuid.uuid4().hex[:8].upper()}"
        
        # Store products as JSON string
        products_json = json.dumps([p.dict() for p in contract.products])
        
        # Calculate total quantity from products for backward compatibility with old schema
        total_quantity = sum(p.total_quantity for p in contract.products)
        
        has_remarks = _contracts_has_column(db, "remarks")
        has_additives_required = _contracts_has_column(db, "additives_required")

        db_contract = models.Contract(
            contract_id=contract_id,
            contract_number=contract.contract_number,
            contract_type=contract.contract_type,
            payment_method=contract.payment_method,
            start_period=contract.start_period,
            end_period=contract.end_period,
            products=products_json,
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
        
        # Convert products JSON string to list for response
        contract_dict = {
            "id": db_contract.id,
            "contract_id": db_contract.contract_id,
            "contract_number": db_contract.contract_number,
            "contract_type": db_contract.contract_type,
            "payment_method": db_contract.payment_method,
            "start_period": db_contract.start_period,
            "end_period": db_contract.end_period,
            "products": json.loads(db_contract.products) if db_contract.products else [],
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
        print(f"[ERROR] Error creating contract: {str(e)}\n{traceback.format_exc()}")
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
            
            contract_dict = {
                "id": contract.id,
                "contract_id": contract.contract_id,
                "contract_number": contract.contract_number,
                "contract_type": contract.contract_type,
                "payment_method": contract.payment_method,
                "start_period": contract.start_period,
                "end_period": contract.end_period,
                "products": products,
                "discharge_ranges": getattr(contract, "discharge_ranges", None),
                **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
                "fax_received": getattr(contract, "fax_received", None),
                "fax_received_date": getattr(contract, "fax_received_date", None),
                "concluded_memo_received": getattr(contract, "concluded_memo_received", None),
                "concluded_memo_received_date": getattr(contract, "concluded_memo_received_date", None),
                **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
                "customer_id": contract.customer_id,
                "created_at": contract.created_at,
                "updated_at": contract.updated_at
            }
            result.append(contract_dict)
        
        return result
    except Exception as e:
        import traceback
        print(f"[ERROR] Error reading contracts: {str(e)}\n{traceback.format_exc()}")
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
        
        # Convert products JSON string to list for response
        contract_dict = {
            "id": contract.id,
            "contract_id": contract.contract_id,
            "contract_number": contract.contract_number,
            "contract_type": contract.contract_type,
            "payment_method": contract.payment_method,
            "start_period": contract.start_period,
            "end_period": contract.end_period,
            "products": products_list,
            "discharge_ranges": getattr(contract, "discharge_ranges", None),
            **({"additives_required": getattr(contract, "additives_required", None)} if has_additives_required else {}),
            "fax_received": getattr(contract, "fax_received", None),
            "fax_received_date": getattr(contract, "fax_received_date", None),
            "concluded_memo_received": getattr(contract, "concluded_memo_received", None),
            "concluded_memo_received_date": getattr(contract, "concluded_memo_received_date", None),
            **({"remarks": getattr(contract, "remarks", None)} if has_remarks else {}),
            "customer_id": contract.customer_id,
            "created_at": contract.created_at,
            "updated_at": contract.updated_at
        }
        return contract_dict
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error loading contract {contract_id}: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error loading contract: {str(e)}")

@router.put("/{contract_id}", response_model=schemas.Contract)
def update_contract(contract_id: int, contract: schemas.ContractUpdate, db: Session = Depends(get_db)):
    import json
    has_remarks = _contracts_has_column(db, "remarks")
    has_additives_required = _contracts_has_column(db, "additives_required")
    query = db.query(models.Contract)
    if not has_remarks:
        query = query.options(defer(models.Contract.remarks))
    if not has_additives_required:
        query = query.options(defer(models.Contract.additives_required))
    db_contract = query.filter(models.Contract.id == contract_id).first()
    if db_contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    update_data = contract.dict(exclude_unset=True)

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
    
    # Verify customer if being updated
    if "customer_id" in update_data:
        customer = db.query(models.Customer).filter(models.Customer.id == update_data["customer_id"]).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    
    for field, value in update_data.items():
        setattr(db_contract, field, value)
    
    db.commit()
    db.refresh(db_contract)
    
    # Convert products JSON string to list for response
    contract_dict = {
        "id": db_contract.id,
        "contract_id": db_contract.contract_id,
        "contract_number": db_contract.contract_number,
        "contract_type": db_contract.contract_type,
        "payment_method": db_contract.payment_method,
        "start_period": db_contract.start_period,
        "end_period": db_contract.end_period,
        "products": json.loads(db_contract.products) if db_contract.products else [],
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

