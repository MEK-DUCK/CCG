from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import List, Optional
from datetime import datetime
import logging
import uuid
import json
import asyncio

from app.database import get_db
from app import models, schemas
from app.models import ContractType, CargoStatus, LCStatus
from app.audit_utils import log_cargo_action
from app.presence import presence_manager
from app.config import (
    SUPPORTED_LOAD_PORTS,
    PORT_OP_ALLOWED_STATUSES,
    PortOperationStatus,
    QUANTITY_TOLERANCE,
    is_quantity_equal,
)
from app.errors import (
    AppError,
    cargo_not_found,
    cargo_already_exists,
    contract_not_found,
    customer_not_found,
    monthly_plan_not_found,
    combi_group_not_found,
    invalid_load_port,
    invalid_status,
    load_port_required_for_loading,
    to_http_exception,
    ValidationError,
    ErrorCode,
)
from app.version_history import version_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _cargo_to_broadcast_dict(cargo: models.Cargo) -> dict:
    """Convert a cargo model to a dict for broadcasting."""
    # Handle lc_status - it might be stored as string or enum
    lc_status_val = cargo.lc_status
    if lc_status_val and hasattr(lc_status_val, 'value'):
        lc_status_val = lc_status_val.value
    
    # Handle contract_type - might be enum
    contract_type_val = cargo.contract_type
    if contract_type_val and hasattr(contract_type_val, 'value'):
        contract_type_val = contract_type_val.value
    
    # Handle status - might be enum
    status_val = cargo.status
    if status_val and hasattr(status_val, 'value'):
        status_val = status_val.value
    
    # Safely get customer name - relationship might not be loaded after commit
    customer_name = None
    try:
        if hasattr(cargo, 'customer') and cargo.customer:
            customer_name = cargo.customer.name
    except Exception:
        pass  # Relationship not loaded, skip
    
    return {
        "id": cargo.id,
        "cargo_id": cargo.cargo_id,
        "vessel_name": cargo.vessel_name,
        "customer_id": cargo.customer_id,
        "customer_name": customer_name,
        "product_name": cargo.product_name,
        "contract_id": cargo.contract_id,
        "contract_type": contract_type_val,
        "cargo_quantity": cargo.cargo_quantity,
        "status": status_val,
        "laycan_window": cargo.laycan_window,
        "load_ports": cargo.load_ports,
        "monthly_plan_id": cargo.monthly_plan_id,
        "combi_group_id": cargo.combi_group_id,
        "lc_status": lc_status_val,
        "notes": cargo.notes,
    }


async def _broadcast_cargo_change(
    change_type: str,
    cargo_id: int,
    cargo_data: Optional[dict] = None,
    user_id: Optional[int] = None,
    user_initials: Optional[str] = None
) -> tuple[int, int]:
    """
    Broadcast cargo change to all users viewing port movement page.
    
    Returns:
        Tuple of (success_count, failure_count)
    """
    logger.info(f"[BROADCAST] _broadcast_cargo_change called: {change_type} cargo:{cargo_id} by user:{user_id}")
    try:
        result = await presence_manager.broadcast_data_change(
            resource_type="page",
            resource_id="port-movement",
            change_type=change_type,
            entity_type="cargo",
            entity_id=cargo_id,
            entity_data=cargo_data,
            changed_by_user_id=user_id,
            changed_by_initials=user_initials
        )
        success, failures = result if result else (0, 0)
        logger.info(f"[BROADCAST] broadcast_data_change completed for cargo:{cargo_id} (success={success}, failures={failures})")
        return (success, failures)
    except Exception as e:
        logger.error(f"Failed to broadcast cargo change: {e}", exc_info=True)
        return (0, 1)  # Indicate failure


