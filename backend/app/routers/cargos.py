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
    get_load_port_by_code,
    get_load_port_by_id,
    get_active_load_port_codes,
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
from app.utils.quantity import get_product_id_by_name, get_product_name_by_id

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_inspector_id_by_name(db: Session, inspector_name: Optional[str]) -> Optional[int]:
    """Get inspector_id from inspector name. Returns None if not found or name is empty."""
    if not inspector_name:
        return None
    inspector = db.query(models.Inspector).filter(models.Inspector.name == inspector_name).first()
    return inspector.id if inspector else None


def _get_inspector_name_by_id(db: Session, inspector_id: Optional[int]) -> Optional[str]:
    """Get inspector name from inspector_id. Returns None if not found."""
    if not inspector_id:
        return None
    inspector = db.query(models.Inspector).filter(models.Inspector.id == inspector_id).first()
    return inspector.name if inspector else None


def _cargo_to_schema(cargo: models.Cargo, db: Session) -> dict:
    """
    Convert a Cargo model to a schema-compatible dict.
    
    Translates product_id back to product_name for API compatibility with frontend.
    Computes load_ports string from port_operations relationship.
    """
    # Get product_name from product relationship or lookup
    product_name = None
    if cargo.product_id:
        if hasattr(cargo, 'product') and cargo.product:
            product_name = cargo.product.name
        else:
            product_name = get_product_name_by_id(db, cargo.product_id)
    
    # Handle enums
    lc_status_val = cargo.lc_status
    if lc_status_val and hasattr(lc_status_val, 'value'):
        lc_status_val = lc_status_val.value
    
    contract_type_val = cargo.contract_type
    if contract_type_val and hasattr(contract_type_val, 'value'):
        contract_type_val = contract_type_val.value
    
    status_val = cargo.status
    if status_val and hasattr(status_val, 'value'):
        status_val = status_val.value
    
    # Compute load_ports string from port_operations (normalized source of truth)
    load_ports_str = ""
    port_operations = None
    if hasattr(cargo, 'port_operations') and cargo.port_operations:
        # Sort by load_port.sort_order for consistent display
        sorted_ops = sorted(
            cargo.port_operations,
            key=lambda op: (op.load_port.sort_order if op.load_port else 0, op.load_port_id)
        )
        load_ports_str = ",".join(op.load_port.code for op in sorted_ops if op.load_port)
        port_operations = [
            {
                "id": op.id,
                "cargo_id": op.cargo_id,
                "port_code": op.load_port.code if op.load_port else "",  # API compatibility
                "status": op.status,
                "eta": op.eta,
                "berthed": op.berthed,
                "commenced": op.commenced,
                "etc": op.etc,
                "notes": op.notes,
                "created_at": op.created_at,
                "updated_at": op.updated_at,
            }
            for op in sorted_ops
        ]
    
    return {
        "id": cargo.id,
        "cargo_id": cargo.cargo_id,
        "vessel_name": cargo.vessel_name,
        "customer_id": cargo.customer_id,
        "product_name": product_name,
        "contract_id": cargo.contract_id,
        "contract_type": contract_type_val,
        "combi_group_id": cargo.combi_group_id,
        "lc_status": lc_status_val,
        "load_ports": load_ports_str,  # Computed from port_operations
        "inspector_name": cargo.get_inspector_name(),
        "cargo_quantity": cargo.cargo_quantity,
        "laycan_window": cargo.laycan_window,
        "eta": cargo.eta,
        "berthed": cargo.berthed,
        "commenced": cargo.commenced,
        "etc": cargo.etc,
        "eta_load_port": cargo.eta_load_port,
        "loading_start_time": cargo.loading_start_time,
        "loading_completion_time": cargo.loading_completion_time,
        "etd_load_port": cargo.etd_load_port,
        "eta_discharge_port": cargo.eta_discharge_port,
        "discharge_port_location": cargo.discharge_port_location,
        "discharge_completion_time": cargo.discharge_completion_time,
        "five_nd_date": cargo.five_nd_date,
        "nd_completed": cargo.nd_completed,
        "nd_days": cargo.nd_days,
        "nd_delivery_window": cargo.nd_delivery_window,
        "notes": cargo.notes,
        "sailing_fax_entry_completed": cargo.sailing_fax_entry_completed,
        "sailing_fax_entry_initials": cargo.sailing_fax_entry_initials,
        "sailing_fax_entry_date": cargo.sailing_fax_entry_date,
        "documents_mailing_completed": cargo.documents_mailing_completed,
        "documents_mailing_initials": cargo.documents_mailing_initials,
        "documents_mailing_date": cargo.documents_mailing_date,
        "inspector_invoice_completed": cargo.inspector_invoice_completed,
        "inspector_invoice_initials": cargo.inspector_invoice_initials,
        "inspector_invoice_date": cargo.inspector_invoice_date,
        "status": status_val,
        "monthly_plan_id": cargo.monthly_plan_id,
        "version": cargo.version,
        "created_at": cargo.created_at,
        "updated_at": cargo.updated_at,
        "port_operations": port_operations,
    }


