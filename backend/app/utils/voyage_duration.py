"""
Voyage duration configuration and delivery window calculation utilities.

Trip durations are from first day of loading window to destination,
including 2-day laycan allowance.
"""

from datetime import date, timedelta
from calendar import monthrange
from typing import Optional, Tuple
from sqlalchemy.orm import Session

# List of valid routes
CIF_ROUTES = ["SUEZ", "CAPE"]

# Single-route destinations (no route selection needed, same-month delivery allowed)
# These destinations only have a Suez route with short voyage duration
SINGLE_ROUTE_DESTINATIONS = ["Djibouti", "Keamari/Fotco"]


def is_single_route_destination(destination: str) -> bool:
    """
    Check if a destination is a single-route destination.
    Single-route destinations don't require route selection and allow same-month delivery.

    Args:
        destination: Destination port name

    Returns:
        True if single-route destination, False otherwise
    """
    return destination in SINGLE_ROUTE_DESTINATIONS


def get_single_route_voyage_duration(destination: str, db: Session = None) -> Optional[int]:
    """
    Get voyage duration for a single-route destination.

    Args:
        destination: Destination port name
        db: SQLAlchemy database session (optional)

    Returns:
        Number of days for the voyage, or None if not found
    """
    if db is None:
        return None

    from app import models

    discharge_port = db.query(models.DischargePort).filter(
        models.DischargePort.name == destination
    ).first()

    if not discharge_port:
        return None

    # For single-route destinations, return the suez duration (the only available route)
    return discharge_port.voyage_days_suez


def get_voyage_duration(destination: str, route: str, db: Session = None) -> Optional[int]:
    """
    Get voyage duration in days for a destination and route.

    Fetches from database if db session provided, otherwise returns None.
    For single-route destinations, returns the available route duration regardless of route param.

    Args:
        destination: Destination port name (e.g., "Rotterdam", "Milford Haven")
        route: Route name ("SUEZ" or "CAPE") - ignored for single-route destinations
        db: SQLAlchemy database session (optional)

    Returns:
        Number of days for the voyage, or None if not found
    """
    if db is None:
        return None

    from app import models

    discharge_port = db.query(models.DischargePort).filter(
        models.DischargePort.name == destination
    ).first()

    if not discharge_port:
        return None

    # For single-route destinations, return the only available route (suez)
    if is_single_route_destination(destination):
        return discharge_port.voyage_days_suez

    if route and route.upper() == "SUEZ":
        return discharge_port.voyage_days_suez
    elif route and route.upper() == "CAPE":
        return discharge_port.voyage_days_cape

    return None


def get_voyage_duration_from_port(discharge_port, route: str) -> Optional[int]:
    """
    Get voyage duration from a DischargePort model instance.

    Args:
        discharge_port: DischargePort model instance
        route: Route name ("SUEZ" or "CAPE") - ignored for single-route destinations

    Returns:
        Number of days for the voyage, or None if not found
    """
    if not discharge_port:
        return None

    # For single-route destinations, return the only available route (suez)
    if is_single_route_destination(discharge_port.name):
        return discharge_port.voyage_days_suez

    if route and route.upper() == "SUEZ":
        return discharge_port.voyage_days_suez
    elif route and route.upper() == "CAPE":
        return discharge_port.voyage_days_cape

    return None


def parse_loading_window_start(loading_window: str, month: int, year: int) -> Optional[date]:
    """
    Parse the first day from a loading window string.
    
    Supports formats:
    - "01-05/01" (DD-DD/MM)
    - "1-5/1" (D-D/M)
    - "15-20" (DD-DD, uses provided month/year)
    
    Args:
        loading_window: Loading window string
        month: Reference month (1-12)
        year: Reference year
    
    Returns:
        First day of loading window as date, or None if parsing fails
    """
    if not loading_window:
        return None
    
    loading_window = loading_window.strip()
    
    try:
        # Format: "DD-DD/MM" or "D-D/M"
        if "/" in loading_window:
            parts = loading_window.split("/")
            day_part = parts[0]  # "01-05" or "1-5"
            month_part = parts[1]  # "01" or "1"
            
            # Get first day
            first_day = int(day_part.split("-")[0])
            parsed_month = int(month_part)
            
            # Determine year - if parsed month < reference month, it might be next year
            parsed_year = year
            if parsed_month < month:
                parsed_year = year + 1
            
            return date(parsed_year, parsed_month, first_day)
        
        # Format: "DD-DD" (use reference month/year)
        elif "-" in loading_window:
            first_day = int(loading_window.split("-")[0])
            return date(year, month, first_day)
        
        # Single day
        else:
            first_day = int(loading_window)
            return date(year, month, first_day)
            
    except (ValueError, IndexError):
        return None


def calculate_delivery_window(
    loading_window: str,
    destination: str,
    route: str,
    month: int,
    year: int,
    db: Session = None
) -> Optional[str]:
    """
    Calculate the delivery window based on loading window, destination, and route.
    
    Formula logic:
    - Delivery Start = First day of Loading + Trip Duration
    - Delivery End = Delivery Start + 14 days
    - If same month: "(StartDay-EndDay/Month)"
    - If cross-month: Use last 15 days of delivery start month
    
    Args:
        loading_window: Loading window string (e.g., "01-05/01")
        destination: Destination port name
        route: Route name ("SUEZ" or "CAPE")
        month: Reference month for loading window parsing
        year: Reference year for loading window parsing
        db: SQLAlchemy database session (optional)
    
    Returns:
        Delivery window string (e.g., "(9-23/2)"), or None if calculation fails
    """
    # Get voyage duration from database
    duration = get_voyage_duration(destination, route, db)
    if duration is None:
        return None
    
    # Parse loading window start date
    loading_start = parse_loading_window_start(loading_window, month, year)
    if loading_start is None:
        return None
    
    # Calculate delivery dates
    delivery_start = loading_start + timedelta(days=duration)
    delivery_end = loading_start + timedelta(days=duration + 14)
    
    # Check if same month
    if delivery_start.month == delivery_end.month:
        # Same month: (StartDay-EndDay/Month)
        return f"({delivery_start.day}-{delivery_end.day}/{delivery_start.month})"
    else:
        # Cross-month: Use last 15 days of delivery start month
        _, last_day_of_month = monthrange(delivery_start.year, delivery_start.month)
        adjusted_start = last_day_of_month - 14  # 15 days from end
        return f"({adjusted_start}-{last_day_of_month}/{delivery_start.month})"

