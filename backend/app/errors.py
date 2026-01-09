"""
Centralized error definitions for the Oil Lifting Program.
Provides consistent error responses across all endpoints.
"""
from enum import Enum
from typing import Optional, Any, Dict
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
import logging
import traceback
import re

logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    """Application-specific error codes for frontend handling."""
    # Resource errors (404)
    CUSTOMER_NOT_FOUND = "CUSTOMER_NOT_FOUND"
    CONTRACT_NOT_FOUND = "CONTRACT_NOT_FOUND"
    CARGO_NOT_FOUND = "CARGO_NOT_FOUND"
    MONTHLY_PLAN_NOT_FOUND = "MONTHLY_PLAN_NOT_FOUND"
    QUARTERLY_PLAN_NOT_FOUND = "QUARTERLY_PLAN_NOT_FOUND"
    COMBI_GROUP_NOT_FOUND = "COMBI_GROUP_NOT_FOUND"
    
    # Validation errors (400)
    INVALID_STATUS = "INVALID_STATUS"
    INVALID_LOAD_PORT = "INVALID_LOAD_PORT"
    INVALID_QUANTITY = "INVALID_QUANTITY"
    INVALID_MONTH = "INVALID_MONTH"
    INVALID_YEAR = "INVALID_YEAR"
    PRODUCT_NOT_IN_CONTRACT = "PRODUCT_NOT_IN_CONTRACT"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    
    # Business logic errors (400/409)
    CARGO_ALREADY_EXISTS = "CARGO_ALREADY_EXISTS"
    PLAN_HAS_COMPLETED_CARGOS = "PLAN_HAS_COMPLETED_CARGOS"
    PLAN_HAS_CARGOS = "PLAN_HAS_CARGOS"
    QUANTITY_EXCEEDS_PLAN = "QUANTITY_EXCEEDS_PLAN"
    QUANTITY_EXCEEDS_QUARTERLY = "QUANTITY_EXCEEDS_QUARTERLY"
    MONTHLY_EXCEEDS_QUARTERLY = "MONTHLY_EXCEEDS_QUARTERLY"
    LOAD_PORT_REQUIRED = "LOAD_PORT_REQUIRED"
    INVALID_MOVE_DIRECTION = "INVALID_MOVE_DIRECTION"
    CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION"
    
    # System errors (500)
    DATABASE_ERROR = "DATABASE_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # Status transition errors
    INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION"


class AppError(Exception):
    """Base application error with structured response."""
    
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)
    
    def to_response(self) -> Dict[str, Any]:
        """Convert to API response format."""
        response = {
            "error": {
                "code": self.code.value,
                "message": self.message,
            }
        }
        if self.details:
            response["error"]["details"] = self.details
        return response


class NotFoundError(AppError):
    """Resource not found error (404)."""
    
    def __init__(self, resource: str, identifier: Any = None, code: Optional[ErrorCode] = None):
        error_code = code or ErrorCode.INTERNAL_ERROR
        message = f"{resource} not found"
        if identifier is not None:
            message = f"{resource} with ID {identifier} not found"
        super().__init__(
            code=error_code,
            message=message,
            status_code=404,
            details={"resource": resource, "identifier": str(identifier) if identifier else None}
        )


class ValidationError(AppError):
    """Validation error (400)."""
    
    def __init__(self, message: str, code: ErrorCode = ErrorCode.MISSING_REQUIRED_FIELD, field: Optional[str] = None):
        details = {}
        if field:
            details["field"] = field
        super().__init__(
            code=code,
            message=message,
            status_code=400,
            details=details
        )


class ConflictError(AppError):
    """Resource conflict error (409)."""
    
    def __init__(self, message: str, code: ErrorCode = ErrorCode.CONCURRENT_MODIFICATION, existing_id: Optional[str] = None):
        details = {}
        if existing_id:
            details["existing_id"] = existing_id
        super().__init__(
            code=code,
            message=message,
            status_code=409,
            details=details
        )


class BusinessRuleError(AppError):
    """Business rule violation (400)."""
    
    def __init__(self, message: str, code: ErrorCode, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code=code,
            message=message,
            status_code=400,
            details=details or {}
        )


