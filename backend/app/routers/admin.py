"""
Admin API endpoints for database management and monitoring.
Provides bird's eye view of all data with editing capabilities.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List, Optional, Any
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)

from app.database import get_db
from app.auth import require_auth
from app import models
from app.models import (
    Customer, Contract, QuarterlyPlan, MonthlyPlan, Cargo,
    CargoAuditLog, MonthlyPlanAuditLog, QuarterlyPlanAuditLog, ContractAuditLog,
    GeneralAuditLog
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# =============================================================================
# DATABASE OVERVIEW / STATS
# =============================================================================

@router.get("/stats")
def get_database_stats(db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Get overview statistics for all tables."""
    
    # Count records in each table
    customers_count = db.query(func.count(Customer.id)).scalar()
    contracts_count = db.query(func.count(Contract.id)).scalar()
    quarterly_plans_count = db.query(func.count(QuarterlyPlan.id)).scalar()
    monthly_plans_count = db.query(func.count(MonthlyPlan.id)).scalar()
    cargos_count = db.query(func.count(Cargo.id)).scalar()
    
    # Audit log counts
    cargo_logs_count = db.query(func.count(CargoAuditLog.id)).scalar()
    monthly_plan_logs_count = db.query(func.count(MonthlyPlanAuditLog.id)).scalar()
    quarterly_plan_logs_count = db.query(func.count(QuarterlyPlanAuditLog.id)).scalar()
    contract_logs_count = db.query(func.count(ContractAuditLog.id)).scalar()
    
    # Data integrity checks
    issues = []
    
    # Check for orphaned quarterly plans (no contract)
    orphaned_qp = db.query(QuarterlyPlan).filter(
        ~QuarterlyPlan.contract_id.in_(db.query(Contract.id))
    ).count()
    if orphaned_qp > 0:
        issues.append({"type": "orphaned_quarterly_plans", "count": orphaned_qp, "severity": "warning"})
    
    # Check for orphaned monthly plans (no quarterly plan)
    orphaned_mp = db.query(MonthlyPlan).filter(
        ~MonthlyPlan.quarterly_plan_id.in_(db.query(QuarterlyPlan.id))
    ).count()
    if orphaned_mp > 0:
        issues.append({"type": "orphaned_monthly_plans", "count": orphaned_mp, "severity": "warning"})
    
    # Check for orphaned cargos (no monthly plan)
    orphaned_cargos = db.query(Cargo).filter(
        ~Cargo.monthly_plan_id.in_(db.query(MonthlyPlan.id))
    ).count()
    if orphaned_cargos > 0:
        issues.append({"type": "orphaned_cargos", "count": orphaned_cargos, "severity": "error"})
    
    # Check for monthly plans with zero quantity
    zero_qty_mp = db.query(MonthlyPlan).filter(MonthlyPlan.month_quantity == 0).count()
    if zero_qty_mp > 0:
        issues.append({"type": "zero_quantity_monthly_plans", "count": zero_qty_mp, "severity": "info"})
    
    # Check for monthly plans with authority topups
    monthly_plans_with_topups = db.query(MonthlyPlan).filter(
        MonthlyPlan.authority_topup_quantity > 0
    ).count()

    # Count distinct contracts that have at least one monthly plan with authority topup
    contracts_with_topups = db.query(func.count(func.distinct(MonthlyPlan.contract_id))).filter(
        MonthlyPlan.authority_topup_quantity > 0
    ).scalar() or 0
    
    return {
        "counts": {
            "customers": customers_count,
            "contracts": contracts_count,
            "quarterly_plans": quarterly_plans_count,
            "monthly_plans": monthly_plans_count,
            "cargos": cargos_count,
            "audit_logs": {
                "cargo": cargo_logs_count,
                "monthly_plan": monthly_plan_logs_count,
                "quarterly_plan": quarterly_plan_logs_count,
                "contract": contract_logs_count,
                "total": cargo_logs_count + monthly_plan_logs_count + quarterly_plan_logs_count + contract_logs_count
            }
        },
        "monthly_plans_with_topups": monthly_plans_with_topups,
        "contracts_with_topups": contracts_with_topups,
        "issues": issues,
        "last_updated": datetime.utcnow().isoformat()
    }