def _port_op_to_broadcast_dict(op: models.CargoPortOperation, cargo: models.Cargo) -> dict:
    """Convert a port operation model to a dict for broadcasting."""
    status_val = op.status
    if status_val and hasattr(status_val, 'value'):
        status_val = status_val.value
    
    # Also include cargo status since it may have been recomputed
    cargo_status_val = cargo.status
    if cargo_status_val and hasattr(cargo_status_val, 'value'):
        cargo_status_val = cargo_status_val.value
    
    return {
        "id": op.id,
        "cargo_id": op.cargo_id,
        "port_code": op.port_code,
        "status": status_val,
        "eta": op.eta,
        "berthed": op.berthed,
        "commenced": op.commenced,
        "etc": op.etc,
        "notes": op.notes,
        # Include cargo info so frontend can update cargo status too
        "cargo_status": cargo_status_val,
        "cargo_version": cargo.version,
    }


async def _broadcast_port_op_change(
    cargo_id: int,
    port_code: str,
    port_op_data: dict,
    user_id: Optional[int] = None,
    user_initials: Optional[str] = None
):
    """Broadcast port operation change to all users viewing port movement page."""
    logger.info(f"[BROADCAST] _broadcast_port_op_change called: cargo:{cargo_id} port:{port_code} by user:{user_id}")
    try:
        await presence_manager.broadcast_data_change(
            resource_type="page",
            resource_id="port-movement",
            change_type="updated",
            entity_type="port_operation",
            entity_id=cargo_id,  # Use cargo_id as the entity_id for easier frontend handling
            entity_data={**port_op_data, "port_code": port_code},
            changed_by_user_id=user_id,
            changed_by_initials=user_initials
        )
        logger.info(f"[BROADCAST] broadcast_data_change completed for port_op cargo:{cargo_id} port:{port_code}")
    except Exception as e:
        logger.error(f"Failed to broadcast port operation change: {e}", exc_info=True)


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
                cargo.port_operations.append(
                    models.CargoPortOperation(port_code=port, status=PortOperationStatus.PLANNED.value)
                )
            except Exception:
                db.add(models.CargoPortOperation(
                    cargo_id=cargo.id, port_code=port, status=PortOperationStatus.PLANNED.value
                ))

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

        if all(s == PortOperationStatus.COMPLETED.value for s in statuses):
            cargo.status = CargoStatus.COMPLETED_LOADING
        elif any(s == PortOperationStatus.LOADING.value for s in statuses):
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
async def create_cargo(
    cargo: schemas.CargoCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    logger.info(f"Creating cargo: vessel={cargo.vessel_name}, contract={cargo.contract_id}, monthly_plan={cargo.monthly_plan_id}")
    
    # Verify all related entities exist
    customer = db.query(models.Customer).filter(models.Customer.id == cargo.customer_id).first()
    if not customer:
        raise to_http_exception(customer_not_found(cargo.customer_id))
    
    contract = db.query(models.Contract).filter(models.Contract.id == cargo.contract_id).first()
    if not contract:
        raise to_http_exception(contract_not_found(cargo.contract_id))
    
    # Verify product_name is in contract's products list
    contract_products = json.loads(contract.products) if contract.products else []
    product_names = [p["name"] for p in contract_products]
    if cargo.product_name not in product_names:
        raise HTTPException(
            status_code=400,
            detail=f"Product '{cargo.product_name}' not found in contract's products list. Valid products: {', '.join(product_names)}"
        )
    
    # SECURITY: Lock the monthly plan row to prevent race conditions
    # This ensures only one cargo can be created per monthly plan even with concurrent requests
    monthly_plan = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.id == cargo.monthly_plan_id
    ).with_for_update().first()
    
    if not monthly_plan:
        raise to_http_exception(monthly_plan_not_found(cargo.monthly_plan_id))
    
    # Validate cargo quantity matches monthly plan quantity (with tolerance)
    # This is now a HARD error to prevent data integrity issues
    if not is_quantity_equal(cargo.cargo_quantity, monthly_plan.month_quantity):
        raise HTTPException(
            status_code=400,
            detail=f"Cargo quantity ({cargo.cargo_quantity} KT) does not match monthly plan quantity ({monthly_plan.month_quantity} KT). "
                   f"Allowed tolerance is {QUANTITY_TOLERANCE * 100}%. Please adjust the quantity or update the monthly plan first."
        )
    
    # Check if this monthly plan already has a cargo
    # The row lock above prevents race conditions - if two requests try to create
    # a cargo for the same monthly plan, the second one will wait for the first
    # to complete, then see the existing cargo
    existing_cargo = db.query(models.Cargo).filter(
        models.Cargo.monthly_plan_id == cargo.monthly_plan_id
    ).first()
    
    if existing_cargo:
        raise to_http_exception(cargo_already_exists(existing_cargo.cargo_id, existing_cargo.vessel_name))
    
    # Generate system cargo_id
    cargo_id = f"CARGO-{uuid.uuid4().hex[:8].upper()}"
    
    # For lc_status, use enum VALUE for database storage
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
        contract_type=contract.contract_type,
        lc_status=lc_status_for_db,
        load_ports=cargo.load_ports,
        inspector_name=cargo.inspector_name,
        cargo_quantity=cargo.cargo_quantity,
        laycan_window=cargo.laycan_window,
        eta=cargo.eta,
        berthed=cargo.berthed,
        commenced=cargo.commenced,
        etc=cargo.etc,
        eta_load_port=cargo.eta_load_port,
        loading_start_time=cargo.loading_start_time,
        loading_completion_time=cargo.loading_completion_time,
        etd_load_port=cargo.etd_load_port,
        eta_discharge_port=cargo.eta_discharge_port,
        discharge_port_location=cargo.discharge_port_location,
        discharge_completion_time=cargo.discharge_completion_time,
        notes=cargo.notes,
        monthly_plan_id=cargo.monthly_plan_id,
        combi_group_id=combi_group_id,
        status=CargoStatus.PLANNED,
        product_id=0  # Legacy field
    )
    
    try:
        db.add(db_cargo)
        db.flush()

        # Create per-port operation rows for supported ports
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
        logger.info(f"Cargo created: id={db_cargo.id}, cargo_id={db_cargo.cargo_id}")
        
    except IntegrityError as e:
        db.rollback()
        # Race condition: another request created a cargo for this monthly_plan_id
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            existing = db.query(models.Cargo).filter(
                models.Cargo.monthly_plan_id == cargo.monthly_plan_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=409,  # Use 409 Conflict for race conditions
                    detail=f"This monthly plan already has a cargo assigned (Cargo ID: {existing.cargo_id}, Vessel: {existing.vessel_name}). Please edit the existing cargo instead."
                )
        logger.error(f"IntegrityError creating cargo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create cargo due to database constraint")
        
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error creating cargo: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database error while creating cargo")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error creating cargo: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred")
    
    # Broadcast the new cargo to all users viewing port movement (non-blocking)
    broadcast_success, broadcast_failures = 0, 0
    try:
        user_id = getattr(request.state, 'user_id', None)
        user_initials = getattr(request.state, 'user_initials', None)
        broadcast_success, broadcast_failures = await _broadcast_cargo_change(
            change_type="created",
            cargo_id=db_cargo.id,
            cargo_data=_cargo_to_broadcast_dict(db_cargo),
            user_id=user_id,
            user_initials=user_initials
        )
    except Exception as e:
        # Don't fail the request if broadcast fails
        logger.error(f"Failed to broadcast cargo creation: {e}")
        broadcast_failures = 1
    
    # Convert to response with broadcast status
    response = schemas.Cargo.model_validate(db_cargo)
    response.broadcast_success = broadcast_success
    response.broadcast_failures = broadcast_failures
    return response


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
    except SQLAlchemyError as e:
        logger.error(f"Database error reading cargos: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading cargos")


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
        query = db.query(models.Cargo).join(models.MonthlyPlan).filter(
            models.MonthlyPlan.month == month,
            models.MonthlyPlan.year == year,
            models.MonthlyPlan.month_quantity > 0
        ).filter(
            models.Cargo.status != CargoStatus.COMPLETED_LOADING
        )
        cargos = query.all()
        
        # Batch backfill port operations for cargos that need it
        cargos_needing_ops = [c for c in cargos if not getattr(c, "port_operations", None)]
        if cargos_needing_ops:
            for c in cargos_needing_ops:
                _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
        db.commit()
        
        return cargos
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_port_movement: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading port movement data")


