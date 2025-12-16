from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
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
        db.commit()
        db.refresh(db_customer)
        return db_customer
    except Exception as e:
        db.rollback()
        print(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/", response_model=List[schemas.Customer])
def read_customers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
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
        for field, value in update_data.items():
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

