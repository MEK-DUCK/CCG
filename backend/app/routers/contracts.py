from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
import uuid

router = APIRouter()

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
        
        db_contract = models.Contract(
            contract_id=contract_id,
            contract_number=contract.contract_number,
            contract_type=contract.contract_type,
            payment_method=contract.payment_method,
            start_period=contract.start_period,
            end_period=contract.end_period,
            products=products_json,
            discharge_ranges=getattr(contract, "discharge_ranges", None),
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
def read_contracts(customer_id: int = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    try:
        import json
        from sqlalchemy import desc
        query = db.query(models.Contract)
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
        contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
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
    db_contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if db_contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    update_data = contract.dict(exclude_unset=True)
    
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
        "customer_id": db_contract.customer_id,
        "created_at": db_contract.created_at,
        "updated_at": db_contract.updated_at
    }
    return contract_dict

@router.delete("/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db)):
    db_contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if db_contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    db.delete(db_contract)
    db.commit()
    return {"message": "Contract deleted successfully"}

