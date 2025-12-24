from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app import models, schemas
from app.models import ContractType, CargoStatus, LCStatus
from app.audit_utils import log_cargo_action
import uuid
import json

router = APIRouter()

# Supported load port codes for operational tracking sections in Port Movement UI
SUPPORTED_LOAD_PORTS = {"MAA", "MAB", "SHU", "ZOR"}
PORT_OP_ALLOWED_STATUSES = {"Planned", "Loading", "Completed Loading"}

def _parse_load_ports(load_ports: Optional[str]) -> List[str]:
    """
    Parse Cargo.load_ports into a list of port codes.
    Expected format from UI/backend is a comma-separated string, but we accept JSON arrays too.
    """
    if not load_ports:
        return []
    raw = load_ports.strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            arr = json.loads(raw)
            if isinstance(arr, list):
                return [str(x).strip() for x in arr if str(x).strip()]
        except Exception:
            pass
    return [p.strip() for p in raw.split(",") if p.strip()]

def _sync_port_operations(db: Session, cargo: models.Cargo, ports: List[str]):
    """
    Ensure per-port operation rows exist for the given cargo + selected ports.
    Also removes operations for ports no longer selected (only for SUPPORTED_LOAD_PORTS).
    """
    selected = [p for p in ports if p in SUPPORTED_LOAD_PORTS]
    existing = {op.port_code: op for op in getattr(cargo, "port_operations", []) or []}

    # Create missing operations
    for port in selected:
        if port not in existing:
            try:
                # Prefer relationship append so in-memory collections update immediately
                cargo.port_operations.append(models.CargoPortOperation(port_code=port, status="Planned"))
            except Exception:
                db.add(models.CargoPortOperation(cargo_id=cargo.id, port_code=port, status="Planned"))

    # Remove operations for removed ports (supported only)
    for port_code, op in existing.items():
        if port_code in SUPPORTED_LOAD_PORTS and port_code not in selected:
            db.delete(op)

def _recompute_cargo_status_from_port_ops(db: Session, cargo: models.Cargo):
    """
    Keep cargo.status aligned with per-port statuses for the three loading lifecycle statuses.
    Only applies when cargo is in the loading lifecycle (Planned/Loading/Completed Loading).
    """
    try:
        current = cargo.status
        if current not in {CargoStatus.PLANNED, CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING}:
            return

        ops = getattr(cargo, "port_operations", None)
        if not ops:
            return

        statuses = [op.status for op in ops if op.port_code in SUPPORTED_LOAD_PORTS]
        if not statuses:
            return

        if all(s == "Completed Loading" for s in statuses):
            cargo.status = CargoStatus.COMPLETED_LOADING
        elif any(s == "Loading" for s in statuses):
            cargo.status = CargoStatus.LOADING
        else:
            cargo.status = CargoStatus.PLANNED
    except Exception:
        return

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
    
    # Check if this monthly plan already has a cargo
    existing_cargo = db.query(models.Cargo).filter(
        models.Cargo.monthly_plan_id == cargo.monthly_plan_id
    ).first()
    
    if existing_cargo:
        # Monthly plan already has a cargo assigned - return error with existing cargo info
        raise HTTPException(
            status_code=400,
            detail=f"This monthly plan already has a cargo assigned (Cargo ID: {existing_cargo.cargo_id}, Vessel: {existing_cargo.vessel_name}). Please edit the existing cargo instead of creating a new one."
        )
    
    # Generate system cargo_id
    cargo_id = f"CARGO-{uuid.uuid4().hex[:8].upper()}"
    
    # CRITICAL: For lc_status, SQLAlchemy uses enum NAME but database needs enum VALUE
    # So we need to ensure we use the enum VALUE, not the enum NAME
    # For status, it works because database has both names and values
    # For lc_status, database only has values, so we must use .value
    lc_status_for_db = cargo.lc_status.value if cargo.lc_status else None
    
    # Get combi_group_id - either from cargo payload or inherit from monthly plan
    combi_group_id = cargo.combi_group_id
    if not combi_group_id and monthly_plan and monthly_plan.combi_group_id:
        combi_group_id = monthly_plan.combi_group_id
    
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
        combi_group_id=combi_group_id,  # Link combi cargos together
        status=CargoStatus.PLANNED,  # Always start as Planned, user will update manually
        product_id=0  # Legacy field, set to 0 for backward compatibility
    )
    
    try:
        db.add(db_cargo)
        db.flush()  # Flush to get the ID

        # Create per-port operation rows for supported ports (MAA/MAB/SHU/ZOR)
        _sync_port_operations(db, db_cargo, _parse_load_ports(db_cargo.load_ports))
        
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
    except IntegrityError as e:
        db.rollback()
        # Race condition: another request created a cargo for this monthly_plan_id after our pre-check.
        try:
            # psycopg2 unique violation text includes 'UniqueViolation'
            if "UniqueViolation" in str(getattr(e, "orig", "")) or "duplicate key value" in str(e):
                existing = db.query(models.Cargo).filter(models.Cargo.monthly_plan_id == cargo.monthly_plan_id).first()
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"This monthly plan already has a cargo assigned (Cargo ID: {existing.cargo_id}, Vessel: {existing.vessel_name}). Please edit the existing cargo instead of creating a new one."
                    )
        except HTTPException:
            raise
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to create cargo: {str(e)}")
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
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
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
            # Exclude cargos where the monthly plan has quantity 0 (deferred/cancelled)
            query = query.filter(models.MonthlyPlan.month_quantity > 0)
        
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
        
        from sqlalchemy import or_, not_
        # Exclude cargos that should be in other tabs:
        # - Completed Loading (all types) -> goes to Completed Cargos tab
        # - In-Road (Pending Discharge) -> goes to In-Road CIF tab
        # (CIF Pending Nomination remains in Port Movement)
        # Also exclude cargos where the monthly plan has quantity 0 (deferred/cancelled)
        query = db.query(models.Cargo).join(models.MonthlyPlan).filter(
            models.MonthlyPlan.month == month,
            models.MonthlyPlan.year == year,
            models.MonthlyPlan.month_quantity > 0  # Exclude deferred/cancelled plans with 0 quantity
        ).filter(
            not_(
                or_(
                    models.Cargo.status == CargoStatus.COMPLETED_LOADING,  # All completed loading cargos
                    models.Cargo.status == CargoStatus.IN_ROAD,  # In-Road cargos
                )
            )
        )
        cargos = query.all()
        # Backfill port operations for existing cargos that predate this feature
        for c in cargos:
            if (getattr(c, "port_operations", None) is not None) and len(getattr(c, "port_operations")) == 0:
                _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
        db.commit()
        return cargos
    except Exception as e:
        import traceback
        error_msg = f"Error in read_port_movement: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error loading port movement: {str(e)}")