@router.get("/analytics")
def get_analytics(db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Get analytics data for inspector usage and port statistics."""
    
    # Inspector usage statistics (from normalized inspector_id FK)
    inspector_stats = []
    try:
        from app.models import Inspector
        inspector_query = db.query(
            Inspector.name,
            func.count(Cargo.id).label('cargo_count')
        ).join(
            Cargo, Cargo.inspector_id == Inspector.id
        ).group_by(Inspector.id, Inspector.name).order_by(
            func.count(Cargo.id).desc()
        ).all()
        
        for row in inspector_query:
            inspector_stats.append({
                "name": row.name,
                "cargo_count": row.cargo_count
            })
    except Exception as e:
        logger.error(f"Error getting inspector stats: {e}")
    
    # Port usage statistics (from normalized cargo_port_operations table)
    port_stats = []
    try:
        from app.models import CargoPortOperation, LoadPort
        # Join cargo_port_operations with load_ports to get counts
        port_query = db.query(
            LoadPort.code,
            LoadPort.name,
            func.count(CargoPortOperation.id).label('cargo_count')
        ).join(
            CargoPortOperation, CargoPortOperation.load_port_id == LoadPort.id
        ).group_by(LoadPort.id, LoadPort.code, LoadPort.name).order_by(
            func.count(CargoPortOperation.id).desc()
        ).all()
        
        for row in port_query:
            port_stats.append({
                "port": row.code,
                "port_name": row.name,
                "cargo_count": row.cargo_count
            })
    except Exception as e:
        logger.error(f"Error getting port stats: {e}")
    
    # Monthly cargo trends (last 12 months)
    monthly_trends = []
    try:
        from datetime import date
        from dateutil.relativedelta import relativedelta
        
        today = date.today()
        for i in range(11, -1, -1):
            month_date = today - relativedelta(months=i)
            month = month_date.month
            year = month_date.year
            
            # Count cargos created in this month
            cargo_count = db.query(func.count(Cargo.id)).filter(
                func.extract('month', Cargo.created_at) == month,
                func.extract('year', Cargo.created_at) == year
            ).scalar() or 0
            
            monthly_trends.append({
                "month": month,
                "year": year,
                "label": month_date.strftime("%b %Y"),
                "cargo_count": cargo_count
            })
    except Exception as e:
        logger.error(f"Error getting monthly trends: {e}")
    
    # Customer cargo distribution
    customer_stats = []
    try:
        # Join cargos -> monthly_plans -> quarterly_plans -> contracts -> customers
        customer_query = db.execute(text('''
            SELECT 
                cu.name as customer_name,
                COUNT(DISTINCT ca.id) as cargo_count
            FROM cargos ca
            JOIN monthly_plans mp ON ca.monthly_plan_id = mp.id
            JOIN quarterly_plans qp ON mp.quarterly_plan_id = qp.id
            JOIN contracts co ON qp.contract_id = co.id
            JOIN customers cu ON co.customer_id = cu.id
            GROUP BY cu.id, cu.name
            ORDER BY cargo_count DESC
        ''')).fetchall()
        
        for row in customer_query:
            customer_stats.append({
                "customer": row[0],
                "cargo_count": row[1]
            })
    except Exception as e:
        logger.error(f"Error getting customer stats: {e}")
    
    # Cargo status distribution
    status_stats = []
    try:
        status_query = db.query(
            Cargo.status,
            func.count(Cargo.id).label('count')
        ).group_by(Cargo.status).all()
        
        for row in status_query:
            status_stats.append({
                "status": row.status.value if row.status else "Unknown",
                "count": row.count
            })
    except Exception as e:
        logger.error(f"Error getting status stats: {e}")
    
    # Product volume analytics - COMPLETED cargos only
    # Status enum names: COMPLETED_LOADING, DISCHARGE_COMPLETE are considered completed
    product_stats = []
    try:
        # Get completed cargo quantities per product using normalized product_id
        completed_query = db.execute(text('''
            SELECT 
                p.name as product_name,
                SUM(ca.cargo_quantity) as completed_quantity,
                COUNT(ca.id) as cargo_count
            FROM cargos ca
            JOIN products p ON ca.product_id = p.id
            WHERE ca.status IN ('COMPLETED_LOADING', 'DISCHARGE_COMPLETE')
            GROUP BY p.name
            ORDER BY completed_quantity DESC
        ''')).fetchall()
        
        for row in completed_query:
            product_stats.append({
                "product": row[0],
                "completed_quantity": float(row[1] or 0),
                "cargo_count": row[2]
            })
        
    except Exception as e:
        logger.error(f"Error getting product stats: {e}")
    
    return {
        "inspector_stats": inspector_stats,
        "port_stats": port_stats,
        "monthly_trends": monthly_trends,
        "customer_stats": customer_stats,
        "status_stats": status_stats,
        "product_stats": product_stats,
        "last_updated": datetime.utcnow().isoformat()
    }


# =============================================================================
# CONTRACTS ADMIN
# =============================================================================

@router.get("/contracts")
def get_all_contracts_admin(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all contracts with full details for admin view."""
    from sqlalchemy.orm import joinedload
    from app.models import ContractProduct
    
    contracts = db.query(Contract).options(
        joinedload(Contract.contract_products).joinedload(ContractProduct.product)
    ).offset(skip).limit(limit).all()
    total = db.query(func.count(Contract.id)).scalar()
    
    result = []
    for c in contracts:
        customer = db.query(Customer).filter(Customer.id == c.customer_id).first()
        products = c.get_products_list()
        
        result.append({
            "id": c.id,
            "contract_id": c.contract_id,
            "contract_number": c.contract_number,
            "contract_type": c.contract_type.value if c.contract_type else None,
            "payment_method": c.payment_method.value if c.payment_method else None,
            "start_period": c.start_period.isoformat() if c.start_period else None,
            "end_period": c.end_period.isoformat() if c.end_period else None,
            "products": products,
            "customer_id": c.customer_id,
            "customer_name": customer.name if customer else "Unknown",
            "remarks": c.remarks,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    
    return {"items": result, "total": total}


@router.put("/contracts/{contract_id}")
def update_contract_admin(
    contract_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """Update any contract field directly (admin only)."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Prevent editing system-generated IDs
    protected_fields = ["id", "contract_id", "created_at", "updated_at"]
    for field in protected_fields:
        if field in data:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify system-generated field: {field}"
            )
    
    # Update allowed fields
    allowed_fields = [
        "contract_number", "contract_type", "payment_method", 
        "start_period", "end_period", "products",
        "remarks", "discharge_ranges", "additives_required",
        "fax_received", "concluded_memo_received"
    ]
    
    for field in allowed_fields:
        if field in data:
            value = data[field]
            # Handle JSON fields
            if field in ["products"] and isinstance(value, (list, dict)):
                value = json.dumps(value)
            # Handle date fields
            if field in ["start_period", "end_period"] and value:
                from datetime import date
                if isinstance(value, str):
                    value = date.fromisoformat(value)
            setattr(contract, field, value)
    
    db.commit()
    db.refresh(contract)
    
    return {"success": True, "message": "Contract updated"}


@router.delete("/contracts/{contract_id}")
def delete_contract_admin(contract_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete a contract and all related data (admin only)."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    db.delete(contract)
    db.commit()
    
    return {"success": True, "message": "Contract deleted"}


# =============================================================================
# QUARTERLY PLANS ADMIN
# =============================================================================

@router.get("/quarterly-plans")
def get_all_quarterly_plans_admin(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all quarterly plans with full details for admin view."""
    from sqlalchemy.orm import joinedload
    plans = db.query(QuarterlyPlan).options(
        joinedload(QuarterlyPlan.product)
    ).offset(skip).limit(limit).all()
    total = db.query(func.count(QuarterlyPlan.id)).scalar()
    
    result = []
    for qp in plans:
        contract = db.query(Contract).filter(Contract.id == qp.contract_id).first()
        customer = None
        if contract:
            customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
        
        product_name = qp.product.name if qp.product else None
        result.append({
            "id": qp.id,
            "product_name": product_name,
            "q1_quantity": qp.q1_quantity,
            "q2_quantity": qp.q2_quantity,
            "q3_quantity": qp.q3_quantity,
            "q4_quantity": qp.q4_quantity,
            "q1_topup": getattr(qp, 'q1_topup', 0) or 0,
            "q2_topup": getattr(qp, 'q2_topup', 0) or 0,
            "q3_topup": getattr(qp, 'q3_topup', 0) or 0,
            "q4_topup": getattr(qp, 'q4_topup', 0) or 0,
            "contract_id": qp.contract_id,
            "contract_number": contract.contract_number if contract else "Unknown",
            "customer_name": customer.name if customer else "Unknown",
            "created_at": qp.created_at.isoformat() if qp.created_at else None,
            "updated_at": qp.updated_at.isoformat() if qp.updated_at else None,
        })
    
    return {"items": result, "total": total}


@router.put("/quarterly-plans/{plan_id}")
def update_quarterly_plan_admin(
    plan_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """Update any quarterly plan field directly (admin only)."""
    plan = db.query(QuarterlyPlan).filter(QuarterlyPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
    # Prevent editing system-generated IDs
    protected_fields = ["id", "created_at", "updated_at"]
    for field in protected_fields:
        if field in data:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify system-generated field: {field}"
            )
    
    allowed_fields = [
        "product_name", "q1_quantity", "q2_quantity", "q3_quantity", "q4_quantity",
        "q1_topup", "q2_topup", "q3_topup", "q4_topup", "contract_id"
    ]
    
    for field in allowed_fields:
        if field in data:
            setattr(plan, field, data[field])
    
    db.commit()
    db.refresh(plan)
    
    return {"success": True, "message": "Quarterly plan updated"}


@router.delete("/quarterly-plans/{plan_id}")
def delete_quarterly_plan_admin(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete a quarterly plan and all related monthly plans (admin only)."""
    plan = db.query(QuarterlyPlan).filter(QuarterlyPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Quarterly plan not found")
    
    db.delete(plan)
    db.commit()
    
    return {"success": True, "message": "Quarterly plan deleted"}


# =============================================================================
# MONTHLY PLANS ADMIN
# =============================================================================

@router.get("/monthly-plans")
def get_all_monthly_plans_admin(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all monthly plans with full details for admin view."""
    from sqlalchemy.orm import joinedload
    plans = db.query(MonthlyPlan).options(
        joinedload(MonthlyPlan.product)
    ).offset(skip).limit(limit).all()
    total = db.query(func.count(MonthlyPlan.id)).scalar()
    
    result = []
    for mp in plans:
        qp = db.query(QuarterlyPlan).options(
            joinedload(QuarterlyPlan.product)
        ).filter(QuarterlyPlan.id == mp.quarterly_plan_id).first()
        contract = None
        customer = None
        if qp:
            contract = db.query(Contract).filter(Contract.id == qp.contract_id).first()
            if contract:
                customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
        
        # Get product_name from monthly plan's product, or fall back to quarterly plan's product
        product_name = mp.product.name if mp.product else (qp.product.name if qp and qp.product else "Unknown")
        
        result.append({
            "id": mp.id,
            "month": mp.month,
            "year": mp.year,
            "month_quantity": mp.month_quantity,
            "number_of_liftings": mp.number_of_liftings,
            "laycan_5_days": mp.laycan_5_days,
            "laycan_2_days": mp.laycan_2_days,
            "laycan_2_days_remark": mp.laycan_2_days_remark,
            "loading_month": mp.loading_month,
            "loading_window": mp.loading_window,
            "delivery_month": mp.delivery_month,
            "delivery_window": mp.delivery_window,
            "combi_group_id": mp.combi_group_id,
            "authority_topup_quantity": mp.authority_topup_quantity or 0,
            "authority_topup_reference": mp.authority_topup_reference,
            "authority_topup_reason": mp.authority_topup_reason,
            "authority_topup_date": mp.authority_topup_date.isoformat() if mp.authority_topup_date else None,
            "quarterly_plan_id": mp.quarterly_plan_id,
            "product_name": product_name,
            "contract_id": qp.contract_id if qp else None,
            "contract_number": contract.contract_number if contract else "Unknown",
            "customer_name": customer.name if customer else "Unknown",
            "created_at": mp.created_at.isoformat() if mp.created_at else None,
            "updated_at": mp.updated_at.isoformat() if mp.updated_at else None,
        })
    
    return {"items": result, "total": total}


@router.put("/monthly-plans/{plan_id}")
def update_monthly_plan_admin(
    plan_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """Update any monthly plan field directly (admin only)."""
    plan = db.query(MonthlyPlan).filter(MonthlyPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    
    # Prevent editing system-generated IDs
    protected_fields = ["id", "created_at", "updated_at"]
    for field in protected_fields:
        if field in data:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify system-generated field: {field}"
            )
    
    allowed_fields = [
        "month", "year", "month_quantity", "number_of_liftings",
        "laycan_5_days", "laycan_2_days", "laycan_2_days_remark",
        "loading_month", "loading_window", "delivery_month", "delivery_window",
        "delivery_window_remark", "combi_group_id", "quarterly_plan_id",
        "authority_topup_quantity", "authority_topup_reference",
        "authority_topup_reason", "authority_topup_date"
    ]
    
    for field in allowed_fields:
        if field in data:
            value = data[field]
            # Handle date fields
            if field == "authority_topup_date" and value:
                from datetime import date
                if isinstance(value, str):
                    value = date.fromisoformat(value)
            setattr(plan, field, value)
    
    db.commit()
    db.refresh(plan)
    
    return {"success": True, "message": "Monthly plan updated"}


@router.delete("/monthly-plans/{plan_id}")
def delete_monthly_plan_admin(plan_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete a monthly plan and all related cargos (admin only)."""
    plan = db.query(MonthlyPlan).filter(MonthlyPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Monthly plan not found")
    
    db.delete(plan)
    db.commit()
    
    return {"success": True, "message": "Monthly plan deleted"}


# =============================================================================
# CARGOS ADMIN
# =============================================================================

@router.get("/cargos")
def get_all_cargos_admin(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all cargos with full details for admin view."""
    from sqlalchemy.orm import joinedload
    from app.models import Inspector
    cargos = db.query(Cargo).options(
        joinedload(Cargo.product),
        joinedload(Cargo.inspector),
        joinedload(Cargo.port_operations)
    ).offset(skip).limit(limit).all()
    total = db.query(func.count(Cargo.id)).scalar()
    
    result = []
    for c in cargos:
        mp = db.query(MonthlyPlan).filter(MonthlyPlan.id == c.monthly_plan_id).first()
        contract = db.query(Contract).filter(Contract.id == c.contract_id).first()
        customer = db.query(Customer).filter(Customer.id == c.customer_id).first()
        
        product_name = c.product.name if c.product else "Unknown"
        
        # Compute load_ports from port_operations (normalized)
        load_ports_str = ""
        if c.port_operations:
            sorted_ops = sorted(c.port_operations, key=lambda op: (op.load_port.sort_order if op.load_port else 0, op.load_port_id))
            load_ports_str = ",".join(op.load_port.code for op in sorted_ops if op.load_port)
        
        result.append({
            "id": c.id,
            "cargo_id": c.cargo_id,
            "vessel_name": c.vessel_name,
            "product_name": product_name,
            "cargo_quantity": c.cargo_quantity,
            "status": c.status.value if c.status else None,
            "load_ports": load_ports_str,  # Computed from port_operations
            "laycan_window": c.laycan_window,
            "eta": c.eta,
            "berthed": c.berthed,
            "commenced": c.commenced,
            "etc": c.etc,
            "lc_status": c.lc_status,
            "combi_group_id": c.combi_group_id,
            "monthly_plan_id": c.monthly_plan_id,
            "monthly_plan_month": mp.month if mp else None,
            "monthly_plan_year": mp.year if mp else None,
            "contract_id": c.contract_id,
            "contract_number": contract.contract_number if contract else "Unknown",
            "contract_type": c.contract_type.value if c.contract_type else None,
            "customer_id": c.customer_id,
            "customer_name": customer.name if customer else "Unknown",
            "inspector_name": c.inspector.name if c.inspector else None,
            "notes": c.notes,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    
    return {"items": result, "total": total}


@router.put("/cargos/{cargo_id}")
def update_cargo_admin(
    cargo_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """Update any cargo field directly (admin only)."""
    from sqlalchemy.orm import joinedload
    from app.models import CargoPortOperation
    from app.config import get_load_port_by_code, PortOperationStatus
    
    cargo = db.query(Cargo).options(
        joinedload(Cargo.port_operations).joinedload(CargoPortOperation.load_port)
    ).filter(Cargo.id == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")
    
    # Prevent editing system-generated IDs
    protected_fields = ["id", "cargo_id", "created_at", "updated_at"]
    for field in protected_fields:
        if field in data:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify system-generated field: {field}"
            )
    
    allowed_fields = [
        "vessel_name", "product_name", "cargo_quantity", "status",
        "load_ports", "laycan_window", "eta", "berthed", "commenced", "etc",
        "lc_status", "combi_group_id", "inspector_name", "notes",
        "monthly_plan_id", "contract_id", "customer_id"
    ]
    
    for field in allowed_fields:
        if field in data:
            value = data[field]
            # Handle load_ports specially - update via port_operations
            if field == "load_ports":
                # Parse the load_ports string
                port_codes = []
                if value:
                    if isinstance(value, str):
                        port_codes = [p.strip().upper() for p in value.split(",") if p.strip()]
                    elif isinstance(value, list):
                        port_codes = [str(p).strip().upper() for p in value if str(p).strip()]
                
                # Build map of existing operations by port code
                existing_by_code = {}
                for op in (cargo.port_operations or []):
                    if op.load_port:
                        existing_by_code[op.load_port.code] = op
                
                # Create missing operations
                for code in port_codes:
                    if code not in existing_by_code:
                        load_port = get_load_port_by_code(db, code)
                        if load_port:
                            cargo.port_operations.append(
                                CargoPortOperation(
                                    load_port_id=load_port.id,
                                    status=PortOperationStatus.PLANNED.value
                                )
                            )
                
                # Remove operations for removed ports
                for code, op in existing_by_code.items():
                    if code not in port_codes:
                        db.delete(op)
                continue  # Skip setattr for load_ports
            
            # Handle inspector_name specially - convert to inspector_id
            if field == "inspector_name":
                from app.models import Inspector
                if value:
                    inspector = db.query(Inspector).filter(Inspector.name == value).first()
                    cargo.inspector_id = inspector.id if inspector else None
                else:
                    cargo.inspector_id = None
                continue  # Skip setattr for inspector_name
            
            # Handle enum fields
            if field == "status" and value:
                from app.models import CargoStatus
                if isinstance(value, str):
                    value = CargoStatus(value)
            setattr(cargo, field, value)
    
    db.commit()
    db.refresh(cargo)
    
    return {"success": True, "message": "Cargo updated"}


@router.delete("/cargos/{cargo_id}")
def delete_cargo_admin(cargo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete a cargo (admin only)."""
    cargo = db.query(Cargo).filter(Cargo.id == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")
    
    db.delete(cargo)
    db.commit()
    
    return {"success": True, "message": "Cargo deleted"}


# =============================================================================
# AUDIT LOGS
# =============================================================================

@router.get("/audit-logs")
def get_all_audit_logs(
    log_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get unified audit logs from all sources."""
    logs = []
    
    if not log_type or log_type == "cargo":
        cargo_logs = db.query(CargoAuditLog).order_by(CargoAuditLog.created_at.desc()).offset(skip).limit(limit).all()
        for log in cargo_logs:
            logs.append({
                "id": f"cargo-{log.id}",
                "type": "cargo",
                "entity_id": log.cargo_db_id or log.cargo_id,
                "entity_ref": log.cargo_cargo_id,
                "action": log.action,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "description": log.description,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_initials": log.user_initials,
            })
    
    if not log_type or log_type == "monthly_plan":
        mp_logs = db.query(MonthlyPlanAuditLog).order_by(MonthlyPlanAuditLog.created_at.desc()).offset(skip).limit(limit).all()
        for log in mp_logs:
            logs.append({
                "id": f"mp-{log.id}",
                "type": "monthly_plan",
                "entity_id": log.monthly_plan_db_id or log.monthly_plan_id,
                "entity_ref": f"{log.contract_number} - {log.month}/{log.year}" if log.contract_number else None,
                "action": log.action,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "description": log.description,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_initials": log.user_initials,
            })
    
    if not log_type or log_type == "quarterly_plan":
        qp_logs = db.query(QuarterlyPlanAuditLog).order_by(QuarterlyPlanAuditLog.created_at.desc()).offset(skip).limit(limit).all()
        for log in qp_logs:
            logs.append({
                "id": f"qp-{log.id}",
                "type": "quarterly_plan",
                "entity_id": log.quarterly_plan_db_id or log.quarterly_plan_id,
                "entity_ref": log.contract_number,
                "action": log.action,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "description": log.description,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_initials": log.user_initials,
            })
    
    if not log_type or log_type == "contract":
        contract_logs = db.query(ContractAuditLog).order_by(ContractAuditLog.created_at.desc()).offset(skip).limit(limit).all()
        for log in contract_logs:
            logs.append({
                "id": f"contract-{log.id}",
                "type": "contract",
                "entity_id": log.contract_db_id or log.contract_id,
                "entity_ref": log.contract_number,
                "action": log.action,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "description": log.description,
                "product_name": log.product_name,
                "topup_quantity": log.topup_quantity,
                "authority_reference": log.authority_reference,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_initials": log.user_initials,
            })
    
    # General audit logs (customers, products, load_ports, inspectors, users)
    general_types = ["customer", "product", "load_port", "inspector", "user"]
    if not log_type or log_type in general_types or log_type == "general":
        query = db.query(GeneralAuditLog).order_by(GeneralAuditLog.created_at.desc())
        if log_type and log_type in general_types:
            query = query.filter(GeneralAuditLog.entity_type == log_type.upper())
        general_logs = query.offset(skip).limit(limit).all()
        for log in general_logs:
            logs.append({
                "id": f"general-{log.id}",
                "type": log.entity_type.lower() if log.entity_type else "general",
                "entity_id": log.entity_id,
                "entity_ref": log.entity_name,
                "action": log.action,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "description": log.description,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_initials": log.user_initials,
            })
    
    # Sort all logs by created_at
    logs.sort(key=lambda x: x["created_at"] or "", reverse=True)
    
    return {"items": logs[:limit], "total": len(logs)}


# =============================================================================
# DATA INTEGRITY
# =============================================================================

@router.get("/integrity-check")
def check_data_integrity(db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Run comprehensive data integrity checks."""
    from sqlalchemy.orm import joinedload
    from app.models import ContractProduct
    
    issues = []
    
    # 1. Check for quantity mismatches between contract and quarterly plans
    contracts = db.query(Contract).options(
        joinedload(Contract.contract_products).joinedload(ContractProduct.product)
    ).all()
    for contract in contracts:
        products = contract.get_products_list()
        quarterly_plans = db.query(QuarterlyPlan).filter(QuarterlyPlan.contract_id == contract.id).all()
        
        for product in products:
            product_name = product.get("name")
            contract_total = product.get("total_quantity", 0) + product.get("optional_quantity", 0) + product.get("topup_quantity", 0)
            
            # Find matching quarterly plan using product_id
            product_id = product.get("product_id")
            qp = next((q for q in quarterly_plans if q.product_id == product_id), None)
            if qp:
                qp_total = (qp.q1_quantity or 0) + (qp.q2_quantity or 0) + (qp.q3_quantity or 0) + (qp.q4_quantity or 0)
                qp_topup = (qp.q1_topup or 0) + (qp.q2_topup or 0) + (qp.q3_topup or 0) + (qp.q4_topup or 0)
                qp_total += qp_topup
                
                if abs(contract_total - qp_total) > 0.01:  # Allow small floating point differences
                    issues.append({
                        "type": "quantity_mismatch",
                        "severity": "warning",
                        "entity": "contract_vs_quarterly",
                        "contract_id": contract.id,
                        "contract_number": contract.contract_number,
                        "product": product_name,
                        "contract_total": contract_total,
                        "quarterly_total": qp_total,
                        "difference": contract_total - qp_total
                    })
            elif contract_total > 0:
                issues.append({
                    "type": "missing_quarterly_plan",
                    "severity": "error",
                    "entity": "quarterly_plan",
                    "contract_id": contract.id,
                    "contract_number": contract.contract_number,
                    "product": product_name,
                    "message": f"No quarterly plan for {product_name} with contract quantity {contract_total}"
                })
    
    # 2. Check for quarterly vs monthly quantity mismatches
    quarterly_plans = db.query(QuarterlyPlan).options(
        joinedload(QuarterlyPlan.product)
    ).all()
    for qp in quarterly_plans:
        monthly_plans = db.query(MonthlyPlan).filter(MonthlyPlan.quarterly_plan_id == qp.id).all()
        
        # Group by quarter
        q_totals = {1: 0, 2: 0, 3: 0, 4: 0}
        for mp in monthly_plans:
            quarter = (mp.month - 1) // 3 + 1
            q_totals[quarter] += mp.month_quantity or 0
        
        # Compare
        qp_values = {
            1: (qp.q1_quantity or 0),
            2: (qp.q2_quantity or 0),
            3: (qp.q3_quantity or 0),
            4: (qp.q4_quantity or 0)
        }
        
        for q in range(1, 5):
            if abs(qp_values[q] - q_totals[q]) > 0.01:
                contract = db.query(Contract).filter(Contract.id == qp.contract_id).first()
                qp_product_name = qp.product.name if qp.product else "Unknown"
                issues.append({
                    "type": "quantity_mismatch",
                    "severity": "info",
                    "entity": "quarterly_vs_monthly",
                    "quarterly_plan_id": qp.id,
                    "contract_number": contract.contract_number if contract else "Unknown",
                    "product": qp_product_name,
                    "quarter": q,
                    "quarterly_quantity": qp_values[q],
                    "monthly_total": q_totals[q],
                    "difference": qp_values[q] - q_totals[q]
                })
    
    # 3. Check for cargos without valid monthly plans
    orphaned_cargos = db.query(Cargo).filter(
        ~Cargo.monthly_plan_id.in_(db.query(MonthlyPlan.id))
    ).all()
    for cargo in orphaned_cargos:
        issues.append({
            "type": "orphaned_cargo",
            "severity": "error",
            "entity": "cargo",
            "cargo_id": cargo.id,
            "cargo_ref": cargo.cargo_id,
            "vessel_name": cargo.vessel_name,
            "monthly_plan_id": cargo.monthly_plan_id,
            "message": "Cargo references non-existent monthly plan"
        })
    
    # 4. Check for duplicate cargo assignments
    monthly_plan_ids = db.query(Cargo.monthly_plan_id).group_by(Cargo.monthly_plan_id).having(func.count(Cargo.id) > 1).all()
    for (mp_id,) in monthly_plan_ids:
        cargos = db.query(Cargo).filter(Cargo.monthly_plan_id == mp_id).all()
        issues.append({
            "type": "duplicate_cargo_assignment",
            "severity": "warning",
            "entity": "cargo",
            "monthly_plan_id": mp_id,
            "cargo_count": len(cargos),
            "cargo_ids": [c.id for c in cargos],
            "message": f"Multiple cargos ({len(cargos)}) assigned to same monthly plan"
        })
    
    return {
        "total_issues": len(issues),
        "issues_by_severity": {
            "error": len([i for i in issues if i["severity"] == "error"]),
            "warning": len([i for i in issues if i["severity"] == "warning"]),
            "info": len([i for i in issues if i["severity"] == "info"])
        },
        "issues": issues
    }


# =============================================================================
# CUSTOMERS ADMIN
# =============================================================================

@router.get("/customers")
def get_all_customers_admin(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all customers for admin view."""
    customers = db.query(Customer).offset(skip).limit(limit).all()
    total = db.query(func.count(Customer.id)).scalar()
    
    result = []
    for c in customers:
        contracts_count = db.query(func.count(Contract.id)).filter(Contract.customer_id == c.id).scalar()
        result.append({
            "id": c.id,
            "customer_id": c.customer_id,
            "name": c.name,
            "contracts_count": contracts_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    
    return {"items": result, "total": total}


@router.put("/customers/{customer_id}")
def update_customer_admin(
    customer_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """Update a customer (admin only)."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Prevent editing system-generated IDs
    protected_fields = ["id", "customer_id", "created_at", "updated_at"]
    for field in protected_fields:
        if field in data:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify system-generated field: {field}"
            )
    
    if "name" in data:
        customer.name = data["name"]
    
    db.commit()
    db.refresh(customer)
    
    return {"success": True, "message": "Customer updated"}


@router.delete("/customers/{customer_id}")
def delete_customer_admin(customer_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_auth)):
    """Delete a customer and all related contracts (admin only)."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    db.delete(customer)
    db.commit()
    
    return {"success": True, "message": "Customer deleted"}

