"""
Configuration API endpoints.
Exposes centralized configuration to frontend for consistency.
"""
from fastapi import APIRouter, Depends
from typing import List, Dict, Any

from app.auth import require_auth
from app import models
from app.config import (
    LOAD_PORT_INFO,
    LOAD_PORT_LIST,
    PORT_OP_ALLOWED_STATUSES,
    ProductCategory,
    PRODUCT_PATTERNS,
)

router = APIRouter()


@router.get("/load-ports")
def get_load_ports(
    current_user: models.User = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Get all supported load ports with metadata.
    Frontend should use this instead of hardcoding port codes.
    """
    return {
        "ports": [
            {
                "code": code,
                **info
            }
            for code, info in LOAD_PORT_INFO.items()
            if info.get("active", True)
        ],
        "codes": LOAD_PORT_LIST,
    }


@router.get("/port-operation-statuses")
def get_port_op_statuses(
    current_user: models.User = Depends(require_auth),
) -> Dict[str, List[str]]:
    """Get valid port operation statuses."""
    return {"statuses": list(PORT_OP_ALLOWED_STATUSES)}


@router.get("/product-categories")
def get_product_categories(
    current_user: models.User = Depends(require_auth),
) -> Dict[str, Any]:
    """Get product categories and their patterns for filtering."""
    return {
        "categories": [cat.value for cat in ProductCategory],
        "patterns": {cat.value: patterns for cat, patterns in PRODUCT_PATTERNS.items()}
    }