@router.get("/completed-cargos", response_model=List[schemas.Cargo])
def read_completed_cargos(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get FOB completed cargos and CIF cargos after loading completion, optionally filtered by month/year"""
    from sqlalchemy import or_, and_
    query = db.query(models.Cargo).filter(
        or_(
            and_(
                models.Cargo.status == CargoStatus.COMPLETED_LOADING,
                models.Cargo.contract_type == ContractType.FOB
            ),
            and_(
                models.Cargo.status == CargoStatus.COMPLETED_LOADING,
                models.Cargo.contract_type == ContractType.CIF
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
    # Backfill port operations for older cargos so completed view can show per-port details.
    for c in cargos:
        if (getattr(c, "port_operations", None) is not None) and len(getattr(c, "port_operations")) == 0:
            _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
    db.commit()
    return cargos


@router.get("/active-loadings", response_model=List[schemas.Cargo])
def read_active_loadings(db: Session = Depends(get_db)):
    """
    Return cargos that have at least one per-port operation in Loading or Completed Loading,
    regardless of month/year.

    These rows power the top port sections and must not be affected by the Port Movement
    month/year filter.
    """
    from sqlalchemy import and_, or_
    try:
        query = db.query(models.Cargo).join(models.CargoPortOperation).filter(
            models.CargoPortOperation.status.in_(["Loading", "Completed Loading"])
        ).filter(
            # Do not show cargos that are already fully completed or in-road
            models.Cargo.status.notin_([CargoStatus.COMPLETED_LOADING, CargoStatus.IN_ROAD])
        ).distinct(models.Cargo.id)

        cargos = query.all()

        # Backfill port operations for existing cargos that predate this feature
        for c in cargos:
            if (getattr(c, "port_operations", None) is not None) and len(getattr(c, "port_operations")) == 0:
                _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
        db.commit()
        return cargos
    except Exception as e:
        import traceback
        error_msg = f"Error in read_active_loadings: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error loading active loadings: {str(e)}")

@router.get("/in-road-cif", response_model=List[schemas.Cargo])
def read_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that completed loading but not discharge"""
    try:
        from sqlalchemy import and_
        
        # CIF In-Road tab should show cargos after loading completion until discharge completion.
        # We include both:
        # - COMPLETED_LOADING (CIF cargo after loading completion)
        # - IN_ROAD (explicit in-road status, if used)
        query = db.query(models.Cargo).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.discharge_completion_time.is_(None),  # Pending discharge only
            models.Cargo.status.in_([CargoStatus.COMPLETED_LOADING, CargoStatus.IN_ROAD]),
        ))
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

