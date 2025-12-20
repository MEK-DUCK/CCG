from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict
from app.database import get_db
from app import models, schemas
from app.monthly_plan_audit_utils import log_monthly_plan_action
from app.models import CargoStatus

router = APIRouter()

def get_cargo_info(monthly_plan_id: int, db: Session) -> Dict:
    """Get information about cargos linked to this monthly plan"""
    cargos = db.query(models.Cargo).filter(
        models.Cargo.monthly_plan_id == monthly_plan_id
    ).all()
    
    completed_cargos = [c for c in cargos if c.status == CargoStatus.COMPLETED_LOADING]
    
    return {
        'total_cargos': len(cargos),
        'completed_cargos': len(completed_cargos),
        'cargo_ids': [c.cargo_id for c in cargos],
        'completed_cargo_ids': [c.cargo_id for c in completed_cargos],
        'has_completed_cargos': len(completed_cargos) > 0,
        'is_locked': len(completed_cargos) > 0  # Locked if has any completed cargos
    }

@router.post("/", response_model=schemas.MonthlyPlan)
def create_monthly_plan(plan: schemas.MonthlyPlanCreate, db: Session = Depends(get_db)):
    # Verify quarterly plan exists
    quarterly_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == plan.quarterly_plan_id).first()
    if not quarterly_plan:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
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
        raise HTTPException(
            status_code=400,
            detail=f"Monthly quantity ({plan.month_quantity:,.0f} MT) exceeds remaining quarterly plan quantity ({remaining_quantity:,.0f} MT remaining out of {quarterly_total:,.0f} MT total)"
        )
    
    db_plan = models.MonthlyPlan(
        month=plan.month,
        year=plan.year,
        month_quantity=plan.month_quantity,
        number_of_liftings=plan.number_of_liftings,
        planned_lifting_sizes=plan.planned_lifting_sizes,
        laycan_5_days=plan.laycan_5_days,
        laycan_2_days=plan.laycan_2_days,
        loading_month=getattr(plan, "loading_month", None),
        loading_window=getattr(plan, "loading_window", None),
        delivery_month=getattr(plan, "delivery_month", None),
        delivery_window=getattr(plan, "delivery_window", None),
        quarterly_plan_id=plan.quarterly_plan_id
    )
    db.add(db_plan)
    db.flush()  # Flush to get the ID
    
    # Log the creation with quantity information
    log_monthly_plan_action(
        db=db,
        action='CREATE',
        monthly_plan=db_plan,
        field_name='month_quantity',
        old_value=0.0,  # Starting from 0
        new_value=db_plan.month_quantity  # New quantity
    )

    # Also log CIF window/month fields on creation if provided so Reconciliation shows them
    for field_name in ['loading_month', 'loading_window', 'delivery_month', 'delivery_window']:
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
    return db_plan

