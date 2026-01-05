"""
Unified quantity calculation utilities for contracts.

This module provides a single source of truth for calculating contract quantities,
abstracting away the two quantity modes (Fixed and Min/Max) into a unified interface.

Quantity Modes:
- Fixed mode: Uses total_quantity + optional_quantity
- Min/Max mode: Uses min_quantity + max_quantity + optional_quantity

Both modes are normalized to a common interface:
- min_quantity: Minimum required quantity
- max_quantity: Maximum allowed quantity (including optional)
"""

import json
from typing import Optional, List, Dict, Any, Tuple


def get_product_quantity_limits(product: Dict[str, Any]) -> Dict[str, float]:
    """
    Get normalized quantity limits for a single product.
    
    Handles both Fixed mode and Min/Max mode:
    - Fixed mode: min = max = total_quantity, max_with_optional = total + optional
    - Min/Max mode: uses min_quantity, max_quantity directly
    
    Args:
        product: Product dict with quantity fields
        
    Returns:
        Dict with:
        - min_quantity: Minimum required quantity
        - max_quantity: Maximum base quantity (without optional for fixed mode)
        - max_with_optional: Maximum allowed including optional
        - optional_quantity: Optional quantity on top of base
        - is_range_mode: True if using min/max mode
    """
    min_qty = product.get('min_quantity')
    max_qty = product.get('max_quantity')
    total_qty = product.get('total_quantity', 0) or 0
    optional_qty = product.get('optional_quantity', 0) or 0
    
    # Determine mode based on presence of min/max values
    is_range_mode = (min_qty is not None and min_qty > 0) or (max_qty is not None and max_qty > 0)
    
    if is_range_mode:
        # Min/Max mode
        min_quantity = min_qty or 0
        max_quantity = max_qty or 0
        max_with_optional = max_quantity + optional_qty
    else:
        # Fixed mode - normalize to range where min = max = total
        min_quantity = total_qty
        max_quantity = total_qty
        max_with_optional = total_qty + optional_qty
    
    return {
        'min_quantity': min_quantity,
        'max_quantity': max_quantity,
        'max_with_optional': max_with_optional,
        'optional_quantity': optional_qty,
        'is_range_mode': is_range_mode,
    }


def get_contract_quantity_limits(
    products: List[Dict[str, Any]], 
    product_name: Optional[str] = None,
    authority_topup: float = 0
) -> Dict[str, float]:
    """
    Get normalized quantity limits for a contract or specific product.
    
    Args:
        products: List of product dicts from contract
        product_name: If specified, get limits for this product only
        authority_topup: Additional authority top-up quantity to add to max
        
    Returns:
        Dict with:
        - min_quantity: Minimum required quantity
        - max_quantity: Maximum base quantity
        - max_with_optional: Maximum including optional
        - max_with_topup: Maximum including optional + authority topup
        - optional_quantity: Total optional quantity
        - is_range_mode: True if any product uses min/max mode
    """
    if product_name:
        # Single product lookup
        product = next((p for p in products if p.get('name') == product_name), None)
        if not product:
            return {
                'min_quantity': 0,
                'max_quantity': 0,
                'max_with_optional': 0,
                'max_with_topup': authority_topup,
                'optional_quantity': 0,
                'is_range_mode': False,
            }
        limits = get_product_quantity_limits(product)
        limits['max_with_topup'] = limits['max_with_optional'] + authority_topup
        return limits
    
    # Aggregate across all products
    total_min = 0
    total_max = 0
    total_max_with_optional = 0
    total_optional = 0
    is_range_mode = False
    
    for product in products:
        limits = get_product_quantity_limits(product)
        total_min += limits['min_quantity']
        total_max += limits['max_quantity']
        total_max_with_optional += limits['max_with_optional']
        total_optional += limits['optional_quantity']
        if limits['is_range_mode']:
            is_range_mode = True
    
    return {
        'min_quantity': total_min,
        'max_quantity': total_max,
        'max_with_optional': total_max_with_optional,
        'max_with_topup': total_max_with_optional + authority_topup,
        'optional_quantity': total_optional,
        'is_range_mode': is_range_mode,
    }