@router.get("/completed-in-road-cif", response_model=List[schemas.Cargo])
def read_completed_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that are IN_ROAD and have completed discharge"""
    try:
        from sqlalchemy import and_
        # Completed In-Road CIF tab shows cargos that have completed discharge.
        # Include both COMPLETED_LOADING and IN_ROAD statuses to support either workflow.
        query = db.query(models.Cargo).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.discharge_completion_time.is_not(None),  # Completed discharge
            models.Cargo.status.in_([CargoStatus.COMPLETED_LOADING, CargoStatus.IN_ROAD]),
        ))
        return query.all()
    except Exception as e:
        import traceback
        error_msg = f"Error in read_completed_in_road_cif: {str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@router.get("/{cargo_id}", response_model=schemas.Cargo)
def read_cargo(cargo_id: int, db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    return cargo


@router.get("/{cargo_id}/port-operations", response_model=List[schemas.CargoPortOperation])
def list_port_operations(cargo_id: int, db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    ops = db.query(models.CargoPortOperation).filter(models.CargoPortOperation.cargo_id == cargo_id).all()
    return ops


@router.put("/{cargo_id}/port-operations/{port_code}", response_model=schemas.CargoPortOperation)
def upsert_port_operation(
    cargo_id: int,
    port_code: str,
    op: schemas.CargoPortOperationUpdate,
    db: Session = Depends(get_db)
):
    port_code = (port_code or "").strip().upper()
    if port_code not in SUPPORTED_LOAD_PORTS:
        raise HTTPException(status_code=400, detail=f"Invalid port_code: {port_code}. Must be one of: {', '.join(sorted(SUPPORTED_LOAD_PORTS))}")

    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")

    update_data = op.model_dump(exclude_unset=True) if hasattr(op, "model_dump") else op.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        if update_data["status"] not in PORT_OP_ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {update_data['status']}. Must be one of: {', '.join(sorted(PORT_OP_ALLOWED_STATUSES))}")

    db_op = db.query(models.CargoPortOperation).filter(
        models.CargoPortOperation.cargo_id == cargo_id,
        models.CargoPortOperation.port_code == port_code,
    ).first()

    if not db_op:
        db_op = models.CargoPortOperation(cargo_id=cargo_id, port_code=port_code, status="Planned")
        db.add(db_op)
        db.flush()

    for field, value in update_data.items():
        if hasattr(db_op, field):
            setattr(db_op, field, value)

    # Recompute cargo status based on per-port status
    _recompute_cargo_status_from_port_ops(db, cargo)
    db.commit()
    db.refresh(db_op)
    return db_op

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

    # Guardrail: prevent putting a cargo into Loading lifecycle without at least one load port selected.
    # Otherwise it disappears from the main Port Movement table (filtered out) and has no port lane to show in.
    def _coerce_load_ports_to_str(val) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, str):
            return val
        if isinstance(val, list):
            try:
                return ",".join([str(x).strip() for x in val if str(x).strip()])
            except Exception:
                return None
        try:
            return str(val)
        except Exception:
            return None

    try:
        intended_status = update_data.get("status", db_cargo.status)
        if isinstance(intended_status, str):
            try:
                intended_status = CargoStatus(intended_status)
            except Exception:
                intended_status = db_cargo.status

        intended_load_ports = _coerce_load_ports_to_str(update_data.get("load_ports", getattr(db_cargo, "load_ports", None)))
        selected_ports = _parse_load_ports(intended_load_ports)

        if intended_status in {CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING} and len(selected_ports) == 0:
            raise HTTPException(
                status_code=400,
                detail="Please select at least one Load Port before setting status to Loading."
            )

        if getattr(db_cargo, "status", None) in {CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING} and "load_ports" in update_data and len(selected_ports) == 0:
            raise HTTPException(
                status_code=400,
                detail="A cargo in Loading status must have at least one Load Port. Please select a port before clearing."
            )
    except HTTPException:
        raise
    except Exception:
        # Never block updates due to guard computation errors; backend validation above is best-effort.
        pass
    
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

    # Keep per-port operations aligned when load_ports changes
    if 'load_ports' in update_data:
        _sync_port_operations(db, db_cargo, _parse_load_ports(getattr(db_cargo, "load_ports", None)))

    # If user sets cargo to "Loading", move all selected port operations into "Loading"
    # so the cargo appears under the port sections immediately.
    try:
        if 'status' in update_data and db_cargo.status == CargoStatus.LOADING:
            for op in getattr(db_cargo, "port_operations", []) or []:
                if op.port_code in SUPPORTED_LOAD_PORTS and op.status == "Planned":
                    op.status = "Loading"
    except Exception:
        pass
    
    print(f"[DEBUG] Committing cargo {cargo_id} update. Status before commit: {db_cargo.status}, LC Status: {db_cargo.lc_status}")
    try:
        # Recompute status in case port ops imply completion (e.g., all ports completed)
        _recompute_cargo_status_from_port_ops(db, db_cargo)
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

@router.put("/combi-group/{combi_group_id}/sync")
def sync_combi_cargo_group(
    combi_group_id: str,
    update: schemas.CargoUpdate,
    db: Session = Depends(get_db)
):
    """
    Atomically update all cargos in a combi group with shared fields.
    This ensures combi cargos stay in sync for vessel name, load ports, status, etc.
    
    Only updates fields that are set in the request - individual cargo quantities are preserved.
    """
    # Find all cargos in the combi group
    cargos = db.query(models.Cargo).filter(
        models.Cargo.combi_group_id == combi_group_id
    ).all()
    
    if not cargos:
        raise HTTPException(status_code=404, detail=f"No cargos found with combi_group_id: {combi_group_id}")
    
    # Get update data, excluding fields that should remain individual per cargo
    update_data = update.model_dump(exclude_unset=True) if hasattr(update, 'model_dump') else update.dict(exclude_unset=True)
    
    # Fields that should NOT be synced (they're individual per cargo in a combi)
    individual_fields = {'cargo_quantity', 'product_name', 'monthly_plan_id'}
    
    # Remove individual fields from update
    for field in individual_fields:
        update_data.pop(field, None)
    
    if not update_data:
        return {"message": "No shared fields to update", "updated_count": 0, "cargos": []}
    
    # Convert status string to enum if present
    if 'status' in update_data and update_data['status'] is not None:
        status_value = update_data['status']
        if isinstance(status_value, str):
            status_enum = None
            for enum_item in CargoStatus:
                if enum_item.value == status_value:
                    status_enum = enum_item
                    break
            if status_enum:
                update_data['status'] = status_enum
            else:
                try:
                    update_data['status'] = CargoStatus(status_value)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Invalid status value: {status_value}")
    
    # Convert lc_status if present
    if 'lc_status' in update_data and update_data['lc_status'] is not None:
        lc_status_value = update_data['lc_status']
        if lc_status_value == '':
            update_data['lc_status'] = None
        elif isinstance(lc_status_value, LCStatus):
            update_data['lc_status'] = lc_status_value.value
        elif isinstance(lc_status_value, str):
            valid_values = [e.value for e in LCStatus]
            if lc_status_value not in valid_values:
                raise HTTPException(status_code=400, detail=f"Invalid lc_status value: {lc_status_value}")
    
    # Update all cargos in the group
    updated_cargos = []
    for cargo in cargos:
        # Log the update for audit
        old_values = {}
        for field in update_data.keys():
            if hasattr(cargo, field):
                old_values[field] = getattr(cargo, field)
        
        # Apply updates
        for field, value in update_data.items():
            if hasattr(cargo, field):
                setattr(cargo, field, value)
        
        # Sync port operations if load_ports changed
        if 'load_ports' in update_data:
            selected_ports = _parse_load_ports(update_data['load_ports'])
            _sync_port_operations(db, cargo, selected_ports)
            
            # Recompute status from port ops if in loading lifecycle
            if cargo.status in {CargoStatus.PLANNED, CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING}:
                _recompute_cargo_status_from_port_ops(db, cargo)
        
        updated_cargos.append({
            "id": cargo.id,
            "cargo_id": cargo.cargo_id,
            "product_name": cargo.product_name,
            "status": cargo.status.value if cargo.status else None,
        })
    
    db.commit()
    
    # Refresh all cargos
    for cargo in cargos:
        db.refresh(cargo)
    
    print(f"[COMBI_SYNC] Updated {len(cargos)} cargos in combi group {combi_group_id}")
    
    return {
        "message": f"Successfully synced {len(cargos)} cargos in combi group",
        "updated_count": len(cargos),
        "combi_group_id": combi_group_id,
        "updated_fields": list(update_data.keys()),
        "cargos": updated_cargos
    }


@router.delete("/{cargo_id}")
def delete_cargo(cargo_id: int, db: Session = Depends(get_db)):
    db_cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if db_cargo is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    
    try:
        # Log the deletion before deleting
        log_cargo_action(
            db=db,
            action='DELETE',
            cargo=db_cargo,
            old_monthly_plan_id=db_cargo.monthly_plan_id
        )
        db.flush()  # ensure audit log row exists in this transaction

        # IMPORTANT: audit log foreign key must NOT block deletions.
        # Preserve history via cargo_cargo_id + snapshot + stable numeric cargo_db_id, but null the FK reference.
        db.query(models.CargoAuditLog).filter(
            models.CargoAuditLog.cargo_id == db_cargo.id
        ).update(
            {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: db_cargo.id},
            synchronize_session=False
        )
    
        db.delete(db_cargo)
        db.commit()
        return {"message": "Cargo deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"[ERROR] Error deleting cargo: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting cargo: {str(e)}")