@router.get("/completed-cargos", response_model=List[schemas.Cargo])
def read_completed_cargos(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get FOB completed cargos and CIF cargos after loading completion (including discharge complete), optionally filtered by month/year"""
    try:
        from sqlalchemy import or_, and_
        query = db.query(models.Cargo).filter(
            or_(
                # FOB cargos with Completed Loading status
                and_(
                    models.Cargo.status == CargoStatus.COMPLETED_LOADING,
                    models.Cargo.contract_type == ContractType.FOB
                ),
                # CIF cargos with Completed Loading status
                and_(
                    models.Cargo.status == CargoStatus.COMPLETED_LOADING,
                    models.Cargo.contract_type == ContractType.CIF
                ),
                # CIF cargos with Discharge Complete status (should stay in completed cargos for checklist tracking)
                and_(
                    models.Cargo.status == CargoStatus.DISCHARGE_COMPLETE,
                    models.Cargo.contract_type == ContractType.CIF
                )
            )
        )
        
        if month is not None or year is not None:
            query = query.join(models.MonthlyPlan)
            if month is not None:
                query = query.filter(models.MonthlyPlan.month == month)
            if year is not None:
                query = query.filter(models.MonthlyPlan.year == year)
        
        cargos = query.all()
        
        # Batch backfill port operations
        cargos_needing_ops = [c for c in cargos if not getattr(c, "port_operations", None)]
        if cargos_needing_ops:
            for c in cargos_needing_ops:
                _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
            db.commit()
        
        return cargos
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_completed_cargos: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading completed cargos")


@router.get("/active-loadings", response_model=List[schemas.Cargo])
def read_active_loadings(db: Session = Depends(get_db)):
    """
    Return cargos that have at least one per-port operation in Loading or Completed Loading,
    regardless of month/year.
    """
    try:
        query = db.query(models.Cargo).join(models.CargoPortOperation).filter(
            models.CargoPortOperation.status.in_([
                PortOperationStatus.LOADING.value,
                PortOperationStatus.COMPLETED.value
            ])
        ).filter(
            models.Cargo.status != CargoStatus.COMPLETED_LOADING
        ).distinct(models.Cargo.id)

        cargos = query.all()

        # Batch backfill port operations
        cargos_needing_ops = [c for c in cargos if not getattr(c, "port_operations", None)]
        if cargos_needing_ops:
            for c in cargos_needing_ops:
                _sync_port_operations(db, c, _parse_load_ports(getattr(c, "load_ports", None)))
        db.commit()
        
        return cargos
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_active_loadings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading active loadings")


@router.get("/in-road-cif", response_model=List[schemas.Cargo])
def read_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that completed loading but not discharge"""
    try:
        from sqlalchemy import and_
        query = db.query(models.Cargo).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.discharge_completion_time.is_(None),
            models.Cargo.status == CargoStatus.COMPLETED_LOADING,
        ))
        cargos = query.all()
        logger.debug(f"In-Road CIF query found {len(cargos)} cargos")
        return cargos
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_in_road_cif: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading in-road CIF cargos")


