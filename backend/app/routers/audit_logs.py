from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Union
from datetime import datetime, date
from app.database import get_db
from app import models, schemas
from sqlalchemy import desc, union_all
from sqlalchemy.sql import select

router = APIRouter()

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
        query = query.filter(models.CargoAuditLog.cargo_id == cargo_id)
    
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
    """Get monthly plan audit logs with optional filters"""
    query = db.query(models.MonthlyPlanAuditLog)
    
    if monthly_plan_id:
        query = query.filter(models.MonthlyPlanAuditLog.monthly_plan_id == monthly_plan_id)
    
    if month:
        query = query.filter(models.MonthlyPlanAuditLog.month == month)
    
    if year:
        query = query.filter(models.MonthlyPlanAuditLog.year == year)
    
    if action:
        query = query.filter(models.MonthlyPlanAuditLog.action == action.upper())
    
    query = query.order_by(desc(models.MonthlyPlanAuditLog.created_at)).limit(limit)
    
    logs = query.all()
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
        query = query.filter(models.QuarterlyPlanAuditLog.quarterly_plan_id == quarterly_plan_id)
    
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
    """Get reconciliation logs - shows monthly and quarterly plan changes only"""
    monthly_query = db.query(models.MonthlyPlanAuditLog)
    quarterly_query = db.query(models.QuarterlyPlanAuditLog)
    
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
    monthly_logs = monthly_query.all()
    quarterly_logs = quarterly_query.all()
    
    # Combine and sort by created_at
    all_logs = []
    for log in monthly_logs:
        all_logs.append(('monthly', log))
    for log in quarterly_logs:
        all_logs.append(('quarterly', log))
    
    # Sort by created_at descending
    all_logs.sort(key=lambda x: x[1].created_at, reverse=True)
    
    # Return only the log objects, limit results
    return [log[1] for log in all_logs[:limit]]

