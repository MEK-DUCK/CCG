"""
Centralized configuration for Oil Lifting Program.
Single source of truth for all port codes, statuses, and business constants.
"""
from enum import Enum
from typing import Dict, List, Set, Optional


# =============================================================================
# LOAD PORTS
# =============================================================================

class LoadPort(str, Enum):
    """
    Supported load port codes.
    These are the Kuwait oil terminal load points.
    """
    MAA = "MAA"  # Mina Al Ahmadi
    MAB = "MAB"  # Mina Abdullah  
    SHU = "SHU"  # Shuaiba
    ZOR = "ZOR"  # Az-Zour


# Derived sets for validation
SUPPORTED_LOAD_PORTS: Set[str] = {port.value for port in LoadPort}
LOAD_PORT_LIST: List[str] = [port.value for port in LoadPort]

# Port metadata (can be extended with coordinates, timezone, etc.)
LOAD_PORT_INFO: Dict[str, dict] = {
    LoadPort.MAA.value: {
        "name": "Mina Al Ahmadi",
        "short_name": "MAA",
        "order": 1,
        "active": True,
    },
    LoadPort.MAB.value: {
        "name": "Mina Abdullah", 
        "short_name": "MAB",
        "order": 2,
        "active": True,
    },
    LoadPort.SHU.value: {
        "name": "Shuaiba",
        "short_name": "SHU", 
        "order": 3,
        "active": True,
    },
    LoadPort.ZOR.value: {
        "name": "Az-Zour",
        "short_name": "ZOR",
        "order": 4,
        "active": True,
    },
}


# =============================================================================
# PORT OPERATION STATUSES
# =============================================================================

class PortOperationStatus(str, Enum):
    """Status of loading operations at a specific port."""
    PLANNED = "Planned"
    LOADING = "Loading"
    COMPLETED = "Completed Loading"


PORT_OP_ALLOWED_STATUSES: Set[str] = {s.value for s in PortOperationStatus}


# =============================================================================
# PRODUCTS
# =============================================================================

class ProductCategory(str, Enum):
    """Product categories for filtering and grouping."""
    GASOIL = "GASOIL"
    JET = "JET"
    FUEL = "FUEL"


# Product name patterns for categorization
PRODUCT_PATTERNS: Dict[ProductCategory, List[str]] = {
    ProductCategory.GASOIL: ["GASOIL", "GASOIL 10PPM", "GASOIL 500PPM"],
    ProductCategory.JET: ["JET A-1", "JET A1"],
    ProductCategory.FUEL: ["FUEL OIL", "HFO", "LSFO"],
}


# =============================================================================
# BUSINESS CONSTANTS
# =============================================================================

# Year range for validation
MIN_YEAR = 2020
MAX_YEAR = 2100

# Quantity tolerance for floating point comparisons (in KT)
QUANTITY_TOLERANCE = 0.01


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def validate_load_port(port_code: str) -> bool:
    """Check if a port code is valid."""
    return port_code.upper() in SUPPORTED_LOAD_PORTS


def get_port_name(port_code: str) -> str:
    """Get human-readable port name."""
    info = LOAD_PORT_INFO.get(port_code.upper())
    return info["name"] if info else port_code


def get_product_category(product_name: str) -> Optional[ProductCategory]:
    """Determine product category from product name."""
    upper_name = product_name.upper()
    for category, patterns in PRODUCT_PATTERNS.items():
        if any(pattern in upper_name for pattern in patterns):
            return category
    return None


def is_quantity_equal(qty1: float, qty2: float, tolerance: float = QUANTITY_TOLERANCE) -> bool:
    """Compare two quantities with tolerance."""
    return abs(qty1 - qty2) <= tolerance