def parse_contract_products(contract) -> List[Dict[str, Any]]:
    """
    Parse products JSON from a contract model.
    
    Args:
        contract: Contract model instance with products relationship
        
    Returns:
        List of product dicts
    """
    # Use the normalized relationship method if available
    if hasattr(contract, 'get_products_list'):
        return contract.get_products_list()
    
    # Fallback for any edge cases
    return []


def get_authority_topup_for_product(db, contract_id: int, product_name: Optional[str] = None, product_id: Optional[int] = None) -> float:
    """
    Get total authority top-up quantity for a contract/product by aggregating from monthly plans.
    
    Authority top-ups are now tracked ONLY at the MonthlyPlan level.
    This function aggregates the authority_topup_quantity from all monthly plans
    for the given contract (and optionally filtered by product).
    
    Args:
        db: Database session
        contract_id: Contract ID to get top-ups for
        product_name: If specified, get top-ups for this product only (legacy support)
        product_id: If specified, get top-ups for this product only (preferred)
        
    Returns:
        Total top-up quantity in KT
    """
    from app import models  # Import here to avoid circular imports
    
    query = db.query(models.MonthlyPlan).filter(
        models.MonthlyPlan.contract_id == contract_id,
        models.MonthlyPlan.authority_topup_quantity > 0
    )
    
    # Use product_id if available, otherwise fall back to product_name lookup
    if product_id:
        query = query.filter(models.MonthlyPlan.product_id == product_id)
    elif product_name:
        # Look up product_id from product_name
        product = db.query(models.Product).filter(models.Product.name == product_name).first()
        if product:
            query = query.filter(models.MonthlyPlan.product_id == product.id)
    
    monthly_plans = query.all()
    return sum(mp.authority_topup_quantity or 0 for mp in monthly_plans)


def get_product_id_by_name(db, product_name: str) -> Optional[int]:
    """
    Look up product ID by product name.
    
    Args:
        db: Database session
        product_name: Product name to look up
        
    Returns:
        Product ID or None if not found
    """
    from app import models
    product = db.query(models.Product).filter(models.Product.name == product_name).first()
    return product.id if product else None


def get_product_name_by_id(db, product_id: int) -> Optional[str]:
    """
    Look up product name by product ID.
    
    Args:
        db: Database session
        product_id: Product ID to look up
        
    Returns:
        Product name or None if not found
    """
    from app import models
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    return product.name if product else None


def get_products_list(contract) -> List[Dict[str, Any]]:
    """
    Retrieves the list of products for a contract from the relational table.
    
    Args:
        contract: Contract model instance with contract_products relationship loaded.
        
    Returns:
        List of product dicts in the format expected by the frontend.
    """
    products_data = []
    for cp in contract.contract_products:
        product_name = cp.product.name if cp.product else None
        if product_name:
            product_dict = {
                "name": product_name,
                "product_id": cp.product_id,
                "total_quantity": cp.total_quantity,
                "optional_quantity": cp.optional_quantity,
                "min_quantity": cp.min_quantity,
                "max_quantity": cp.max_quantity,
                "year_quantities": json.loads(cp.year_quantities) if cp.year_quantities else None
            }
            products_data.append(product_dict)
    return products_data


def validate_quantity_against_limits(
    quantity: float,
    limits: Dict[str, float],
    used_quantity: float = 0,
    context: str = "contract"
) -> Tuple[bool, Optional[str]]:
    """
    Validate a quantity against contract/product limits.
    
    Args:
        quantity: Quantity to validate
        limits: Limits dict from get_contract_quantity_limits
        used_quantity: Already used/planned quantity
        context: Context string for error messages (e.g., "contract", "JET A-1")
        
    Returns:
        Tuple of (is_valid, error_message)
        error_message is None if valid
    """
    remaining = limits['max_with_topup'] - used_quantity
    
    if quantity > remaining:
        if limits['is_range_mode']:
            return False, (
                f"Quantity ({quantity:,.0f} KT) exceeds remaining {context} max "
                f"({remaining:,.0f} KT). Range: {limits['min_quantity']:,.0f} - "
                f"{limits['max_with_topup']:,.0f} KT, Already planned: {used_quantity:,.0f} KT"
            )
        else:
            return False, (
                f"Quantity ({quantity:,.0f} KT) exceeds remaining {context} quantity "
                f"({remaining:,.0f} KT). Total: {limits['max_with_topup']:,.0f} KT, "
                f"Already planned: {used_quantity:,.0f} KT"
            )
    
    return True, None