# =============================================================================
# ERROR HANDLERS
# =============================================================================

def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    """Handle AppError and return structured JSON response."""
    logger.warning(f"Application error: {exc.code.value} - {exc.message}", extra={
        "error_code": exc.code.value,
        "path": str(request.url.path),
        "details": exc.details
    })
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_response()
    )


def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected errors with safe logging."""
    # Log full traceback for debugging
    logger.error(f"Unexpected error at {request.url.path}: {str(exc)}", exc_info=True)

    # Return safe error message to client (no internal details)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": ErrorCode.INTERNAL_ERROR.value,
                "message": "An unexpected error occurred. Please try again later."
            }
        }
    )


def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Handle SQLAlchemy database errors with sanitized messages."""
    # Log full error for debugging (internal only)
    logger.error(f"Database error at {request.url.path}: {str(exc)}", exc_info=True)

    # Return sanitized error message
    user_message = sanitize_db_error(exc)
    return JSONResponse(
        status_code=400 if isinstance(exc, IntegrityError) else 500,
        content={
            "error": {
                "code": ErrorCode.DATABASE_ERROR.value,
                "message": user_message
            }
        }
    )


def sanitize_db_error(exc: Exception) -> str:
    """
    Convert database exceptions to user-friendly messages.
    Never expose SQL statements, table names, or internal details.
    """
    error_str = str(exc).lower()

    # Check for common integrity errors and provide helpful messages
    if isinstance(exc, IntegrityError):
        if 'unique constraint' in error_str or 'duplicate' in error_str:
            # Try to extract a meaningful field name without exposing internals
            if 'contract_number' in error_str:
                return "A contract with this number already exists."
            if 'customer_id' in error_str or 'customer' in error_str:
                return "This customer already exists or is referenced elsewhere."
            if 'email' in error_str:
                return "This email address is already in use."
            if 'product' in error_str:
                return "This product already exists or conflicts with an existing entry."
            return "A record with these values already exists. Please use unique values."

        if 'foreign key' in error_str:
            if 'customer' in error_str:
                return "The specified customer does not exist."
            if 'contract' in error_str:
                return "The specified contract does not exist."
            if 'product' in error_str:
                return "The specified product does not exist."
            return "Referenced record does not exist. Please check your selection."

        if 'not null' in error_str or 'null value' in error_str:
            return "A required field is missing. Please fill in all required fields."

        if 'check constraint' in error_str:
            return "The provided value does not meet the required constraints."

    # Generic database error message
    return "A database error occurred. Please try again or contact support if the problem persists."