@router.get("/", response_model=List[schemas.MonthlyPlan])
def read_monthly_plans(
    quarterly_plan_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
    query = db.query(models.MonthlyPlan)
    if quarterly_plan_id:
        query = query.filter(models.MonthlyPlan.quarterly_plan_id == quarterly_plan_id)
    plans = query.offset(skip).limit(limit).all()
    return plans
    except Exception as e:
        import traceback
        print(f"[ERROR] Error reading monthly plans: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading monthly plans: {str(e)}")

@router.get("/{plan_id}", response_model=schemas.MonthlyPlan)
def read_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    return plan

@router.put("/{plan_id}", response_model=schemas.MonthlyPlan)
def update_monthly_plan(plan_id: int, plan: schemas.MonthlyPlanUpdate, db: Session = Depends(get_db)):
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    
    # Check if plan has completed cargos (locked)
    cargo_info = get_cargo_info(plan_id, db)
    
    # Prevent month/year changes if there are completed cargos
    update_data = plan.dict(exclude_unset=True)
    
    if cargo_info['has_completed_cargos']:
        if 'month' in update_data and update_data['month'] != db_plan.month:
            completed_ids = ', '.join(cargo_info['completed_cargo_ids'])
            raise HTTPException(
                status_code=400,
                detail=f"Cannot change month. This plan has {cargo_info['completed_cargos']} completed cargo(s): {completed_ids}. Completed cargos must remain in their original month."
            )
        if 'year' in update_data and update_data['year'] != db_plan.year:
            completed_ids = ', '.join(cargo_info['completed_cargo_ids'])
            raise HTTPException(
                status_code=400,
                detail=f"Cannot change year. This plan has {cargo_info['completed_cargos']} completed cargo(s): {completed_ids}. Completed cargos must remain in their original year."
            )
    
    # Get quarterly plan for validation
    quarterly_plan = db.query(models.QuarterlyPlan).filter(models.QuarterlyPlan.id == db_plan.quarterly_plan_id).first()
    if not quarterly_plan:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
    # Calculate quarterly total
    quarterly_total = (quarterly_plan.q1_quantity or 0) + (quarterly_plan.q2_quantity or 0) + (quarterly_plan.q3_quantity or 0) + (quarterly_plan.q4_quantity or 0)
    
    # Get existing monthly plans for this quarterly plan (excluding current plan being edited)
    existing_monthly_plans = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.quarterly_plan_id == db_plan.quarterly_plan_id,
        models.MonthlyPlan.id != plan_id  # Exclude the plan being edited
    ).all()
    
    used_quantity = sum(mp.month_quantity for mp in existing_monthly_plans)
    remaining_quantity = quarterly_total - used_quantity
    
    # Get new monthly quantity
    new_month_quantity = plan.month_quantity if plan.month_quantity is not None else db_plan.month_quantity
    
    # Validate monthly quantity doesn't exceed remaining quarterly quantity
    if new_month_quantity > remaining_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Monthly quantity ({new_month_quantity:,.0f} MT) exceeds remaining quarterly plan quantity ({remaining_quantity:,.0f} MT remaining out of {quarterly_total:,.0f} MT total)"
        )
    
    # Store old values for audit logging
    old_values = {}
    for field in [
        'month_quantity',
        'number_of_liftings',
        'planned_lifting_sizes',
        'laycan_5_days',
        'laycan_2_days',
        'loading_month',
        'loading_window',
        'delivery_month',
        'delivery_window',
        'month',
        'year',
    ]:
        if hasattr(db_plan, field):
            old_values[field] = getattr(db_plan, field)
    for field, value in update_data.items():
        old_val = old_values.get(field)
        setattr(db_plan, field, value)
        
        # Log field change
        if old_val != value:
            # Special handling for month_quantity: 0.0 means DELETE, >0 from 0 means CREATE
            if field == 'month_quantity':
                old_qty = float(old_val) if old_val is not None else 0.0
                new_qty = float(value) if value is not None else 0.0
                
                if new_qty == 0.0 and old_qty > 0.0:
                    # Quantity went to 0, treat as DELETE
                    log_monthly_plan_action(
                        db=db,
                        action='DELETE',
                        monthly_plan=db_plan,
                        field_name=field,
                        old_value=old_val,
                        new_value=value
                    )
                elif new_qty > 0.0 and old_qty == 0.0:
                    # Quantity went from 0 to >0, treat as CREATE
                    log_monthly_plan_action(
                        db=db,
                        action='CREATE',
                        monthly_plan=db_plan,
                        field_name=field,
                        old_value=old_val,
                        new_value=value
                    )
                else:
                    # Regular update
                    log_monthly_plan_action(
                        db=db,
                        action='UPDATE',
                        monthly_plan=db_plan,
                        field_name=field,
                        old_value=old_val,
                        new_value=value
                    )
            else:
                # Regular field update
                log_monthly_plan_action(
                    db=db,
                    action='UPDATE',
                    monthly_plan=db_plan,
                    field_name=field,
                    old_value=old_val,
                    new_value=value
                )
    
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.delete("/{plan_id}")
def delete_monthly_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    
    # Check if plan has completed cargos (locked)
    cargo_info = get_cargo_info(plan_id, db)
    
    if cargo_info['has_completed_cargos']:
        completed_ids = ', '.join(cargo_info['completed_cargo_ids'])
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete monthly plan. It has {cargo_info['completed_cargos']} completed cargo(s): {completed_ids}. Please delete or move the cargos first."
        )
    
    # Check if plan has any cargos (even non-completed)
    if cargo_info['total_cargos'] > 0:
        cargo_ids = ', '.join(cargo_info['cargo_ids'])
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete monthly plan. It has {cargo_info['total_cargos']} cargo(s): {cargo_ids}. Please delete or move the cargos first."
        )
    
    try:
    # Log the deletion before deleting
    log_monthly_plan_action(
        db=db,
        action='DELETE',
        monthly_plan=db_plan
    )
        db.flush()

        # IMPORTANT: audit log FK must not block plan deletion.
        # Keep history via snapshot + month/year/contract fields + stable numeric monthly_plan_db_id, but null the FK reference.
        db.query(models.MonthlyPlanAuditLog).filter(
            models.MonthlyPlanAuditLog.monthly_plan_id == db_plan.id
        ).update(
            {models.MonthlyPlanAuditLog.monthly_plan_id: None, models.MonthlyPlanAuditLog.monthly_plan_db_id: db_plan.id},
            synchronize_session=False
        )
    
    db.delete(db_plan)
    db.commit()
    return {"message": "Monthly plan deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"[ERROR] Error deleting monthly plan: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting monthly plan: {str(e)}")

@router.get("/{plan_id}/status")
def get_monthly_plan_status(plan_id: int, db: Session = Depends(get_db)):
    """Get monthly plan status including cargo information and lock status"""
    db_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == plan_id).first()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    
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

