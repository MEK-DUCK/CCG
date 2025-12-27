from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.general_audit_utils import log_general_action
import uuid

router = APIRouter()

@router.post("/", response_model=schemas.Customer)
def create_customer(customer: schemas.CustomerCreate, db: Session = Depends(get_db)):
    try:
        # Generate system customer_id
        customer_id = f"CUST-{uuid.uuid4().hex[:8].upper()}"
        
        db_customer = models.Customer(
            customer_id=customer_id,
            name=customer.name,
        )
        db.add(db_customer)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='CUSTOMER',
            action='CREATE',
            entity_id=db_customer.id,
            entity_name=db_customer.name,
            description=f"Created customer: {db_customer.name} ({customer_id})"
        )
        
        db.commit()
        db.refresh(db_customer)
        return db_customer
    except Exception as e:
        db.rollback()
        print(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/", response_model=List[schemas.Customer])
def read_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        customers = db.query(models.Customer).offset(skip).limit(limit).all()
        return customers
    except Exception as e:
        import traceback
        print(f"[ERROR] Error reading customers: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading customers: {str(e)}")

@router.get("/{customer_id}", response_model=schemas.Customer)
def read_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.put("/{customer_id}", response_model=schemas.Customer)
def update_customer(customer_id: int, customer: schemas.CustomerUpdate, db: Session = Depends(get_db)):
    try:
        db_customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
        if db_customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        update_data = customer.dict(exclude_unset=True)
        old_name = db_customer.name
        
        for field, value in update_data.items():
            old_value = getattr(db_customer, field, None)
            if old_value != value:
                # Audit log for each changed field
                log_general_action(
                    db=db,
                    entity_type='CUSTOMER',
                    action='UPDATE',
                    entity_id=db_customer.id,
                    entity_name=db_customer.name,
                    field_name=field,
                    old_value=old_value,
                    new_value=value
                )
            setattr(db_customer, field, value)
        
        db.commit()
        db.refresh(db_customer)
        return db_customer
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"[ERROR] Error updating customer: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error updating customer: {str(e)}")

@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    try:
        db_customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
        if db_customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Store customer info for audit log before deletion
        customer_name = db_customer.name
        customer_system_id = db_customer.customer_id
        
        # Audit log for deletion
        log_general_action(
            db=db,
            entity_type='CUSTOMER',
            action='DELETE',
            entity_id=db_customer.id,
            entity_name=customer_name,
            description=f"Deleted customer: {customer_name} ({customer_system_id})",
            entity_snapshot={
                'id': db_customer.id,
                'customer_id': customer_system_id,
                'name': customer_name
            }
        )
        
        # IMPORTANT: audit logs must not block cascading deletes from customer -> contracts -> plans -> cargos.
        contract_ids = [c.id for c in db.query(models.Contract.id).filter(models.Contract.customer_id == customer_id).all()]
        if contract_ids:
            cargo_ids = [c.id for c in db.query(models.Cargo.id).filter(models.Cargo.contract_id.in_(contract_ids)).all()]
            if cargo_ids:
                db.query(models.CargoAuditLog).filter(models.CargoAuditLog.cargo_id.in_(cargo_ids)).update(
                    {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: models.CargoAuditLog.cargo_id},
                    synchronize_session=False
                )

            quarterly_ids = [q.id for q in db.query(models.QuarterlyPlan.id).filter(models.QuarterlyPlan.contract_id.in_(contract_ids)).all()]
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

        db.delete(db_customer)
        db.commit()
        return {"message": "Customer deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"[ERROR] Error deleting customer: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting customer: {str(e)}")

