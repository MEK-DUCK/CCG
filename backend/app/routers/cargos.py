from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app import models, schemas
from app.models import ContractType, CargoStatus, LCStatus
from app.audit_utils import log_cargo_action
from sqlalchemy import and_, or_
import uuid
import json

router = APIRouter()

def update_cargo_status(cargo: models.Cargo, db: Session):
    """Update cargo status - now manual, but keep this for backward compatibility"""
    # Status is now set manually by the user, so we don't auto-update based on dates
    # Only set to PLANNED if status is not already set
    if not cargo.status:
        cargo.status = CargoStatus.PLANNED

@router.post("/", response_model=schemas.Cargo)
def create_cargo(cargo: schemas.CargoCreate, db: Session = Depends(get_db)):
    print(f"[DEBUG] Creating cargo with data:")
    print(f"  Vessel: {cargo.vessel_name}")
    print(f"  Customer ID: {cargo.customer_id}")
    print(f"  Contract ID: {cargo.contract_id}")
    print(f"  Monthly Plan ID: {cargo.monthly_plan_id}")
    print(f"  Product: {cargo.product_name}")
    print(f"  Quantity: {cargo.cargo_quantity}")
    print(f"  LC Status from Pydantic: {cargo.lc_status}, type: {type(cargo.lc_status)}")
    
    # Verify all related entities exist
    customer = db.query(models.Customer).filter(models.Customer.id == cargo.customer_id).first()
    if not customer:
        print(f"[ERROR] Customer {cargo.customer_id} not found")
        raise HTTPException(status_code=404, detail="Customer not found")
    print(f"[DEBUG] Customer found: {customer.name}")
    
    import json
    contract = db.query(models.Contract).filter(models.Contract.id == cargo.contract_id).first()
    if not contract:
        print(f"[ERROR] Contract {cargo.contract_id} not found")
        raise HTTPException(status_code=404, detail="Contract not found")
    print(f"[DEBUG] Contract found: {contract.contract_number}")
    
    # Verify product_name is in contract's products list
    contract_products = json.loads(contract.products) if contract.products else []
    product_names = [p["name"] for p in contract_products]
    print(f"[DEBUG] Contract products: {product_names}")
    if cargo.product_name not in product_names:
        print(f"[ERROR] Product '{cargo.product_name}' not in {product_names}")
        raise HTTPException(status_code=400, detail=f"Product '{cargo.product_name}' not found in contract's products list")
    
    monthly_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == cargo.monthly_plan_id).first()
    if not monthly_plan:
        print(f"[ERROR] Monthly plan {cargo.monthly_plan_id} not found")
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    print(f"[DEBUG] Monthly plan found: Month {monthly_plan.month}, Year {monthly_plan.year}")
    
    # Generate system cargo_id
    cargo_id = f"CARGO-{uuid.uuid4().hex[:8].upper()}"
    
    # CRITICAL: For lc_status, SQLAlchemy uses enum NAME but database needs enum VALUE
    # So we need to ensure we use the enum VALUE, not the enum NAME
    # For status, it works because database has both names and values
    # For lc_status, database only has values, so we must use .value
    lc_status_for_db = cargo.lc_status.value if cargo.lc_status else None
    
    db_cargo = models.Cargo(
        cargo_id=cargo_id,
        vessel_name=cargo.vessel_name,
        customer_id=cargo.customer_id,
        product_name=cargo.product_name,
        contract_id=cargo.contract_id,
        contract_type=contract.contract_type,  # Auto from contract
        lc_status=lc_status_for_db,  # LC status - use enum VALUE, not enum NAME
        load_ports=cargo.load_ports,
        inspector_name=cargo.inspector_name,
        cargo_quantity=cargo.cargo_quantity,
        laycan_window=cargo.laycan_window,
        eta=cargo.eta,
        berthed=cargo.berthed,
        commenced=cargo.commenced,
        etc=cargo.etc,
        eta_load_port=cargo.eta_load_port,  # Legacy field
        loading_start_time=cargo.loading_start_time,  # Legacy field
        loading_completion_time=cargo.loading_completion_time,  # Legacy field
        etd_load_port=cargo.etd_load_port,  # Legacy field
        eta_discharge_port=cargo.eta_discharge_port,
        discharge_port_location=cargo.discharge_port_location,
        discharge_completion_time=cargo.discharge_completion_time,
        notes=cargo.notes,
        monthly_plan_id=cargo.monthly_plan_id,
        status=CargoStatus.PLANNED,  # Always start as Planned, user will update manually
        product_id=0  # Legacy field, set to 0 for backward compatibility
    )
    
    try:
        db.add(db_cargo)
        db.flush()  # Flush to get the ID
        
        # Log the creation
        log_cargo_action(
            db=db,
            action='CREATE',
            cargo=db_cargo,
            new_monthly_plan_id=db_cargo.monthly_plan_id
        )
        
        db.commit()
        db.refresh(db_cargo)
        print(f"[DEBUG] Cargo created successfully:")
        print(f"  ID: {db_cargo.id}")
        print(f"  Vessel Name: {db_cargo.vessel_name}")
        print(f"  Load Ports: {db_cargo.load_ports}")
        print(f"  Inspector Name: {db_cargo.inspector_name}")
        print(f"  Cargo Quantity: {db_cargo.cargo_quantity}")
        print(f"  Monthly Plan ID: {db_cargo.monthly_plan_id}")
        print(f"  Status: {db_cargo.status}")
        print(f"  Contract ID: {db_cargo.contract_id}")
        print(f"  Customer ID: {db_cargo.customer_id}")
        
        # Verify the cargo was actually saved
        if not db_cargo.id:
            raise Exception("Cargo was not assigned an ID after commit")
        
        return db_cargo
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to create cargo: {str(e)}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create cargo: {str(e)}")