@router.get("/completed-in-road-cif", response_model=List[schemas.Cargo])
def read_completed_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that have Discharge Complete status"""
    try:
        from sqlalchemy import and_
        query = db.query(models.Cargo).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.status == CargoStatus.DISCHARGE_COMPLETE,
        ))
        return query.all()
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_completed_in_road_cif: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading completed in-road CIF cargos")


@router.get("/{cargo_id}", response_model=schemas.Cargo)
def read_cargo(cargo_id: int, db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))
    return cargo


@router.get("/{cargo_id}/port-operations", response_model=List[schemas.CargoPortOperation])
def list_port_operations(cargo_id: int, db: Session = Depends(get_db)):
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))
    ops = db.query(models.CargoPortOperation).filter(models.CargoPortOperation.cargo_id == cargo_id).all()
    return ops


@router.put("/{cargo_id}/port-operations/{port_code}", response_model=schemas.CargoPortOperation)
async def upsert_port_operation(
    cargo_id: int,
    port_code: str,
    op: schemas.CargoPortOperationUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    port_code = (port_code or "").strip().upper()
    if port_code not in SUPPORTED_LOAD_PORTS:
        raise to_http_exception(invalid_load_port(port_code, list(SUPPORTED_LOAD_PORTS)))

    # Lock the cargo row to prevent concurrent modifications
    cargo = db.query(models.Cargo).filter(
        models.Cargo.id == cargo_id
    ).with_for_update().first()
    if cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))

    update_data = op.model_dump(exclude_unset=True) if hasattr(op, "model_dump") else op.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        if update_data["status"] not in PORT_OP_ALLOWED_STATUSES:
            raise to_http_exception(invalid_status(update_data["status"], list(PORT_OP_ALLOWED_STATUSES)))

    # Lock the port operation row as well
    db_op = db.query(models.CargoPortOperation).filter(
        models.CargoPortOperation.cargo_id == cargo_id,
        models.CargoPortOperation.port_code == port_code,
    ).with_for_update().first()

    if not db_op:
        db_op = models.CargoPortOperation(
            cargo_id=cargo_id, port_code=port_code, status=PortOperationStatus.PLANNED.value
        )
        db.add(db_op)
        db.flush()

    for field, value in update_data.items():
        if hasattr(db_op, field):
            setattr(db_op, field, value)

    # Recompute cargo status based on per-port status
    _recompute_cargo_status_from_port_ops(db, cargo)
    
    # Increment cargo version since its state changed
    cargo.version = (cargo.version or 1) + 1
    
    db.commit()
    db.refresh(db_op)
    db.refresh(cargo)  # Refresh cargo to get updated status
    
    # Broadcast the port operation change to other users
    user_id = getattr(request.state, 'user_id', None)
    user_initials = getattr(request.state, 'user_initials', None)
    await _broadcast_port_op_change(
        cargo_id=cargo_id,
        port_code=port_code,
        port_op_data=_port_op_to_broadcast_dict(db_op, cargo),
        user_id=user_id,
        user_initials=user_initials
    )
    
    return db_op


@router.put("/{cargo_id}", response_model=schemas.Cargo)
async def update_cargo(
    cargo_id: int,
    cargo: schemas.CargoUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update cargo - handles lc_status conversion from string to enum.
    
    Implements optimistic locking: if client sends 'version', we verify it matches
    the current version to prevent lost updates from concurrent edits.
    
    Also saves version history before making changes (allows undo).
    """
    user_id = getattr(request.state, 'user_id', None)
    user_initials = getattr(request.state, 'user_initials', None)
    
    try:
        # Use SELECT FOR UPDATE to prevent concurrent modifications
        db_cargo = db.query(models.Cargo).filter(
            models.Cargo.id == cargo_id
        ).with_for_update().first()
        
        if db_cargo is None:
            raise to_http_exception(cargo_not_found(cargo_id))
        
        update_data = cargo.model_dump(exclude_unset=True) if hasattr(cargo, 'model_dump') else cargo.dict(exclude_unset=True)
        logger.debug(f"Updating cargo {cargo_id} with data: {update_data}")
        
        # Optimistic locking check - version is REQUIRED to prevent lost updates
        client_version = update_data.pop('version', None)
        if client_version is None:
            raise HTTPException(
                status_code=400,
                detail="Version field is required for updates. Please refresh the page and try again."
            )
        if client_version != db_cargo.version:
            raise HTTPException(
                status_code=409,
                detail=f"Cargo was modified by another user. Please refresh and try again. (Your version: {client_version}, Current version: {db_cargo.version})"
            )
        
        # Version history will be saved AFTER changes are applied
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing update request for cargo {cargo_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing update request")
    
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
                    status_enum = CargoStatus(status_value)
                    update_data['status'] = status_enum
                except ValueError:
                    raise to_http_exception(invalid_status(status_value, [e.value for e in CargoStatus]))
    
    # Convert lc_status to string VALUE (database stores enum VALUE, not enum NAME)
    if 'lc_status' in update_data and update_data['lc_status'] is not None:
        lc_status_value = update_data['lc_status']
        if lc_status_value == '':
            update_data['lc_status'] = None
        elif isinstance(lc_status_value, LCStatus):
            update_data['lc_status'] = lc_status_value.value
        elif isinstance(lc_status_value, str):
            valid_values = [e.value for e in LCStatus]
            if lc_status_value not in valid_values:
                raise to_http_exception(invalid_status(lc_status_value, valid_values))
    
    # Guardrail: prevent putting a cargo into Loading lifecycle without at least one load port
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
            raise to_http_exception(load_port_required_for_loading())

        if getattr(db_cargo, "status", None) in {CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING} and "load_ports" in update_data and len(selected_ports) == 0:
            raise HTTPException(
                status_code=400,
                detail="A cargo in Loading status must have at least one Load Port. Please select a port before clearing."
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Don't block updates due to guard computation errors
    
    # Store old values for audit logging
    old_monthly_plan_id = db_cargo.monthly_plan_id
    old_values = {}
    for field in update_data.keys():
        if hasattr(db_cargo, field):
            old_val = getattr(db_cargo, field)
            old_values[field] = old_val
    
    # Check if monthly_plan_id is being changed (MOVE action)
    if 'monthly_plan_id' in update_data and update_data['monthly_plan_id'] != old_monthly_plan_id:
        log_cargo_action(
            db=db,
            action='MOVE',
            cargo=db_cargo,
            old_monthly_plan_id=old_monthly_plan_id,
            new_monthly_plan_id=update_data['monthly_plan_id']
        )
    
    for field, value in update_data.items():
        if field == 'status' and value is not None:
            try:
                old_status = db_cargo.status
                if isinstance(value, CargoStatus):
                    db_cargo.status = value
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
                    status_enum = None
                    for enum_item in CargoStatus:
                        if enum_item.value == value:
                            status_enum = enum_item
                            break
                    if status_enum:
                        db_cargo.status = status_enum
                    else:
                        raise to_http_exception(invalid_status(value, [e.value for e in CargoStatus]))
                else:
                    raise HTTPException(status_code=400, detail=f"Invalid status type: {type(value)}")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Failed to set status: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Error setting status")
                
        elif field == 'lc_status' and value is not None:
            old_lc_status = db_cargo.lc_status
            if isinstance(value, LCStatus):
                db_cargo.lc_status = value.value
            elif isinstance(value, str):
                db_cargo.lc_status = value
            else:
                raise HTTPException(status_code=400, detail=f"Invalid lc_status type: {type(value)}")
            
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
            try:
                setattr(db_cargo, field, value)
            except Exception as e:
                logger.error(f"Failed to set monthly_plan_id: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Error updating monthly_plan_id")
        else:
            try:
                old_val = old_values.get(field)
                setattr(db_cargo, field, value)
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
                logger.error(f"Failed to set field {field}: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Error updating field {field}")

    # Keep per-port operations aligned when load_ports changes
    if 'load_ports' in update_data:
        _sync_port_operations(db, db_cargo, _parse_load_ports(getattr(db_cargo, "load_ports", None)))

    # If user sets cargo to "Planned", reset all port operations to "Planned"
    try:
        if 'status' in update_data and db_cargo.status == CargoStatus.PLANNED:
            for op in getattr(db_cargo, "port_operations", []) or []:
                if op.port_code in SUPPORTED_LOAD_PORTS and op.status in [PortOperationStatus.LOADING.value, PortOperationStatus.COMPLETED.value]:
                    op.status = PortOperationStatus.PLANNED.value
    except Exception:
        pass
    
    # If user sets cargo to "Loading", move all selected port operations into "Loading"
    try:
        if 'status' in update_data and db_cargo.status == CargoStatus.LOADING:
            for op in getattr(db_cargo, "port_operations", []) or []:
                if op.port_code in SUPPORTED_LOAD_PORTS and op.status == PortOperationStatus.PLANNED.value:
                    op.status = PortOperationStatus.LOADING.value
    except Exception:
        pass
    
    try:
        _recompute_cargo_status_from_port_ops(db, db_cargo)
        
        # Increment version for optimistic locking
        db_cargo.version = (db_cargo.version or 1) + 1
        
        # Save version history AFTER making changes (snapshot contains NEW state)
        # This allows proper diff comparison between versions
        user_id = getattr(request.state, 'user_id', None)
        user_initials = getattr(request.state, 'user_initials', None)
        changed_fields = [f for f, v in update_data.items() if old_values.get(f) != v]
        if changed_fields:
            change_summary = f"Updated: {', '.join(changed_fields)}"
            version_service.save_version(
                db, "cargo", cargo_id, db_cargo,
                user_id=user_id,
                user_initials=user_initials,
                change_summary=change_summary
            )
        
        db.commit()
        db.refresh(db_cargo)
        logger.info(f"Cargo {cargo_id} updated successfully (version {db_cargo.version})")
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error updating cargo {cargo_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error saving cargo update")
    
    # Broadcast the update to all users viewing port movement (non-blocking)
    broadcast_success, broadcast_failures = 0, 0
    try:
        user_id = getattr(request.state, 'user_id', None)
        user_initials = getattr(request.state, 'user_initials', None)
        logger.info(f"[BROADCAST] Starting broadcast for cargo {db_cargo.id}, user_id={user_id}, initials={user_initials}")
        broadcast_success, broadcast_failures = await _broadcast_cargo_change(
            change_type="updated",
            cargo_id=db_cargo.id,
            cargo_data=_cargo_to_broadcast_dict(db_cargo),
            user_id=user_id,
            user_initials=user_initials
        )
        logger.info(f"[BROADCAST] Completed broadcast for cargo {db_cargo.id} (success={broadcast_success}, failures={broadcast_failures})")
    except Exception as e:
        # Don't fail the request if broadcast fails
        logger.error(f"Failed to broadcast cargo update: {e}", exc_info=True)
        broadcast_failures = 1
    
    # Convert to response with broadcast status
    response = schemas.Cargo.model_validate(db_cargo)
    response.broadcast_success = broadcast_success
    response.broadcast_failures = broadcast_failures
    return response


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
    try:
        # Find all cargos in the combi group with FOR UPDATE lock to prevent concurrent modifications
        cargos = db.query(models.Cargo).filter(
            models.Cargo.combi_group_id == combi_group_id
        ).with_for_update().all()
        
        if not cargos:
            raise to_http_exception(combi_group_not_found(combi_group_id))
        
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
                        raise to_http_exception(invalid_status(status_value, [e.value for e in CargoStatus]))
        
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
                    raise to_http_exception(invalid_status(lc_status_value, valid_values))
        
        # Update all cargos in the group atomically
        updated_cargos = []
        for cargo in cargos:
            for field, value in update_data.items():
                if hasattr(cargo, field):
                    setattr(cargo, field, value)
            
            # Sync port operations if load_ports changed
            if 'load_ports' in update_data:
                selected_ports = _parse_load_ports(update_data['load_ports'])
                _sync_port_operations(db, cargo, selected_ports)
                
                if cargo.status in {CargoStatus.PLANNED, CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING}:
                    _recompute_cargo_status_from_port_ops(db, cargo)
            
            # If status changed to Planned, reset all port operations to Planned
            if 'status' in update_data and update_data['status'] == CargoStatus.PLANNED:
                ops = getattr(cargo, "port_operations", None)
                if ops:
                    for op in ops:
                        if op.status in [PortOperationStatus.LOADING.value, PortOperationStatus.COMPLETED.value]:
                            op.status = PortOperationStatus.PLANNED.value
            
            # If status changed to Loading, update all port operations to Loading
            if 'status' in update_data and update_data['status'] == CargoStatus.LOADING:
                ops = getattr(cargo, "port_operations", None)
                if ops:
                    for op in ops:
                        if op.status == PortOperationStatus.PLANNED.value:
                            op.status = PortOperationStatus.LOADING.value
            
            # If status changed to Completed Loading, update all port operations to Completed Loading
            if 'status' in update_data and update_data['status'] == CargoStatus.COMPLETED_LOADING:
                ops = getattr(cargo, "port_operations", None)
                if ops:
                    for op in ops:
                        if op.status in [PortOperationStatus.PLANNED.value, PortOperationStatus.LOADING.value]:
                            op.status = PortOperationStatus.COMPLETED.value
            
            # Increment version for optimistic locking
            cargo.version = (cargo.version or 1) + 1
            
            updated_cargos.append({
                "id": cargo.id,
                "cargo_id": cargo.cargo_id,
                "product_name": cargo.product_name,
                "status": cargo.status.value if cargo.status else None,
                "version": cargo.version,
            })
        
        db.commit()
        
        # Refresh all cargos
        for cargo in cargos:
            db.refresh(cargo)
        
        logger.info(f"Synced {len(cargos)} cargos in combi group {combi_group_id}")
        
        return {
            "message": f"Successfully synced {len(cargos)} cargos in combi group",
            "updated_count": len(cargos),
            "combi_group_id": combi_group_id,
            "updated_fields": list(update_data.keys()),
            "cargos": updated_cargos
        }
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error syncing combi group {combi_group_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to sync combi cargo group")
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error syncing combi group {combi_group_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.delete("/{cargo_id}")
async def delete_cargo(
    cargo_id: int, 
    request: Request, 
    reason: Optional[str] = Query(default=None, description="Reason for deletion"),
    permanent: bool = Query(default=False, description="Permanently delete (skip recycle bin)"),
    db: Session = Depends(get_db)
):
    """
    Delete a cargo.
    
    By default, uses soft delete (moves to recycle bin for 90 days).
    Use permanent=true to skip the recycle bin (cannot be undone).
    """
    db_cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if db_cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))
    
    user_id = getattr(request.state, 'user_id', None)
    user_initials = getattr(request.state, 'user_initials', None)
    
    try:
        # Log the deletion before deleting
        log_cargo_action(
            db=db,
            action='DELETE',
            cargo=db_cargo,
            old_monthly_plan_id=db_cargo.monthly_plan_id
        )
        db.flush()

        # Preserve audit log history by nulling the FK reference
        db.query(models.CargoAuditLog).filter(
            models.CargoAuditLog.cargo_id == db_cargo.id
        ).update(
            {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: db_cargo.id},
            synchronize_session=False
        )
    
        if permanent:
            # Hard delete - cannot be undone
            db.delete(db_cargo)
            logger.info(f"Cargo {cargo_id} permanently deleted")
        else:
            # Soft delete - move to recycle bin
            version_service.soft_delete(
                db, "cargo", db_cargo,
                user_id=user_id,
                user_initials=user_initials,
                reason=reason
            )
            logger.info(f"Cargo {cargo_id} moved to recycle bin")
        
        db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error deleting cargo {cargo_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting cargo")
    
    # Broadcast the deletion to all users viewing port movement (non-blocking)
    try:
        await _broadcast_cargo_change(
            change_type="deleted",
            cargo_id=cargo_id,
            cargo_data=None,
            user_id=user_id,
            user_initials=user_initials
        )
    except Exception as e:
        # Don't fail the request if broadcast fails
        logger.error(f"Failed to broadcast cargo deletion: {e}")
    
    message = "Cargo permanently deleted" if permanent else "Cargo moved to recycle bin (can be restored within 90 days)"
    return {"message": message}