def wrap_db_operation(operation_name: str = "operation"):
    """
    Decorator to wrap database operations with sanitized error handling.

    Usage:
        @wrap_db_operation("creating contract")
        def create_contract(...):
            ...
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except IntegrityError as e:
                logger.error(f"Integrity error in {operation_name}: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=400,
                    detail=sanitize_db_error(e)
                )
            except SQLAlchemyError as e:
                logger.error(f"Database error in {operation_name}: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=sanitize_db_error(e)
                )
        return wrapper
    return decorator


# =============================================================================
# HELPER FUNCTIONS FOR COMMON ERRORS
# =============================================================================

def customer_not_found(customer_id: int) -> NotFoundError:
    return NotFoundError("Customer", customer_id, ErrorCode.CUSTOMER_NOT_FOUND)


def contract_not_found(contract_id: int) -> NotFoundError:
    return NotFoundError("Contract", contract_id, ErrorCode.CONTRACT_NOT_FOUND)


def cargo_not_found(cargo_id: int) -> NotFoundError:
    return NotFoundError("Cargo", cargo_id, ErrorCode.CARGO_NOT_FOUND)


def monthly_plan_not_found(plan_id: int) -> NotFoundError:
    return NotFoundError("Monthly plan", plan_id, ErrorCode.MONTHLY_PLAN_NOT_FOUND)


def quarterly_plan_not_found(plan_id: int) -> NotFoundError:
    return NotFoundError("Quarterly plan", plan_id, ErrorCode.QUARTERLY_PLAN_NOT_FOUND)


def combi_group_not_found(group_id: str) -> NotFoundError:
    return NotFoundError("Combi cargo group", group_id, ErrorCode.COMBI_GROUP_NOT_FOUND)


def invalid_load_port(port_code: str, valid_ports: list) -> ValidationError:
    return ValidationError(
        message=f"Invalid port code: {port_code}. Must be one of: {', '.join(sorted(valid_ports))}",
        code=ErrorCode.INVALID_LOAD_PORT,
        field="port_code"
    )


def invalid_status(status: str, valid_statuses: list) -> ValidationError:
    return ValidationError(
        message=f"Invalid status: {status}. Valid values: {', '.join(valid_statuses)}",
        code=ErrorCode.INVALID_STATUS,
        field="status"
    )


def cargo_already_exists(cargo_id: str, vessel_name: str) -> ConflictError:
    return ConflictError(
        message=f"This monthly plan already has a cargo assigned (Cargo ID: {cargo_id}, Vessel: {vessel_name}). Please edit the existing cargo instead.",
        code=ErrorCode.CARGO_ALREADY_EXISTS,
        existing_id=cargo_id
    )


def quantity_exceeds_plan(requested: float, available: float, total: float) -> BusinessRuleError:
    return BusinessRuleError(
        message=f"Monthly quantity ({requested:,.0f} MT) exceeds remaining quarterly plan quantity ({available:,.0f} MT remaining out of {total:,.0f} MT total)",
        code=ErrorCode.QUANTITY_EXCEEDS_PLAN,
        details={"requested": requested, "available": available, "total": total}
    )


def monthly_exceeds_quarterly(quarter: int, monthly_total: float, quarterly_allocation: float) -> BusinessRuleError:
    return BusinessRuleError(
        message=f"Cannot reduce Q{quarter} to {quarterly_allocation:,.0f} KT - existing monthly plans total {monthly_total:,.0f} KT",
        code=ErrorCode.MONTHLY_EXCEEDS_QUARTERLY,
        details={"quarter": quarter, "monthly_total": monthly_total, "quarterly_allocation": quarterly_allocation}
    )


def load_port_required_for_loading() -> BusinessRuleError:
    return BusinessRuleError(
        message="Please select at least one Load Port before setting status to Loading.",
        code=ErrorCode.LOAD_PORT_REQUIRED
    )


def plan_has_completed_cargos(completed_count: int, cargo_ids: list) -> BusinessRuleError:
    return BusinessRuleError(
        message=f"This plan has {completed_count} completed cargo(s): {', '.join(cargo_ids)}. Completed cargos must remain in their original month.",
        code=ErrorCode.PLAN_HAS_COMPLETED_CARGOS,
        details={"completed_count": completed_count, "cargo_ids": cargo_ids}
    )


def plan_has_cargos(total_count: int, cargo_ids: list) -> BusinessRuleError:
    return BusinessRuleError(
        message=f"Cannot delete/move monthly plan. It has {total_count} cargo(s): {', '.join(cargo_ids)}. Please delete or reassign the cargos first.",
        code=ErrorCode.PLAN_HAS_CARGOS,
        details={"total_count": total_count, "cargo_ids": cargo_ids}
    )


def invalid_move_direction(action: str, message: str) -> BusinessRuleError:
    return BusinessRuleError(
        message=message,
        code=ErrorCode.INVALID_MOVE_DIRECTION,
        details={"action": action}
    )


def invalid_status_transition(current_status: str, target_status: str, reason: str) -> BusinessRuleError:
    return BusinessRuleError(
        message=reason,
        code=ErrorCode.INVALID_STATUS_TRANSITION,
        details={"current_status": current_status, "target_status": target_status}
    )


# =============================================================================
# CONVERT TO HTTP EXCEPTION (for backward compatibility)
# =============================================================================

def to_http_exception(error: AppError) -> HTTPException:
    """Convert AppError to HTTPException for backward compatibility."""
    return HTTPException(
        status_code=error.status_code,
        detail=error.message
    )

