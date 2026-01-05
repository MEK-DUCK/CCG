from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Union, Dict, Tuple
from datetime import datetime, date, timedelta, timezone, time
import json
import logging
import traceback

from app.database import get_db
from app import models, schemas
from sqlalchemy import desc, union_all
from sqlalchemy.sql import select
from sqlalchemy import func

logger = logging.getLogger(__name__)

router = APIRouter()

MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def _parse_float(val: Optional[str]) -> float:
    if val is None:
        return 0.0
    try:
        return float(val)
    except Exception:
        return 0.0


def _format_kt(qty_kt: float) -> str:
    # In this app, quantities are treated as KT throughout the UI.
    if abs(qty_kt - round(qty_kt)) < 1e-9:
        return f"{int(round(qty_kt))} KT"
    return f"{qty_kt:.1f} KT"


def _most_recent_thursday_end(now: datetime) -> datetime:
    """
    Week definition: Sunday -> Thursday.
    Snapshot at the end of the most recent Thursday (23:59:59.999999) in UTC.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    target = 3  # Thursday
    dow = now.weekday()  # Monday=0 ... Sunday=6
    days_back = (dow - target) % 7
    thursday_date = (now - timedelta(days=days_back)).date()
    return datetime.combine(thursday_date, time.max, tzinfo=timezone.utc)


def _build_remarks_by_month(month_deltas: Dict[int, float]) -> Dict[int, str]:
    """
    Greedy-match decreases to increases to form \"deferred\" statements by month.
    """
    pos = [(m, d) for m, d in sorted(month_deltas.items()) if d > 1e-6]
    neg = [(m, -d) for m, d in sorted(month_deltas.items()) if d < -1e-6]

    outgoing: Dict[int, List[Tuple[int, float]]] = {}
    incoming: Dict[int, List[Tuple[int, float]]] = {}

    i = 0
    j = 0
    while i < len(neg) and j < len(pos):
        from_m, from_amt = neg[i]
        to_m, to_amt = pos[j]
        amt = min(from_amt, to_amt)

        outgoing.setdefault(from_m, []).append((to_m, amt))
        incoming.setdefault(to_m, []).append((from_m, amt))

        from_amt -= amt
        to_amt -= amt
        neg[i] = (from_m, from_amt)
        pos[j] = (to_m, to_amt)
        if from_amt <= 1e-6:
            i += 1
        if to_amt <= 1e-6:
            j += 1

    remaining_pos = {m: amt for m, amt in pos if amt > 1e-6}
    remaining_neg = {m: amt for m, amt in neg if amt > 1e-6}

    remarks: Dict[int, str] = {}
    for m in range(1, 13):
        parts: List[str] = []
        if m in outgoing:
            to_parts = [f"{_format_kt(amt)} deferred to {MONTH_NAMES[to_m]}" for to_m, amt in outgoing[m]]
            parts.append("; ".join(to_parts))
        if m in incoming:
            from_parts = [f"{_format_kt(amt)} deferred from {MONTH_NAMES[from_m]}" for from_m, amt in incoming[m]]
            parts.append("; ".join(from_parts))
        if not parts:
            if m in remaining_pos:
                parts.append(f"Increase of {_format_kt(remaining_pos[m])} vs last week")
            elif m in remaining_neg:
                parts.append(f"Decrease of {_format_kt(remaining_neg[m])} vs last week")
        if parts:
            remarks[m] = " | ".join(parts)
    return remarks

@router.get("/cargo", response_model=List[schemas.CargoAuditLog])
def get_cargo_audit_logs(
    cargo_id: Optional[int] = Query(None, description="Filter by cargo ID"),
    cargo_cargo_id: Optional[str] = Query(None, description="Filter by cargo cargo_id string"),
    action: Optional[str] = Query(None, description="Filter by action (CREATE, UPDATE, DELETE, MOVE)"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    limit: int = Query(100, ge=1, le=1000, description="Limit number of results"),
    db: Session = Depends(get_db)
):
    """Get cargo audit logs with optional filters"""
    query = db.query(models.CargoAuditLog)
    
    if cargo_id:
        query = query.filter(
            (models.CargoAuditLog.cargo_id == cargo_id) |
            (models.CargoAuditLog.cargo_db_id == cargo_id)
        )
    
    if cargo_cargo_id:
        query = query.filter(models.CargoAuditLog.cargo_cargo_id == cargo_cargo_id)
    
    if action:
        query = query.filter(models.CargoAuditLog.action == action.upper())
    
    if start_date:
        query = query.filter(models.CargoAuditLog.created_at >= datetime.combine(start_date, datetime.min.time()))
    
    if end_date:
        query = query.filter(models.CargoAuditLog.created_at <= datetime.combine(end_date, datetime.max.time()))
    
    # Order by most recent first
    query = query.order_by(desc(models.CargoAuditLog.created_at))
    
    # Limit results
    query = query.limit(limit)
    
    logs = query.all()
    return logs

@router.get("/monthly-plan", response_model=List[schemas.MonthlyPlanAuditLog])
def get_monthly_plan_audit_logs(
    monthly_plan_id: Optional[int] = Query(None, description="Filter by monthly plan ID"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
    year: Optional[int] = Query(None, description="Filter by year"),
    action: Optional[str] = Query(None, description="Filter by action"),
    limit: int = Query(100, ge=1, le=1000, description="Limit number of results"),
    db: Session = Depends(get_db)
):
    """Get monthly plan audit logs with optional filters, including product_name from quarterly plan or contract"""
    # Join with QuarterlyPlan -> Product to get product_name
    query = db.query(
        models.MonthlyPlanAuditLog,
        models.Product.name.label("qp_product_name")
    ).outerjoin(
        models.QuarterlyPlan,
        models.QuarterlyPlan.id == models.MonthlyPlanAuditLog.quarterly_plan_id
    ).outerjoin(
        models.Product,
        models.Product.id == models.QuarterlyPlan.product_id
    )
    
    if monthly_plan_id:
        query = query.filter(
            (models.MonthlyPlanAuditLog.monthly_plan_id == monthly_plan_id) |
            (models.MonthlyPlanAuditLog.monthly_plan_db_id == monthly_plan_id)
        )
    
    if month:
        query = query.filter(models.MonthlyPlanAuditLog.month == month)
    
    if year:
        query = query.filter(models.MonthlyPlanAuditLog.year == year)
    
    if action:
        query = query.filter(models.MonthlyPlanAuditLog.action == action.upper())
    
    query = query.order_by(desc(models.MonthlyPlanAuditLog.created_at)).limit(limit)
    
    rows = query.all()
    
    # Transform rows to include product_name
    logs = []
    for row in rows:
        log = row[0]  # MonthlyPlanAuditLog object
        qp_product_name = row[1]  # product_name from QuarterlyPlan->Product join
        
        # Use the product_name from the join
        product_name = qp_product_name
        
        # Create a dict from the log and add product_name
        log_dict = {
            "id": log.id,
            "monthly_plan_id": log.monthly_plan_id,
            "monthly_plan_db_id": log.monthly_plan_db_id,
            "action": log.action,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "month": log.month,
            "year": log.year,
            "contract_id": log.contract_id,
            "contract_number": log.contract_number,
            "contract_name": log.contract_name,
            "quarterly_plan_id": log.quarterly_plan_id,
            "product_name": product_name,
            "description": log.description,
            "created_at": log.created_at,
            "monthly_plan_snapshot": log.monthly_plan_snapshot,
        }
        logs.append(schemas.MonthlyPlanAuditLog(**log_dict))
    
    return logs

@router.get("/quarterly-plan", response_model=List[schemas.QuarterlyPlanAuditLog])
def get_quarterly_plan_audit_logs(
    quarterly_plan_id: Optional[int] = Query(None, description="Filter by quarterly plan ID"),
    contract_id: Optional[int] = Query(None, description="Filter by contract ID"),
    action: Optional[str] = Query(None, description="Filter by action"),
    limit: int = Query(100, ge=1, le=1000, description="Limit number of results"),
    db: Session = Depends(get_db)
):
    """Get quarterly plan audit logs with optional filters"""
    query = db.query(models.QuarterlyPlanAuditLog)
    
    if quarterly_plan_id:
        query = query.filter(
            (models.QuarterlyPlanAuditLog.quarterly_plan_id == quarterly_plan_id) |
            (models.QuarterlyPlanAuditLog.quarterly_plan_db_id == quarterly_plan_id)
        )
    
    if contract_id:
        query = query.filter(models.QuarterlyPlanAuditLog.contract_id == contract_id)
    
    if action:
        query = query.filter(models.QuarterlyPlanAuditLog.action == action.upper())
    
    query = query.order_by(desc(models.QuarterlyPlanAuditLog.created_at)).limit(limit)
    
    logs = query.all()
    return logs

@router.get("/reconciliation")
def get_reconciliation_logs(
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
    year: Optional[int] = Query(None, description="Filter by year"),
    action: Optional[str] = Query(None, description="Filter by action"),
    limit: int = Query(100, ge=1, le=1000, description="Limit number of results"),
    db: Session = Depends(get_db)
):
    """Get reconciliation logs - shows monthly and quarterly plan changes only, with product_name"""
    # Join monthly plan logs with QuarterlyPlan and Contract to get product_name
    monthly_query = db.query(
        models.MonthlyPlanAuditLog,
        models.Product.name.label("qp_product_name")
    ).outerjoin(
        models.QuarterlyPlan,
        models.QuarterlyPlan.id == models.MonthlyPlanAuditLog.quarterly_plan_id
    ).outerjoin(
        models.Product,
        models.Product.id == models.QuarterlyPlan.product_id
    )
    
    # Join quarterly plan logs with QuarterlyPlan -> Product to get product_name
    quarterly_query = db.query(
        models.QuarterlyPlanAuditLog,
        models.Product.name.label("qp_product_name")
    ).outerjoin(
        models.QuarterlyPlan,
        models.QuarterlyPlan.id == models.QuarterlyPlanAuditLog.quarterly_plan_id
    ).outerjoin(
        models.Product,
        models.Product.id == models.QuarterlyPlan.product_id
    )
    
    # Apply filters to monthly plan logs
    if month:
        monthly_query = monthly_query.filter(models.MonthlyPlanAuditLog.month == month)
    if year:
        monthly_query = monthly_query.filter(models.MonthlyPlanAuditLog.year == year)
    if action:
        monthly_query = monthly_query.filter(models.MonthlyPlanAuditLog.action == action.upper())
    
    # Apply filters to quarterly plan logs
    if action:
        quarterly_query = quarterly_query.filter(models.QuarterlyPlanAuditLog.action == action.upper())
    
    # Get results
    monthly_rows = monthly_query.all()
    quarterly_rows = quarterly_query.all()
    
    # Transform monthly logs to include product_name
    monthly_logs_with_product = []
    for row in monthly_rows:
        log = row[0]  # MonthlyPlanAuditLog object
        qp_product_name = row[1]  # product_name from QuarterlyPlan->Product join
        
        # Use the product_name from the join
        product_name = qp_product_name
        
        # Create a dict-like object with product_name and user_initials
        log_dict = {
            "id": log.id,
            "monthly_plan_id": log.monthly_plan_id,
            "monthly_plan_db_id": log.monthly_plan_db_id,
            "action": log.action,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "month": log.month,
            "year": log.year,
            "contract_id": log.contract_id,
            "contract_number": log.contract_number,
            "contract_name": log.contract_name,
            "quarterly_plan_id": log.quarterly_plan_id,
            "product_name": product_name,
            "description": log.description,
            "created_at": log.created_at,
            "monthly_plan_snapshot": log.monthly_plan_snapshot,
            "user_initials": log.user_initials,
        }
        monthly_logs_with_product.append(schemas.MonthlyPlanAuditLog(**log_dict))
    
    # Transform quarterly logs to include product_name
    quarterly_logs_with_product = []
    for row in quarterly_rows:
        log = row[0]  # QuarterlyPlanAuditLog object
        qp_product_name = row[1]  # product_name from QuarterlyPlan
        
        # Create a modified log object with product_name attribute
        log.product_name = qp_product_name
        quarterly_logs_with_product.append(log)
    
    # Combine and sort by created_at
    all_logs = []
    for log in monthly_logs_with_product:
        all_logs.append(('monthly', log))
    for log in quarterly_logs_with_product:
        all_logs.append(('quarterly', log))
    
    # Sort by created_at descending
    all_logs.sort(key=lambda x: x[1].created_at, reverse=True)
    
    # Return only the log objects, limit results
    return [log[1] for log in all_logs[:limit]]


@router.get("/weekly-quantity-comparison", response_model=schemas.WeeklyQuantityComparisonResponse)
def get_weekly_quantity_comparison(
    year: Optional[int] = Query(None, description="Year to compare (defaults to current year)"),
    db: Session = Depends(get_db),
):
    """
    Horizontal month-by-month comparison:
    - Previous week totals: snapshot at end of most recent Thursday (week = Sunday->Thursday).
    - Current totals: live monthly plan quantities.
    - Remarks: inferred reallocations across months within the same contract.
    """
    try:
        now = datetime.now(timezone.utc)
        snapshot_at = _most_recent_thursday_end(now)
        week_start = snapshot_at - timedelta(days=4)
        target_year = year or now.year

        # Current live totals by contract/product/month for the year
        current_rows = (
            db.query(
                models.Contract.id.label("contract_id"),
                models.Contract.contract_number.label("contract_number"),
                models.Customer.name.label("contract_name"),
                models.Product.name.label("product_name"),
                models.MonthlyPlan.month.label("month"),
                func.coalesce(func.sum(models.MonthlyPlan.month_quantity), 0.0).label("qty"),
            )
            .join(models.QuarterlyPlan, models.QuarterlyPlan.id == models.MonthlyPlan.quarterly_plan_id)
            .join(models.Contract, models.Contract.id == models.QuarterlyPlan.contract_id)
            .join(models.Customer, models.Customer.id == models.Contract.customer_id)
            .outerjoin(models.Product, models.Product.id == models.QuarterlyPlan.product_id)
            .filter(models.MonthlyPlan.year == target_year)
            .group_by(models.Contract.id, models.Contract.contract_number, models.Customer.name, models.Product.name, models.MonthlyPlan.month)
            .all()
        )

        # Key is now (contract_id, product_name, month)
        current_by_key: Dict[Tuple[int, str, int], float] = {}
        contract_product_info: Dict[Tuple[int, str], Dict[str, Optional[str]]] = {}
        for r in current_rows:
            product_name = r.product_name or "Unknown"
            contract_product_info[(int(r.contract_id), product_name)] = {
                "contract_number": r.contract_number, 
                "contract_name": r.contract_name,
                "product_name": product_name
            }
            current_by_key[(int(r.contract_id), product_name, int(r.month))] = float(r.qty or 0.0)

        # Net deltas since snapshot_at from audit logs (previous = current - delta_since_snapshot)
        # We need to get product_name for each log entry via quarterly_plan -> product
        # Also include DEFER/ADVANCE actions for move tracking
        logs = (
            db.query(
                models.MonthlyPlanAuditLog,
                models.Product.name.label("product_name")
            )
            .outerjoin(models.QuarterlyPlan, models.QuarterlyPlan.id == models.MonthlyPlanAuditLog.quarterly_plan_id)
            .outerjoin(models.Product, models.Product.id == models.QuarterlyPlan.product_id)
            .filter(models.MonthlyPlanAuditLog.created_at > snapshot_at)
            .filter(models.MonthlyPlanAuditLog.contract_id.isnot(None))
            .filter(
                (models.MonthlyPlanAuditLog.field_name == "month_quantity")
                | (models.MonthlyPlanAuditLog.action == "DELETE")
                | (models.MonthlyPlanAuditLog.action.in_(["DEFER", "ADVANCE"]))
            )
            .order_by(models.MonthlyPlanAuditLog.created_at.asc())
            .all()
        )

        # Key is now (contract_id, product_name, month)
        delta_by_key: Dict[Tuple[int, str, int], float] = {}
        # Track move actions for remarks: key = (contract_id, product_name, month), value = list of move descriptions
        move_remarks: Dict[Tuple[int, str, int], List[str]] = {}
        month_names_short = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        
        for log_row in logs:
            # log_row is a Row object with MonthlyPlanAuditLog and product_name
            log = log_row[0]  # MonthlyPlanAuditLog object
            product_name_from_qp = log_row[1]  # product_name from QuarterlyPlan
            if not product_name_from_qp:
                product_name_from_qp = "Unknown"
            
            cid = int(log.contract_id)
            contract_product_info.setdefault((cid, product_name_from_qp), {
                "contract_number": log.contract_number, 
                "contract_name": log.contract_name,
                "product_name": product_name_from_qp
            })

            delta = 0.0
            
            # Handle DEFER/ADVANCE actions - cargo moved between months
            if log.action in ("DEFER", "ADVANCE"):
                # Parse old_value "month/year" to get source month
                try:
                    old_parts = log.old_value.split("/") if log.old_value else []
                    new_parts = log.new_value.split("/") if log.new_value else []
                    
                    if len(old_parts) == 2 and len(new_parts) == 2:
                        old_month = int(old_parts[0])
                        old_year = int(old_parts[1])
                        new_month = int(new_parts[0])
                        new_year = int(new_parts[1])
                        
                        # Only process if within target year
                        # Get quantity from monthly plan
                        qty = 0.0
                        if log.monthly_plan_id:
                            mp = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == log.monthly_plan_id).first()
                            if mp:
                                qty = float(mp.month_quantity or 0.0)
                        
                        # Also try to extract from description if monthly plan not found
                        if qty == 0.0 and log.description:
                            import re
                            match = re.search(r'([\d,]+(?:\.\d+)?)\s*KT', log.description)
                            if match:
                                qty = float(match.group(1).replace(',', ''))
                        
                        if qty > 0:
                            contract_num = log.contract_number or str(cid)
                            action_verb = "deferred" if log.action == "DEFER" else "advanced"
                            from_month_str = month_names_short[old_month]
                            to_month_str = month_names_short[new_month]
                            qty_str = f"{qty:g}" if qty == int(qty) else f"{qty:.1f}"
                            
                            # -qty from old month (if within target year)
                            if old_year == target_year:
                                key_old = (cid, product_name_from_qp, old_month)
                                delta_by_key[key_old] = float(delta_by_key.get(key_old, 0.0) - qty)
                                # Add remark for source month
                                remark_old = f"{contract_num}: {qty_str} KT {action_verb} to {to_month_str}"
                                move_remarks.setdefault(key_old, []).append(remark_old)
                            
                            # +qty to new month (if within target year)
                            if new_year == target_year:
                                key_new = (cid, product_name_from_qp, new_month)
                                delta_by_key[key_new] = float(delta_by_key.get(key_new, 0.0) + qty)
                                # Add remark for target month
                                remark_new = f"{contract_num}: {qty_str} KT {action_verb} from {from_month_str}"
                                move_remarks.setdefault(key_new, []).append(remark_new)
                except Exception as e:
                    logger.warning(f"Failed to parse DEFER/ADVANCE log {log.id}: {e}")
                continue  # Skip normal delta processing for DEFER/ADVANCE
            
            m = int(log.month) if log.month else None
            if m is None:
                continue
                
            if log.action in ("UPDATE", "CREATE") and log.field_name == "month_quantity":
                delta = _parse_float(log.new_value) - _parse_float(log.old_value)
            elif log.action == "DELETE":
                if log.field_name == "month_quantity" and log.old_value is not None and log.new_value is not None:
                    delta = _parse_float(log.new_value) - _parse_float(log.old_value)
                else:
                    qty_removed = 0.0
                    try:
                        if log.monthly_plan_snapshot:
                            snap = json.loads(log.monthly_plan_snapshot)
                            qty_removed = float(snap.get("month_quantity") or 0.0)
                    except Exception:
                        qty_removed = 0.0
                    delta = -qty_removed

            if abs(delta) > 1e-9:
                key = (cid, product_name_from_qp, m)
                delta_by_key[key] = float(delta_by_key.get(key, 0.0) + delta)

        contracts_out: List[schemas.WeeklyQuantityContract] = []
        # Sort by (contract_number, product_name)
        for (cid, product_name) in sorted(contract_product_info.keys(), key=lambda x: (contract_product_info[x].get("contract_number") or "", x[1] or "", x[0])):
            month_deltas: Dict[int, float] = {}
            months_out: List[schemas.WeeklyQuantityMonth] = []
            prev_total = 0.0
            cur_total = 0.0

            for m in range(1, 13):
                cur = float(current_by_key.get((cid, product_name, m), 0.0))
                delta_since = float(delta_by_key.get((cid, product_name, m), 0.0))
                prev = cur - delta_since
                if prev < 0 and abs(prev) < 1e-6:
                    prev = 0.0
                delta_val = cur - prev
                month_deltas[m] = delta_val

                prev_total += prev
                cur_total += cur
                months_out.append(
                    schemas.WeeklyQuantityMonth(
                        month=m,
                        previous_quantity=prev,
                        current_quantity=cur,
                        delta=delta_val,
                        remark=None,
                    )
                )

            remarks_by_month = _build_remarks_by_month(month_deltas)
            
            # Merge move remarks with regular remarks
            for m in range(1, 13):
                key = (cid, product_name, m)
                move_remark_list = move_remarks.get(key, [])
                regular_remark = remarks_by_month.get(m)
                
                # Combine move remarks and regular remarks
                all_remarks = move_remark_list.copy()
                if regular_remark:
                    all_remarks.append(regular_remark)
                
                if all_remarks:
                    remarks_by_month[m] = "\n".join(all_remarks)
            
            months_out = [
                schemas.WeeklyQuantityMonth(
                    month=mm.month,
                    previous_quantity=mm.previous_quantity,
                    current_quantity=mm.current_quantity,
                    delta=mm.delta,
                    remark=remarks_by_month.get(mm.month),
                )
                for mm in months_out
            ]

            contracts_out.append(
                schemas.WeeklyQuantityContract(
                    contract_id=cid,
                    contract_number=contract_product_info[(cid, product_name)].get("contract_number"),
                    contract_name=contract_product_info[(cid, product_name)].get("contract_name"),
                    product_name=product_name,
                    months=months_out,
                    previous_total=prev_total,
                    current_total=cur_total,
                    delta_total=cur_total - prev_total,
                )
            )

        return schemas.WeeklyQuantityComparisonResponse(
            year=target_year,
            previous_week_start=week_start,
            previous_week_end=snapshot_at,
            generated_at=now,
            contracts=contracts_out,
        )
    except Exception as e:
        import traceback
        logger.error(f"weekly-quantity-comparison failed: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error building weekly quantity comparison: {str(e)}")

