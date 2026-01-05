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

Authority Amendments:
- Amendments modify the effective min/max quantities without changing original values
- Effective quantities = original quantities + sum of all applicable amendments
- Amendments can be filtered by effective_date and contract_year
"""

import json
from datetime import date
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


# =============================================================================
# Authority Amendment Functions
# =============================================================================

def apply_amendments_to_product(
    original_min: float,
    original_max: float,
    amendments: List[Dict[str, Any]],
    as_of_date: Optional[date] = None,
    contract_year: Optional[int] = None,
) -> Dict[str, float]:
    """
    Calculate effective min/max quantities by applying amendments to original values.
    
    This is the core function for dynamic amendment calculation. It takes original
    contract quantities and applies all applicable amendments to compute effective values.
    
    Args:
        original_min: Original minimum quantity from contract
        original_max: Original maximum quantity from contract
        amendments: List of amendment dicts with keys:
            - amendment_type: 'increase_max', 'decrease_max', 'increase_min', 
                             'decrease_min', 'set_min', 'set_max'
            - quantity_change: Amount to add/subtract (for increase/decrease types)
            - new_min_quantity: New absolute min (for set_min type)
            - new_max_quantity: New absolute max (for set_max type)
            - effective_date: Optional date when amendment takes effect
            - year: Optional contract year this amendment applies to
        as_of_date: Only apply amendments with effective_date <= this date
                   If None, applies all amendments regardless of date
        contract_year: Only apply amendments for this specific contract year
                      If None, applies amendments where year is None (all years)
                      
    Returns:
        Dict with:
        - min_quantity: Effective minimum after amendments
        - max_quantity: Effective maximum after amendments
        - amendment_count: Number of amendments applied
        - amendments_applied: List of applied amendment details
    """
    effective_min = original_min
    effective_max = original_max
    applied_amendments = []
    
    for amendment in amendments:
        # Filter by effective date
        if as_of_date is not None:
            eff_date = amendment.get('effective_date')
            if eff_date:
                # Convert string to date if needed
                if isinstance(eff_date, str):
                    try:
                        eff_date = date.fromisoformat(eff_date)
                    except ValueError:
                        eff_date = None
                if eff_date and eff_date > as_of_date:
                    continue  # Amendment not yet effective
        
        # Filter by contract year
        amendment_year = amendment.get('year')
        if contract_year is not None:
            # If contract_year specified, only apply amendments for that year or all years (None)
            if amendment_year is not None and amendment_year != contract_year:
                continue
        else:
            # If no contract_year filter, only apply amendments that apply to all years
            if amendment_year is not None:
                continue
        
        # Apply the amendment
        amendment_type = amendment.get('amendment_type')
        qty_change = amendment.get('quantity_change') or 0
        new_min = amendment.get('new_min_quantity')
        new_max = amendment.get('new_max_quantity')
        
        applied = False
        
        if amendment_type == 'increase_max':
            effective_max += qty_change
            applied = True
        elif amendment_type == 'decrease_max':
            effective_max = max(0, effective_max - qty_change)
            applied = True
        elif amendment_type == 'increase_min':
            effective_min += qty_change
            applied = True
        elif amendment_type == 'decrease_min':
            effective_min = max(0, effective_min - qty_change)
            applied = True
        elif amendment_type == 'set_min' and new_min is not None:
            effective_min = new_min
            applied = True
        elif amendment_type == 'set_max' and new_max is not None:
            effective_max = new_max
            applied = True
        
        if applied:
            applied_amendments.append({
                'type': amendment_type,
                'change': qty_change if amendment_type in ['increase_max', 'decrease_max', 'increase_min', 'decrease_min'] else None,
                'new_value': new_min or new_max if amendment_type in ['set_min', 'set_max'] else None,
                'reference': amendment.get('authority_reference'),
            })
    
    return {
        'min_quantity': effective_min,
        'max_quantity': effective_max,
        'amendment_count': len(applied_amendments),
        'amendments_applied': applied_amendments,
    }


def get_amendments_for_contract(db, contract_id: int, product_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get all authority amendments for a contract, optionally filtered by product.
    
    Args:
        db: Database session
        contract_id: Contract ID
        product_id: Optional product ID to filter by
        
    Returns:
        List of amendment dicts suitable for apply_amendments_to_product()
    """
    from app import models
    
    query = db.query(models.AuthorityAmendment).filter(
        models.AuthorityAmendment.contract_id == contract_id
    )
    
    if product_id:
        query = query.filter(models.AuthorityAmendment.product_id == product_id)
    
    amendments = query.order_by(models.AuthorityAmendment.id).all()
    
    return [
        {
            'amendment_type': a.amendment_type,
            'quantity_change': a.quantity_change,
            'new_min_quantity': a.new_min_quantity,
            'new_max_quantity': a.new_max_quantity,
            'effective_date': a.effective_date,
            'year': a.year,
            'authority_reference': a.authority_reference,
            'reason': a.reason,
        }
        for a in amendments
    ]


