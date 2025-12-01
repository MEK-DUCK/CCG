from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.quarterly_plan_audit_utils import log_quarterly_plan_action

router = APIRouter()

@router.post("/", response_model=schemas.QuarterlyPlan)
def create_quarterly_plan(plan: schemas.QuarterlyPlanCreate, db: Session = Depends(get_db)):
    import json
    # Verify contract exists
    contract = db.query(models.Contract).filter(models.Contract.id == plan.contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Check if a quarterly plan already exists for this contract
    existing_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.contract_id == plan.contract_id).first()
    if existing_plan:
        raise HTTPException(
            status_code=400,
            detail="A quarterly plan already exists for this contract. Please edit the existing plan or delete it first."
        )
    
    # Calculate total quarterly quantity
    total_quarterly = plan.q1_quantity + plan.q2_quantity + plan.q3_quantity + plan.q4_quantity
    
    # Calculate contract total and optional quantities
    contract_products = json.loads(contract.products) if contract.products else []
    total_contract_quantity = sum(p.get('total_quantity', 0) for p in contract_products)
    total_optional_quantity = sum(p.get('optional_quantity', 0) for p in contract_products)
    max_allowed = total_contract_quantity + total_optional_quantity
    
    # Validate total must equal contract total (or total + optional if using optional)
    if total_quarterly < total_contract_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) is less than the contract total quantity ({total_contract_quantity:,.0f} KT). The quarterly plan total must equal the contract total."
        )
    elif total_quarterly > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) exceeds maximum allowed ({max_allowed:,.0f} KT = {total_contract_quantity:,.0f} KT total + {total_optional_quantity:,.0f} KT optional)"
        )
    elif total_quarterly != total_contract_quantity and total_quarterly != max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) must equal either the contract total ({total_contract_quantity:,.0f} KT) or the maximum allowed ({max_allowed:,.0f} KT = total + optional)"
        )
    
    db_plan = models.QuarterlyPlan(
        q1_quantity=plan.q1_quantity,
        q2_quantity=plan.q2_quantity,
        q3_quantity=plan.q3_quantity,
        q4_quantity=plan.q4_quantity,
        contract_id=plan.contract_id
    )
    db.add(db_plan)
    db.flush()  # Flush to get the ID
    
    # Log the creation
    log_quarterly_plan_action(
        db=db,
        action='CREATE',
        quarterly_plan=db_plan
    )
    
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.get("/", response_model=List[schemas.QuarterlyPlan])
def read_quarterly_plans(contract_id: int = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    try:
        query = db.query(models.QuarterlyPlan)
        if contract_id:
            query = query.filter(models.QuarterlyPlan.contract_id == contract_id)
        plans = query.offset(skip).limit(limit).all()
        return plans
    except Exception as e:
        import traceback
        print(f"[ERROR] Error reading quarterly plans: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading quarterly plans: {str(e)}")

@router.get("/{plan_id}", response_model=schemas.QuarterlyPlan)
def read_quarterly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    return plan

@router.put("/{plan_id}", response_model=schemas.QuarterlyPlan)
def update_quarterly_plan(plan_id: int, plan: schemas.QuarterlyPlanUpdate, db: Session = Depends(get_db)):
    import json
    db_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
    # Get contract for validation
    contract = db.query(models.Contract).filter(models.Contract.id == db_plan.contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Calculate new total quarterly quantity
    q1 = plan.q1_quantity if plan.q1_quantity is not None else db_plan.q1_quantity
    q2 = plan.q2_quantity if plan.q2_quantity is not None else db_plan.q2_quantity
    q3 = plan.q3_quantity if plan.q3_quantity is not None else db_plan.q3_quantity
    q4 = plan.q4_quantity if plan.q4_quantity is not None else db_plan.q4_quantity
    total_quarterly = q1 + q2 + q3 + q4
    
    # Calculate contract total and optional quantities
    contract_products = json.loads(contract.products) if contract.products else []
    total_contract_quantity = sum(p.get('total_quantity', 0) for p in contract_products)
    total_optional_quantity = sum(p.get('optional_quantity', 0) for p in contract_products)
    max_allowed = total_contract_quantity + total_optional_quantity
    
    # Validate total must equal contract total (or total + optional if using optional)
    if total_quarterly < total_contract_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) is less than the contract total quantity ({total_contract_quantity:,.0f} KT). The quarterly plan total must equal the contract total."
        )
    elif total_quarterly > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) exceeds maximum allowed ({max_allowed:,.0f} KT = {total_contract_quantity:,.0f} KT total + {total_optional_quantity:,.0f} KT optional)"
        )
    elif total_quarterly != total_contract_quantity and total_quarterly != max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Total quarterly quantity ({total_quarterly:,.0f} KT) must equal either the contract total ({total_contract_quantity:,.0f} KT) or the maximum allowed ({max_allowed:,.0f} KT = total + optional)"
        )
    
    # Store old values for audit logging
    old_values = {}
    for field in ['q1_quantity', 'q2_quantity', 'q3_quantity', 'q4_quantity']:
        if hasattr(db_plan, field):
            old_values[field] = getattr(db_plan, field)
    
    update_data = plan.dict(exclude_unset=True)
    for field, value in update_data.items():
        old_val = old_values.get(field)
        setattr(db_plan, field, value)
        
        # Log field change
        if old_val != value:
            log_quarterly_plan_action(
                db=db,
                action='UPDATE',
                quarterly_plan=db_plan,
                field_name=field,
                old_value=old_val,
                new_value=value
            )
    
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.delete("/{plan_id}")
def delete_quarterly_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan_id).first()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
    # Log the deletion before deleting
    log_quarterly_plan_action(
        db=db,
        action='DELETE',
        quarterly_plan=db_plan
    )
    
    db.delete(db_plan)
    db.commit()
    return {"message": "Quarterly plan deleted successfully"}