def _cargo_to_broadcast_dict(cargo: models.Cargo, db: Session = None) -> dict:
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
    
    # Get product_name from product relationship or lookup
    product_name = None
    if cargo.product_id:
        if hasattr(cargo, 'product') and cargo.product:
            product_name = cargo.product.name
        elif db:
            product_name = get_product_name_by_id(db, cargo.product_id)
    
    # Compute load_ports string from port_operations
    load_ports_str = ""
    try:
        if hasattr(cargo, 'port_operations') and cargo.port_operations:
            sorted_ops = sorted(
                cargo.port_operations,
                key=lambda op: (op.load_port.sort_order if op.load_port else 0, op.load_port_id)
            )
            load_ports_str = ",".join(op.load_port.code for op in sorted_ops if op.load_port)
    except Exception:
        pass  # Relationship not loaded
    
    # Get inspector_name from relationship
    inspector_name = None
    try:
        if hasattr(cargo, 'inspector') and cargo.inspector:
            inspector_name = cargo.inspector.name
    except Exception:
        pass  # Relationship not loaded
    
    return {
        "id": cargo.id,
        "cargo_id": cargo.cargo_id,
        "vessel_name": cargo.vessel_name,
        "customer_id": cargo.customer_id,
        "customer_name": customer_name,
        "product_name": product_name,
        "contract_id": cargo.contract_id,
        "contract_type": contract_type_val,
        "cargo_quantity": cargo.cargo_quantity,
        "status": status_val,
        "laycan_window": cargo.laycan_window,
        "load_ports": load_ports_str,  # Computed from port_operations
        "monthly_plan_id": cargo.monthly_plan_id,
        "combi_group_id": cargo.combi_group_id,
        "lc_status": lc_status_val,
        "inspector_name": inspector_name,
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
    
    # Get port_code from load_port relationship for API compatibility
    port_code = op.load_port.code if op.load_port else ""
    
    return {
        "id": op.id,
        "cargo_id": op.cargo_id,
        "port_code": port_code,  # Derived from load_port relationship
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


def _parse_load_ports_input(load_ports: Optional[str]) -> List[str]:
    """
    Parse load_ports input from API (comma-separated string or JSON array) into list of port codes.
    This is used to interpret what the frontend sends us.
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
                return [str(x).strip().upper() for x in arr if str(x).strip()]
        except Exception:
            pass
    return [p.strip().upper() for p in raw.split(",") if p.strip()]


def _sync_port_operations_normalized(db: Session, cargo: models.Cargo, port_codes: List[str]):
    """
    Sync port operations for a cargo based on desired port codes.
    Creates operations for new ports, removes operations for removed ports.
    Uses normalized load_port_id instead of port_code string.
    """
    # Get active port codes from DB for validation
    active_port_codes = get_active_load_port_codes(db)
    
    # Filter to only valid/active ports
    selected_codes = [p for p in port_codes if p in active_port_codes]
    
    # Build map of existing operations by port code
    existing_by_code = {}
    for op in (cargo.port_operations or []):
        if op.load_port:
            existing_by_code[op.load_port.code] = op
    
    # Create missing operations
    for code in selected_codes:
        if code not in existing_by_code:
            load_port = get_load_port_by_code(db, code)
            if load_port:
                try:
                    cargo.port_operations.append(
                        models.CargoPortOperation(
                            load_port_id=load_port.id,
                            status=PortOperationStatus.PLANNED.value
                        )
                    )
                except Exception:
                    db.add(models.CargoPortOperation(
                        cargo_id=cargo.id,
                        load_port_id=load_port.id,
                        status=PortOperationStatus.PLANNED.value
                    ))
    
    # Remove operations for removed ports
    for code, op in existing_by_code.items():
        if code not in selected_codes:
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

        # Get statuses from all port operations (all are valid since they reference load_ports table)
        statuses = [op.status for op in ops]
        if not statuses:
            return

        if all(s == PortOperationStatus.COMPLETED_LOADING.value for s in statuses):
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
    
    from sqlalchemy.orm import joinedload
    
    # Verify all related entities exist
    customer = db.query(models.Customer).filter(models.Customer.id == cargo.customer_id).first()
    if not customer:
        raise to_http_exception(customer_not_found(cargo.customer_id))
    
    contract = db.query(models.Contract).options(
        joinedload(models.Contract.contract_products).joinedload(models.ContractProduct.product)
    ).filter(models.Contract.id == cargo.contract_id).first()
    if not contract:
        raise to_http_exception(contract_not_found(cargo.contract_id))
    
    # Verify product_name is in contract's products list and get product_id
    contract_products = contract.get_products_list()
    product_names = [p["name"] for p in contract_products]
    if cargo.product_name not in product_names:
        raise HTTPException(
            status_code=400,
            detail=f"Product '{cargo.product_name}' not found in contract's products list. Valid products: {', '.join(product_names)}"
        )
    
    # Get product_id for normalized storage
    product_id = get_product_id_by_name(db, cargo.product_name)
    if not product_id:
        raise HTTPException(
            status_code=400,
            detail=f"Product '{cargo.product_name}' not found in products database"
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

    # Get combi_group_id - either from cargo payload or inherit from monthly plan
    combi_group_id = cargo.combi_group_id
    if not combi_group_id and monthly_plan and monthly_plan.combi_group_id:
        combi_group_id = monthly_plan.combi_group_id
    
    # Get inspector_id from inspector_name (normalized)
    inspector_id = _get_inspector_id_by_name(db, cargo.inspector_name)
    
    db_cargo = models.Cargo(
        cargo_id=cargo_id,
        vessel_name=cargo.vessel_name,
        customer_id=cargo.customer_id,
        product_id=product_id,  # Normalized product reference
        contract_id=cargo.contract_id,
        contract_type=contract.contract_type,
        lc_status=cargo.lc_status,  # Enum handles conversion automatically
        # NOTE: load_ports column removed - now derived from port_operations
        inspector_id=inspector_id,  # Normalized inspector reference
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
    )
    
    try:
        db.add(db_cargo)
        db.flush()

        # Create port operations from load_ports input (normalized)
        port_codes = _parse_load_ports_input(cargo.load_ports)
        _sync_port_operations_normalized(db, db_cargo, port_codes)
        
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
            cargo_data=_cargo_to_broadcast_dict(db_cargo, db),
            user_id=user_id,
            user_initials=user_initials
        )
    except Exception as e:
        # Don't fail the request if broadcast fails
        logger.error(f"Failed to broadcast cargo creation: {e}")
        broadcast_failures = 1
    
    # Convert to response with broadcast status using helper
    response_data = _cargo_to_schema(db_cargo, db)
    response_data["broadcast_success"] = broadcast_success
    response_data["broadcast_failures"] = broadcast_failures
    return response_data


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
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        )
        
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
        return [_cargo_to_schema(c, db) for c in cargos]
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
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        ).join(models.MonthlyPlan).filter(
            models.MonthlyPlan.month == month,
            models.MonthlyPlan.year == year,
            models.MonthlyPlan.month_quantity > 0
        ).filter(
            # Exclude completed cargos (both Completed Loading and Discharge Complete)
            models.Cargo.status.notin_([CargoStatus.COMPLETED_LOADING, CargoStatus.DISCHARGE_COMPLETE])
        )
        cargos = query.all()
        
        # Note: Port operations are now the source of truth (normalized)
        # No backfill needed - cargos without port_operations simply have no ports assigned
        
        return [_cargo_to_schema(c, db) for c in cargos]
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_port_movement: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading port movement data")


@router.get("/completed-cargos", response_model=List[schemas.Cargo])
def read_completed_cargos(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    """Get FOB completed cargos and CIF cargos after loading completion (including discharge complete), optionally filtered by month/year"""
    try:
        from sqlalchemy import or_, and_
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        ).filter(
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
        
        # Note: Port operations are now the source of truth (normalized)
        # No backfill needed - cargos without port_operations simply have no ports assigned
        
        return [_cargo_to_schema(c, db) for c in cargos]
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_completed_cargos: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading completed cargos")


@router.get("/active-loadings", response_model=List[schemas.Cargo])
def read_active_loadings(db: Session = Depends(get_db)):
    """
    Return cargos that have at least one per-port operation in Loading or Completed Loading,
    regardless of month/year. Excludes cargos that have completed their lifecycle.
    """
    try:
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        ).join(models.CargoPortOperation).filter(
            models.CargoPortOperation.status.in_([
                PortOperationStatus.LOADING.value,
                PortOperationStatus.COMPLETED_LOADING.value
            ])
        ).filter(
            # Exclude completed cargos (both Completed Loading and Discharge Complete)
            models.Cargo.status.notin_([CargoStatus.COMPLETED_LOADING, CargoStatus.DISCHARGE_COMPLETE])
        ).distinct(models.Cargo.id)

        cargos = query.all()

        # Note: Port operations are now the source of truth (normalized)
        # No backfill needed
        
        return [_cargo_to_schema(c, db) for c in cargos]
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_active_loadings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading active loadings")


@router.get("/in-road-cif", response_model=List[schemas.Cargo])
def read_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that completed loading but not discharge"""
    try:
        from sqlalchemy import and_
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        ).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.discharge_completion_time.is_(None),
            models.Cargo.status == CargoStatus.COMPLETED_LOADING,
        ))
        cargos = query.all()
        logger.debug(f"In-Road CIF query found {len(cargos)} cargos")
        return [_cargo_to_schema(c, db) for c in cargos]
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_in_road_cif: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading in-road CIF cargos")