def get_effective_product_quantities(
    db,
    contract_id: int,
    product_id: int,
    original_min: float,
    original_max: float,
    optional_quantity: float = 0,
    as_of_date: Optional[date] = None,
    contract_year: Optional[int] = None,
    include_topup: bool = True,
) -> Dict[str, Any]:
    """
    Get effective quantities for a product including amendments and top-ups.
    
    This is the main function to use when you need the actual usable quantities
    for validation or display purposes.
    
    Args:
        db: Database session
        contract_id: Contract ID
        product_id: Product ID
        original_min: Original min quantity from contract
        original_max: Original max quantity from contract
        optional_quantity: Optional quantity on top of max
        as_of_date: Calculate effective values as of this date
        contract_year: Calculate for specific contract year
        include_topup: Whether to include authority top-ups in max calculation
        
    Returns:
        Dict with:
        - original_min: Original min from contract
        - original_max: Original max from contract
        - effective_min: Min after amendments
        - effective_max: Max after amendments
        - max_with_optional: effective_max + optional
        - max_with_topup: max_with_optional + authority top-ups
        - total_amendment_delta_min: Net change to min from amendments
        - total_amendment_delta_max: Net change to max from amendments
        - amendment_count: Number of amendments applied
    """
    # Get amendments for this product
    amendments = get_amendments_for_contract(db, contract_id, product_id)
    
    # Apply amendments
    amended = apply_amendments_to_product(
        original_min=original_min,
        original_max=original_max,
        amendments=amendments,
        as_of_date=as_of_date,
        contract_year=contract_year,
    )
    
    # Get authority top-ups if requested
    topup_qty = 0
    if include_topup:
        topup_qty = get_authority_topup_for_product(db, contract_id, product_id=product_id)
    
    return {
        'original_min': original_min,
        'original_max': original_max,
        'effective_min': amended['min_quantity'],
        'effective_max': amended['max_quantity'],
        'max_with_optional': amended['max_quantity'] + optional_quantity,
        'max_with_topup': amended['max_quantity'] + optional_quantity + topup_qty,
        'optional_quantity': optional_quantity,
        'authority_topup': topup_qty,
        'total_amendment_delta_min': amended['min_quantity'] - original_min,
        'total_amendment_delta_max': amended['max_quantity'] - original_max,
        'amendment_count': amended['amendment_count'],
        'is_amended': amended['amendment_count'] > 0,
    }


def get_effective_contract_quantities(
    db,
    contract,
    as_of_date: Optional[date] = None,
    contract_year: Optional[int] = None,
    include_topup: bool = True,
) -> Dict[str, Any]:
    """
    Get effective quantities for an entire contract including all products.
    
    Args:
        db: Database session
        contract: Contract model with contract_products loaded
        as_of_date: Calculate effective values as of this date
        contract_year: Calculate for specific contract year
        include_topup: Whether to include authority top-ups
        
    Returns:
        Dict with:
        - products: List of product dicts with effective quantities
        - totals: Aggregate totals across all products
    """
    products_data = []
    total_original_min = 0
    total_original_max = 0
    total_effective_min = 0
    total_effective_max = 0
    total_optional = 0
    total_topup = 0
    total_amendments = 0
    
    for cp in contract.contract_products:
        original_min = cp.original_min_quantity or cp.min_quantity or 0
        original_max = cp.original_max_quantity or cp.max_quantity or 0
        optional_qty = cp.optional_quantity or 0
        
        effective = get_effective_product_quantities(
            db=db,
            contract_id=contract.id,
            product_id=cp.product_id,
            original_min=original_min,
            original_max=original_max,
            optional_quantity=optional_qty,
            as_of_date=as_of_date,
            contract_year=contract_year,
            include_topup=include_topup,
        )
        
        product_name = cp.product.name if cp.product else f"Product {cp.product_id}"
        
        products_data.append({
            'name': product_name,
            'product_id': cp.product_id,
            **effective,
        })
        
        total_original_min += original_min
        total_original_max += original_max
        total_effective_min += effective['effective_min']
        total_effective_max += effective['effective_max']
        total_optional += optional_qty
        total_topup += effective['authority_topup']
        total_amendments += effective['amendment_count']
    
    return {
        'products': products_data,
        'totals': {
            'original_min': total_original_min,
            'original_max': total_original_max,
            'effective_min': total_effective_min,
            'effective_max': total_effective_max,
            'max_with_optional': total_effective_max + total_optional,
            'max_with_topup': total_effective_max + total_optional + total_topup,
            'optional_quantity': total_optional,
            'authority_topup': total_topup,
            'amendment_count': total_amendments,
            'is_amended': total_amendments > 0,
        }
    }