@router.get("/", response_model=List[schemas.Cargo])
def read_cargos(
    status: Optional[CargoStatus] = None,
    contract_type: Optional[ContractType] = None,
    customer_id: Optional[int] = None,
    contract_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Cargo)
        
        if status:
            query = query.filter(models.Cargo.status == status)
        if contract_type:
            query = query.filter(models.Cargo.contract_type == contract_type)
        if customer_id:
            query = query.filter(models.Cargo.customer_id == customer_id)
        if contract_id:
            query = query.filter(models.Cargo.contract_id == contract_id)
        if month or year:
            query = query.join(models.MonthlyPlan)
            if month:
                query = query.filter(models.MonthlyPlan.month == month)
            if year:
                query = query.filter(models.MonthlyPlan.year == year)
        
        cargos = query.offset(skip).limit(limit).all()
        return cargos
    except Exception as e:
        import traceback
        print(f"[ERROR] Error reading cargos: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error loading cargos: {str(e)}")

@router.get("/port-movement", response_model=List[schemas.Cargo])
def read_port_movement(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get cargos for specified month (defaults to current month), excluding completed cargos"""
    try:
        if month is None or year is None:
            now = datetime.now()
            if month is None:
                month = now.month
            if year is None:
                year = now.year
        
        from sqlalchemy import or_, and_, not_
        # Exclude cargos that should be in other tabs:
        # - Completed Loading (all types) -> goes to Completed Cargos tab
        # - In-Road (Pending Discharge) -> goes to In-Road CIF tab
        # - Pending Nomination (CIF only) -> goes to Completed Cargos tab
        query = db.query(models.Cargo).join(models.MonthlyPlan).filter(
            models.MonthlyPlan.month == month,
            models.MonthlyPlan.year == year
        ).filter(
            not_(
                or_(
                    models.Cargo.status == CargoStatus.COMPLETED_LOADING,  # All completed loading cargos
                    models.Cargo.status == CargoStatus.IN_ROAD,  # In-Road cargos
                    models.Cargo.status == CargoStatus.IN_ROAD_COMPLETE,
                    and_(
                        models.Cargo.status == CargoStatus.PENDING_NOMINATION,
                        models.Cargo.contract_type == ContractType.CIF
                    )
                )
            )
        )
        cargos = query.all()
        return cargos
    except Exception as e:
        import traceback
        error_msg = f"Error in read_port_movement: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error loading port movement: {str(e)}")

@router.get("/completed-cargos", response_model=List[schemas.Cargo])
def read_completed_cargos(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get FOB completed cargos and CIF cargos in documentation/in-road stage"""
    query = db.query(models.Cargo).filter(
        or_(
            and_(
                models.Cargo.status == CargoStatus.COMPLETED_LOADING,
                models.Cargo.contract_type == ContractType.FOB
            ),
            and_(
                models.Cargo.contract_type == ContractType.CIF,
                models.Cargo.status.in_([CargoStatus.COMPLETED_LOADING, CargoStatus.IN_ROAD])
            )
        )
    )
    
    # Filter by month/year if provided
    if month is not None or year is not None:
        query = query.join(models.MonthlyPlan)
        if month is not None:
            query = query.filter(models.MonthlyPlan.month == month)
        if year is not None:
            query = query.filter(models.MonthlyPlan.year == year)
    
    cargos = query.all()
    return cargos

@router.get("/in-road-cif", response_model=List[schemas.Cargo])
def read_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that completed loading but not discharge"""
    try:
        # Query for CIF cargos with IN_ROAD status
        # PostgreSQL handles enums natively, direct comparison works
        query = db.query(models.Cargo).filter(
            models.Cargo.contract_type == ContractType.CIF
        ).filter(
            models.Cargo.status == CargoStatus.IN_ROAD
        )
        cargos = query.all()
        
        # Debug: print to console (will show in backend logs)
        print(f"[DEBUG] In-Road CIF query found {len(cargos)} cargos")
        for cargo in cargos:
            print(f"[DEBUG] Cargo ID: {cargo.id}, Vessel: {cargo.vessel_name}, Status: {cargo.status}, Contract Type: {cargo.contract_type}")
        
        # Also check all CIF cargos for debugging
        all_cif = db.query(models.Cargo).filter(models.Cargo.contract_type == ContractType.CIF).all()
        print(f"[DEBUG] Total CIF cargos in database: {len(all_cif)}")
        for cargo in all_cif:
            status_str = str(cargo.status) if cargo.status else "None"
            print(f"[DEBUG]   Cargo ID: {cargo.id}, Vessel: {cargo.vessel_name}, Status: '{status_str}' (type: {type(cargo.status).__name__})")
        
        return cargos
    except Exception as e:
        import traceback
        error_msg = f"Error in read_in_road_cif: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@router.get("/in-road-complete", response_model=List[schemas.Cargo])
def read_in_road_complete(db: Session = Depends(get_db)):
    """Get CIF cargos that have completed discharge"""
    try:
        cargos = (
            db.query(models.Cargo)
            .filter(
                models.Cargo.contract_type == ContractType.CIF,
                models.Cargo.status == CargoStatus.IN_ROAD_COMPLETE
            )
            .all()
        )
        return cargos
    except Exception as e:
        import traceback
        error_msg = f"Error in read_in_road_complete: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@router.get("/{cargo_id}", response_model=schemas.Cargo)
def read_cargo(cargo_id: int, db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    return cargo

@router.put("/{cargo_id}", response_model=schemas.Cargo)
def update_cargo(cargo_id: int, cargo: schemas.CargoUpdate, db: Session = Depends(get_db)):
    """Update cargo - handles lc_status conversion from string to enum"""
    try:
        db_cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
        if db_cargo is None:
            raise HTTPException(status_code=404, detail="Cargo not found")
        
        # Get raw dict to handle status conversion manually
        # Use model_dump if available (Pydantic v2) or dict (Pydantic v1)
        try:
            # First try to get the raw request body to see what we're receiving
            print(f"[DEBUG] Received cargo update request for cargo_id: {cargo_id}")
            print(f"[DEBUG] CargoUpdate object: {cargo}")
            update_data = cargo.model_dump(exclude_unset=True) if hasattr(cargo, 'model_dump') else cargo.dict(exclude_unset=True)
        except Exception as e:
            # Fallback to dict if model_dump fails
            print(f"[WARNING] Error getting update data: {e}")
            import traceback
            print(f"[WARNING] Traceback: {traceback.format_exc()}")
            try:
                update_data = cargo.dict(exclude_unset=True)
            except Exception as e2:
                print(f"[ERROR] Failed to get update data even with dict(): {e2}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error parsing update request: {str(e2)}")
        
        print(f"[DEBUG] Raw update_data from Pydantic: {update_data}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error at start of update_cargo: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing update request: {str(e)}")
    
    # Convert status string to enum if present
    if 'status' in update_data and update_data['status'] is not None:
        status_value = update_data['status']
        if isinstance(status_value, str):
            # Try to find matching enum by value
            status_enum = None
            for enum_item in CargoStatus:
                if enum_item.value == status_value:
                    status_enum = enum_item
                    break
            
            if status_enum:
                update_data['status'] = status_enum
                print(f"[DEBUG] Converted status string '{status_value}' to enum: {status_enum}")
            else:
                # Try direct conversion as fallback
                try:
                    status_enum = CargoStatus(status_value)
                    update_data['status'] = status_enum
                    print(f"[DEBUG] Converted status via direct conversion: {status_enum}")
                except ValueError:
                    print(f"[ERROR] Invalid status value: {status_value}")
                    print(f"[DEBUG] Available statuses: {[e.value for e in CargoStatus]}")
                    raise HTTPException(status_code=400, detail=f"Invalid status value: {status_value}. Valid values: {', '.join([e.value for e in CargoStatus])}")
    
    # Convert lc_status to string VALUE (database stores enum VALUE, not enum NAME)
    if 'lc_status' in update_data and update_data['lc_status'] is not None:
        lc_status_value = update_data['lc_status']
        # Handle empty string as None
        if lc_status_value == '':
            update_data['lc_status'] = None
            print(f"[DEBUG] lc_status is empty string, converting to None")
        elif isinstance(lc_status_value, LCStatus):
            # Convert enum object to its value string
            update_data['lc_status'] = lc_status_value.value
            print(f"[DEBUG] Converted lc_status enum to value: {lc_status_value.value}")
        elif isinstance(lc_status_value, str):
            # Already a string, should be the enum value
            # Verify it's a valid enum value
            valid_values = [e.value for e in LCStatus]
            if lc_status_value not in valid_values:
                raise HTTPException(status_code=400, detail=f"Invalid lc_status value: {lc_status_value}. Valid values: {', '.join(valid_values)}")
            print(f"[DEBUG] lc_status is already string value: {lc_status_value}")
    
    # Debug logging
    print(f"[DEBUG] Updating cargo {cargo_id} with data: {update_data}")
    
    # Store old values for audit logging
    old_monthly_plan_id = db_cargo.monthly_plan_id
    old_values = {}
    for field in update_data.keys():
        if hasattr(db_cargo, field):
            old_val = getattr(db_cargo, field)
            old_values[field] = old_val
    
    # Check if monthly_plan_id is being changed (MOVE action)
    if 'monthly_plan_id' in update_data and update_data['monthly_plan_id'] != old_monthly_plan_id:
        # This is a MOVE action
        log_cargo_action(
            db=db,
            action='MOVE',
            cargo=db_cargo,
            old_monthly_plan_id=old_monthly_plan_id,
            new_monthly_plan_id=update_data['monthly_plan_id']
        )
    
    for field, value in update_data.items():
        # Handle status field specially to ensure enum conversion
        if field == 'status' and value is not None:
            try:
                old_status = db_cargo.status
                if isinstance(value, CargoStatus):
                    print(f"[DEBUG] Setting status to enum: {value} (value: {value.value})")
                    # For PostgreSQL native enums, we need to ensure we're using the enum value
                    # SQLAlchemy should handle this automatically for string enums, but let's be explicit
                    db_cargo.status = value
                    # Verify the value is set correctly
                    print(f"[DEBUG] Status set to: {db_cargo.status}, type: {type(db_cargo.status)}")
                    
                    # Log status change (but not if it's part of a MOVE, already logged)
                    if 'monthly_plan_id' not in update_data or update_data['monthly_plan_id'] == old_monthly_plan_id:
                        if old_status != db_cargo.status:
                            log_cargo_action(
                                db=db,
                                action='UPDATE',
                                cargo=db_cargo,
                                field_name='status',
                                old_value=old_status.value if old_status else None,
                                new_value=db_cargo.status.value if db_cargo.status else None
                            )
                elif isinstance(value, str):
                    # Should not reach here if conversion above worked, but handle just in case
                    print(f"[WARNING] Status is still a string, attempting conversion: {value}")
                    # Try to find matching enum by value
                    status_enum = None
                    for enum_item in CargoStatus:
                        if enum_item.value == value:
                            status_enum = enum_item
                            break
                    
                    if status_enum:
                        db_cargo.status = status_enum
                        print(f"[DEBUG] Converted and set status: {status_enum} (value: {status_enum.value})")
                    else:
                        raise HTTPException(status_code=400, detail=f"Invalid status value: {value}. Valid values: {', '.join([e.value for e in CargoStatus])}")
                else:
                    print(f"[ERROR] Status has unexpected type: {type(value)}, value: {value}")
                    raise HTTPException(status_code=400, detail=f"Invalid status type: {type(value)}")
            except HTTPException:
                raise
            except Exception as e:
                print(f"[ERROR] Failed to set status: {e}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error setting status: {str(e)}")
        elif field == 'lc_status' and value is not None:
            # CRITICAL: Database stores enum VALUE, not enum NAME
            # So we need to convert enum object to its value string
            old_lc_status = db_cargo.lc_status
            if isinstance(value, LCStatus):
                print(f"[DEBUG] Setting lc_status to enum VALUE: {value.value} (from enum: {value})")
                db_cargo.lc_status = value.value  # Store the enum VALUE, not the enum object
                print(f"[DEBUG] LC Status set to: {db_cargo.lc_status}, type: {type(db_cargo.lc_status)}")
            elif isinstance(value, str):
                # String should already be the enum value
                print(f"[DEBUG] Setting lc_status to string value: {value}")
                db_cargo.lc_status = value
            else:
                print(f"[ERROR] LC Status has unexpected type: {type(value)}, value: {value}")
                raise HTTPException(status_code=400, detail=f"Invalid lc_status type: {type(value)}")
            
            # Log lc_status change (but not if it's part of a MOVE, already logged)
            if 'monthly_plan_id' not in update_data or update_data['monthly_plan_id'] == old_monthly_plan_id:
                if old_lc_status != db_cargo.lc_status:
                    log_cargo_action(
                        db=db,
                        action='UPDATE',
                        cargo=db_cargo,
                        field_name='lc_status',
                        old_value=old_lc_status,
                        new_value=db_cargo.lc_status
                    )
        elif field == 'monthly_plan_id':
            # Handle monthly_plan_id update (MOVE action already logged above)
            try:
                setattr(db_cargo, field, value)
            except Exception as e:
                print(f"[ERROR] Failed to set monthly_plan_id: {e}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error updating monthly_plan_id: {str(e)}")
        else:
            try:
                old_val = old_values.get(field)
                setattr(db_cargo, field, value)
                # Log field change (but not if it's part of a MOVE, already logged)
                if field != 'monthly_plan_id' and (old_val != value):
                    log_cargo_action(
                        db=db,
                        action='UPDATE',
                        cargo=db_cargo,
                        field_name=field,
                        old_value=old_val,
                        new_value=value
                    )
            except Exception as e:
                print(f"[ERROR] Failed to set field {field}: {e}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Error updating field {field}: {str(e)}")
    
    # Status is now manual - user sets it via the UI
    # No automatic status updates
    
    print(f"[DEBUG] Committing cargo {cargo_id} update. Status before commit: {db_cargo.status}, LC Status: {db_cargo.lc_status}")
    try:
        db.commit()
        db.refresh(db_cargo)
        print(f"[DEBUG] Cargo {cargo_id} updated. Status after refresh: {db_cargo.status}, LC Status: {db_cargo.lc_status}")
        return db_cargo
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to commit cargo update: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error committing cargo update: {str(e)}")

@router.post("/{cargo_id}/start-in-road", response_model=schemas.Cargo)
def start_in_road_tracking(cargo_id: int, payload: schemas.CargoInRoadStart = schemas.CargoInRoadStart(), db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    if cargo.contract_type != ContractType.CIF:
        raise HTTPException(status_code=400, detail="In-road tracking is only applicable to CIF cargos")
    if cargo.status == CargoStatus.IN_ROAD_COMPLETE:
        raise HTTPException(status_code=400, detail="Cargo already completed discharge")

    previous_status = cargo.status
    cargo.status = CargoStatus.IN_ROAD

    # Update optional voyage fields
    for field in ["vessel_name", "eta_discharge_port", "discharge_port_location", "eta", "notes"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(cargo, field, value)

    log_cargo_action(
        db=db,
        action='UPDATE',
        cargo=cargo,
        field_name='status',
        old_value=previous_status.value if previous_status else None,
        new_value=cargo.status.value
    )

    db.commit()
    db.refresh(cargo)
    return cargo

@router.post("/{cargo_id}/mark-discharged", response_model=schemas.Cargo)
def mark_cargo_discharged(cargo_id: int, payload: schemas.CargoDischarge = schemas.CargoDischarge(), db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    if cargo.contract_type != ContractType.CIF:
        raise HTTPException(status_code=400, detail="Discharge tracking is only applicable to CIF cargos")
    if cargo.status == CargoStatus.IN_ROAD_COMPLETE:
        raise HTTPException(status_code=400, detail="Cargo already marked as discharged")

    previous_status = cargo.status
    cargo.status = CargoStatus.IN_ROAD_COMPLETE
    cargo.discharge_completion_time = payload.discharge_completion_time or datetime.utcnow()
    if payload.notes is not None:
        cargo.notes = payload.notes

    log_cargo_action(
        db=db,
        action='UPDATE',
        cargo=cargo,
        field_name='status',
        old_value=previous_status.value if previous_status else None,
        new_value=cargo.status.value
    )

    db.commit()
    db.refresh(cargo)
    return cargo

@router.delete("/{cargo_id}")
def delete_cargo(cargo_id: int, db: Session = Depends(get_db)):
    db_cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if db_cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    
    # Log the deletion before deleting
    log_cargo_action(
        db=db,
        action='DELETE',
        cargo=db_cargo,
        old_monthly_plan_id=db_cargo.monthly_plan_id
    )
    
    db.delete(db_cargo)
    db.commit()
    return {"message": "Cargo deleted successfully"}