@router.get("/completed-in-road-cif", response_model=List[schemas.Cargo])
def read_completed_in_road_cif(db: Session = Depends(get_db)):
    """Get CIF cargos that have Discharge Complete status"""
    try:
        from sqlalchemy import and_
        from sqlalchemy.orm import joinedload
        query = db.query(models.Cargo).options(
            joinedload(models.Cargo.product),
            joinedload(models.Cargo.inspector),
            joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
        ).filter(and_(
            models.Cargo.contract_type == ContractType.CIF,
            models.Cargo.status == CargoStatus.DISCHARGE_COMPLETE,
        ))
        cargos = query.all()
        return [_cargo_to_schema(c, db) for c in cargos]
    except SQLAlchemyError as e:
        logger.error(f"Database error in read_completed_in_road_cif: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error loading completed in-road CIF cargos")


@router.get("/{cargo_id}", response_model=schemas.Cargo)
def read_cargo(cargo_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    cargo = db.query(models.Cargo).options(
        joinedload(models.Cargo.product),
        joinedload(models.Cargo.inspector),
        joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
    ).filter(models.Cargo.id == cargo_id).first()
    if cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))
    return _cargo_to_schema(cargo, db)


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
    
    # Validate port code against database (normalized)
    load_port = get_load_port_by_code(db, port_code)
    if not load_port:
        # Fallback to hardcoded validation for error message
        raise to_http_exception(invalid_load_port(port_code, list(SUPPORTED_LOAD_PORTS)))

    # Lock the cargo row to prevent concurrent modifications
    # Note: Can't use joinedload with FOR UPDATE, so we do separate queries
    cargo = db.query(models.Cargo).filter(
        models.Cargo.id == cargo_id
    ).with_for_update().first()
    if cargo is None:
        raise to_http_exception(cargo_not_found(cargo_id))

    update_data = op.model_dump(exclude_unset=True) if hasattr(op, "model_dump") else op.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        if update_data["status"] not in PORT_OP_ALLOWED_STATUSES:
            raise to_http_exception(invalid_status(update_data["status"], list(PORT_OP_ALLOWED_STATUSES)))

    # Find existing port operation by load_port_id
    db_op = db.query(models.CargoPortOperation).filter(
        models.CargoPortOperation.cargo_id == cargo_id,
        models.CargoPortOperation.load_port_id == load_port.id
    ).with_for_update().first()

    if not db_op:
        db_op = models.CargoPortOperation(
            cargo_id=cargo_id, 
            load_port_id=load_port.id,  # Normalized FK
            status=PortOperationStatus.PLANNED.value
        )
        db.add(db_op)
        db.flush()

    for field, value in update_data.items():
        if hasattr(db_op, field):
            setattr(db_op, field, value)

    # Reload port operations for status recomputation
    from sqlalchemy.orm import joinedload
    cargo = db.query(models.Cargo).options(
        joinedload(models.Cargo.port_operations).joinedload(models.CargoPortOperation.load_port)
    ).filter(models.Cargo.id == cargo_id).first()
    
    # Recompute cargo status based on per-port status
    _recompute_cargo_status_from_port_ops(db, cargo)
    
    # Increment cargo version since its state changed
    cargo.version = (cargo.version or 1) + 1
    
    db.commit()
    db.refresh(db_op)
    db.refresh(cargo)  # Refresh cargo to get updated status
    
    # Load the load_port relationship for the response
    db_op = db.query(models.CargoPortOperation).options(
        joinedload(models.CargoPortOperation.load_port)
    ).filter(models.CargoPortOperation.id == db_op.id).first()
    
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
    
    # Return dict with port_code for API compatibility
    return {
        "id": db_op.id,
        "cargo_id": db_op.cargo_id,
        "port_code": db_op.load_port.code if db_op.load_port else port_code,
        "status": db_op.status,
        "eta": db_op.eta,
        "berthed": db_op.berthed,
        "commenced": db_op.commenced,
        "etc": db_op.etc,
        "notes": db_op.notes,
        "created_at": db_op.created_at,
        "updated_at": db_op.updated_at,
    }


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
    
    # Validate and convert lc_status - enum column handles conversion automatically
    if 'lc_status' in update_data and update_data['lc_status'] is not None:
        lc_status_value = update_data['lc_status']
        if lc_status_value == '':
            update_data['lc_status'] = None
        elif isinstance(lc_status_value, str):
            # Validate the string value
            valid_values = [e.value for e in LCStatus]
            if lc_status_value not in valid_values:
                raise to_http_exception(invalid_status(lc_status_value, valid_values))
            # Convert string to enum for proper storage
            update_data['lc_status'] = LCStatus(lc_status_value)
    
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

        # Get current ports from port_operations or from incoming update
        intended_load_ports = _coerce_load_ports_to_str(update_data.get("load_ports"))
        if intended_load_ports:
            selected_ports = _parse_load_ports_input(intended_load_ports)
        else:
            # Get current ports from existing port_operations
            selected_ports = [op.load_port.code for op in (db_cargo.port_operations or []) if op.load_port]

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
                db_cargo.lc_status = value
            elif isinstance(value, str):
                # Convert string to enum
                db_cargo.lc_status = LCStatus(value)
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
        elif field == 'inspector_name':
            # Convert inspector_name to inspector_id (normalized)
            try:
                old_inspector_name = db_cargo.get_inspector_name()
                new_inspector_id = _get_inspector_id_by_name(db, value)
                db_cargo.inspector_id = new_inspector_id
                new_inspector_name = db_cargo.get_inspector_name() if new_inspector_id else value
                if old_inspector_name != new_inspector_name:
                    log_cargo_action(
                        db=db,
                        action='UPDATE',
                        cargo=db_cargo,
                        field_name='inspector_name',
                        old_value=old_inspector_name,
                        new_value=new_inspector_name
                    )
            except Exception as e:
                logger.error(f"Failed to set inspector_name: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Error updating inspector_name")
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

    # Keep per-port operations aligned when load_ports changes (normalized)
    if 'load_ports' in update_data:
        port_codes = _parse_load_ports_input(update_data['load_ports'])
        _sync_port_operations_normalized(db, db_cargo, port_codes)

    # If user sets cargo to "Planned", reset all port operations to "Planned"
    try:
        if 'status' in update_data and db_cargo.status == CargoStatus.PLANNED:
            for op in getattr(db_cargo, "port_operations", []) or []:
                if op.status in [PortOperationStatus.LOADING.value, PortOperationStatus.COMPLETED_LOADING.value]:
                    op.status = PortOperationStatus.PLANNED.value
    except Exception:
        pass
    
    # If user sets cargo to "Loading", move all selected port operations into "Loading"
    try:
        if 'status' in update_data and db_cargo.status == CargoStatus.LOADING:
            for op in getattr(db_cargo, "port_operations", []) or []:
                if op.status == PortOperationStatus.PLANNED.value:
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
            cargo_data=_cargo_to_broadcast_dict(db_cargo, db),
            user_id=user_id,
            user_initials=user_initials
        )
        logger.info(f"[BROADCAST] Completed broadcast for cargo {db_cargo.id} (success={broadcast_success}, failures={broadcast_failures})")
    except Exception as e:
        # Don't fail the request if broadcast fails
        logger.error(f"Failed to broadcast cargo update: {e}", exc_info=True)
        broadcast_failures = 1
    
    # Convert to response with broadcast status using helper
    response_data = _cargo_to_schema(db_cargo, db)
    response_data["broadcast_success"] = broadcast_success
    response_data["broadcast_failures"] = broadcast_failures
    return response_data


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
        
        # Validate and convert lc_status - enum column handles conversion automatically
        if 'lc_status' in update_data and update_data['lc_status'] is not None:
            lc_status_value = update_data['lc_status']
            if lc_status_value == '':
                update_data['lc_status'] = None
            elif isinstance(lc_status_value, str):
                valid_values = [e.value for e in LCStatus]
                if lc_status_value not in valid_values:
                    raise to_http_exception(invalid_status(lc_status_value, valid_values))
                update_data['lc_status'] = LCStatus(lc_status_value)
        
        # Update all cargos in the group atomically
        updated_cargos = []
        for cargo in cargos:
            for field, value in update_data.items():
                # Skip load_ports - it's handled via port_operations now
                if field == 'load_ports':
                    continue
                if hasattr(cargo, field):
                    setattr(cargo, field, value)
            
            # Sync port operations if load_ports changed (normalized)
            if 'load_ports' in update_data:
                port_codes = _parse_load_ports_input(update_data['load_ports'])
                _sync_port_operations_normalized(db, cargo, port_codes)
                
                if cargo.status in {CargoStatus.PLANNED, CargoStatus.LOADING, CargoStatus.COMPLETED_LOADING}:
                    _recompute_cargo_status_from_port_ops(db, cargo)
            
            # If status changed to Planned, reset all port operations to Planned
            if 'status' in update_data and update_data['status'] == CargoStatus.PLANNED:
                ops = getattr(cargo, "port_operations", None)
                if ops:
                    for op in ops:
                        if op.status in [PortOperationStatus.LOADING.value, PortOperationStatus.COMPLETED_LOADING.value]:
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
                            op.status = PortOperationStatus.COMPLETED_LOADING.value
            
            # Increment version for optimistic locking
            cargo.version = (cargo.version or 1) + 1
            
            # Get product_name from relationship for response
            product_name = cargo.product.name if cargo.product else None
            
            updated_cargos.append({
                "id": cargo.id,
                "cargo_id": cargo.cargo_id,
                "product_name": product_name,
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


# =============================================================================
# CROSS-CONTRACT COMBI ENDPOINTS
# =============================================================================

@router.post("/cross-contract-combi", response_model=schemas.CrossContractCombiResponse)
async def create_cross_contract_combi(
    combi_data: schemas.CrossContractCombiCreate,
    db: Session = Depends(get_db)
):
    """
    Create a cross-contract combi cargo - multiple products from different contracts
    sharing the same vessel, load ports, and timing.
    
    Validates:
    - All contracts belong to the same customer
    - All contracts are the same type (FOB or CIF)
    - All monthly plans are for the same month/year
    """
    try:
        # Collect all contract IDs and monthly plan IDs
        contract_ids = set(item.contract_id for item in combi_data.cargo_items)
        monthly_plan_ids = [item.monthly_plan_id for item in combi_data.cargo_items]
        
        # Fetch all contracts
        contracts = db.query(models.Contract).filter(
            models.Contract.id.in_(contract_ids)
        ).all()
        
        if len(contracts) != len(contract_ids):
            found_ids = {c.id for c in contracts}
            missing = contract_ids - found_ids
            raise HTTPException(status_code=404, detail=f"Contracts not found: {missing}")
        
        # Validate all contracts belong to the same customer
        customer_ids = set(c.customer_id for c in contracts)
        if len(customer_ids) > 1:
            raise HTTPException(
                status_code=400, 
                detail="Cross-contract combi requires all contracts to belong to the same customer"
            )
        
        # Validate customer_id matches
        actual_customer_id = list(customer_ids)[0]
        if actual_customer_id != combi_data.customer_id:
            raise HTTPException(
                status_code=400,
                detail=f"Customer ID mismatch. Contracts belong to customer {actual_customer_id}"
            )
        
        # Validate all contracts are the same type
        contract_types = set(c.contract_type for c in contracts)
        if len(contract_types) > 1:
            raise HTTPException(
                status_code=400,
                detail="Cross-contract combi requires all contracts to be the same type (all FOB or all CIF)"
            )
        
        contract_type = list(contract_types)[0]
        
        # Fetch all monthly plans
        monthly_plans = db.query(models.MonthlyPlan).filter(
            models.MonthlyPlan.id.in_(monthly_plan_ids)
        ).all()
        
        if len(monthly_plans) != len(monthly_plan_ids):
            found_ids = {mp.id for mp in monthly_plans}
            missing = set(monthly_plan_ids) - found_ids
            raise HTTPException(status_code=404, detail=f"Monthly plans not found: {missing}")
        
        # Validate all monthly plans are for the same month/year
        month_years = set((mp.month, mp.year) for mp in monthly_plans)
        if len(month_years) > 1:
            raise HTTPException(
                status_code=400,
                detail="Cross-contract combi requires all monthly plans to be for the same month/year"
            )
        
        # Create a map of monthly_plan_id to contract_id for validation
        mp_to_contract = {mp.id: mp.contract_id for mp in monthly_plans}
        
        # Validate each cargo item's monthly plan belongs to its specified contract
        for item in combi_data.cargo_items:
            if mp_to_contract.get(item.monthly_plan_id) != item.contract_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Monthly plan {item.monthly_plan_id} does not belong to contract {item.contract_id}"
                )
        
        # Generate a shared combi_group_id
        combi_group_id = str(uuid.uuid4())
        
        # Create cargos for each item
        created_cargos = []
        contracts_map = {c.id: c for c in contracts}
        monthly_plans_map = {mp.id: mp for mp in monthly_plans}
        
        for item in combi_data.cargo_items:
            contract = contracts_map[item.contract_id]
            monthly_plan = monthly_plans_map[item.monthly_plan_id]
            
            # Generate cargo_id
            cargo_id = f"CARGO-{uuid.uuid4().hex[:8].upper()}"
            
            # Get product_id from product_name
            product_id = get_product_id_by_name(db, item.product_name)
            if not product_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Product '{item.product_name}' not found in products database"
                )
            
            # Get inspector_id from inspector_name (normalized)
            inspector_id = _get_inspector_id_by_name(db, combi_data.inspector_name)
            
            db_cargo = models.Cargo(
                cargo_id=cargo_id,
                vessel_name=combi_data.vessel_name,
                customer_id=combi_data.customer_id,
                product_id=product_id,  # Normalized product reference
                contract_id=item.contract_id,
                contract_type=contract_type,
                # NOTE: load_ports column removed - now derived from port_operations
                inspector_id=inspector_id,  # Normalized inspector reference
                cargo_quantity=item.cargo_quantity,
                laycan_window=combi_data.laycan_window,
                notes=combi_data.notes,
                monthly_plan_id=item.monthly_plan_id,
                combi_group_id=combi_group_id,
                status=CargoStatus.PLANNED,
            )
            
            db.add(db_cargo)
            db.flush()
            
            # Create port operations (normalized)
            port_codes = _parse_load_ports_input(combi_data.load_ports)
            _sync_port_operations_normalized(db, db_cargo, port_codes)
            
            # Log the creation
            log_cargo_action(db=db, action='CREATE', cargo=db_cargo)
            
            created_cargos.append(db_cargo)
        
        db.commit()
        
        # Refresh all cargos to get port_operations
        for cargo in created_cargos:
            db.refresh(cargo)
        
        logger.info(f"Created cross-contract combi with {len(created_cargos)} cargos, combi_group_id={combi_group_id}")
        
        return schemas.CrossContractCombiResponse(
            combi_group_id=combi_group_id,
            cargos=[schemas.Cargo.model_validate(c) for c in created_cargos],
            message=f"Cross-contract combi created successfully with {len(created_cargos)} cargos"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating cross-contract combi: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating cross-contract combi: {str(e)}")


@router.delete("/combi-group/{combi_group_id}")
async def delete_combi_group(
    combi_group_id: str,
    permanent: bool = Query(False, description="If true, permanently delete. Otherwise, move to recycle bin."),
    reason: Optional[str] = Query(None, description="Optional reason for deletion"),
    user_id: Optional[int] = Query(None, description="User ID for audit logging"),
    user_initials: Optional[str] = Query(None, description="User initials for audit logging"),
    db: Session = Depends(get_db)
):
    """
    Delete an entire combi group (all cargos sharing the same combi_group_id).
    This is used for both same-contract and cross-contract combis.
    
    Returns information about what was deleted.
    """
    try:
        # Find all cargos in the combi group
        cargos = db.query(models.Cargo).filter(
            models.Cargo.combi_group_id == combi_group_id
        ).all()
        
        if not cargos:
            raise to_http_exception(combi_group_not_found(combi_group_id))
        
        # Collect info for response
        deleted_cargo_ids = []
        contract_ids = set()
        
        for cargo in cargos:
            deleted_cargo_ids.append(cargo.cargo_id)
            contract_ids.add(cargo.contract_id)
            
            # Log the deletion
            log_cargo_action(
                db=db,
                action='DELETE',
                cargo=cargo,
                old_monthly_plan_id=cargo.monthly_plan_id
            )
            db.flush()
            
            # Preserve audit log history
            db.query(models.CargoAuditLog).filter(
                models.CargoAuditLog.cargo_id == cargo.id
            ).update(
                {models.CargoAuditLog.cargo_id: None, models.CargoAuditLog.cargo_db_id: cargo.id},
                synchronize_session=False
            )
            
            if permanent:
                db.delete(cargo)
            else:
                version_service.soft_delete(
                    db, "cargo", cargo,
                    user_id=user_id,
                    user_initials=user_initials,
                    reason=reason
                )
        
        db.commit()
        
        is_cross_contract = len(contract_ids) > 1
        combi_type = "cross-contract" if is_cross_contract else "same-contract"
        action = "permanently deleted" if permanent else "moved to recycle bin"
        
        logger.info(f"Deleted {combi_type} combi group {combi_group_id}: {len(cargos)} cargos {action}")
        
        return {
            "message": f"{combi_type.title()} combi group {action}",
            "combi_group_id": combi_group_id,
            "deleted_cargo_ids": deleted_cargo_ids,
            "affected_contracts": list(contract_ids),
            "is_cross_contract": is_cross_contract,
            "cargo_count": len(cargos)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting combi group {combi_group_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting combi group: {str(e)}")
