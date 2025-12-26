"""
Fiscal Year Utility Functions

Handles calculations for contracts with non-calendar fiscal years.
For example, a contract starting in July would have:
- Q1 = Jul-Sep
- Q2 = Oct-Dec  
- Q3 = Jan-Mar (next calendar year)
- Q4 = Apr-Jun (next calendar year)
"""

from datetime import date
from typing import Tuple, List, Optional
from calendar import monthrange


def get_quarter_months(fiscal_start_month: int, quarter: int) -> Tuple[int, int, int]:
    """
    Get the three months that make up a quarter based on fiscal start month.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        quarter: Quarter number (1-4)
    
    Returns:
        Tuple of (month1, month2, month3) where each is 1-12
    
    Example:
        get_quarter_months(7, 1) -> (7, 8, 9)  # Q1 for July start
        get_quarter_months(7, 3) -> (1, 2, 3)  # Q3 for July start (Jan-Mar)
    """
    base_month = fiscal_start_month + (quarter - 1) * 3
    
    month1 = ((base_month - 1) % 12) + 1
    month2 = ((base_month) % 12) + 1
    month3 = ((base_month + 1) % 12) + 1
    
    return (month1, month2, month3)


def get_quarter_year(fiscal_start_month: int, quarter: int, contract_start_year: int, contract_year: int = 1) -> int:
    """
    Get the calendar year for the first month of a quarter.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        quarter: Quarter number (1-4)
        contract_start_year: Calendar year when the contract started
        contract_year: Which year of the contract (1, 2, etc.)
    
    Returns:
        Calendar year for the first month of the quarter
    
    Example:
        # Contract starts July 2025
        get_quarter_year(7, 1, 2025, 1) -> 2025  # Q1 Year 1 = Jul 2025
        get_quarter_year(7, 3, 2025, 1) -> 2026  # Q3 Year 1 = Jan 2026
        get_quarter_year(7, 1, 2025, 2) -> 2026  # Q1 Year 2 = Jul 2026
    """
    # Base offset from contract year
    year_offset = contract_year - 1
    
    # Calculate how many months into the fiscal year this quarter starts
    months_offset = (quarter - 1) * 3
    
    # Calculate the actual month
    actual_month = fiscal_start_month + months_offset
    
    # If we've wrapped past December, add a year
    if actual_month > 12:
        year_offset += 1
    
    return contract_start_year + year_offset


def get_month_calendar_year(fiscal_start_month: int, month: int, contract_start_year: int, contract_year: int = 1) -> int:
    """
    Get the calendar year for a specific month in a contract.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        month: The month number (1-12)
        contract_start_year: Calendar year when the contract started
        contract_year: Which year of the contract (1, 2, etc.)
    
    Returns:
        Calendar year for that month
    """
    # Calculate base year from contract year
    base_year = contract_start_year + (contract_year - 1)
    
    # If the month is before the fiscal start month, it's in the next calendar year
    if month < fiscal_start_month:
        return base_year + 1
    
    return base_year


def get_quarter_for_month(fiscal_start_month: int, month: int) -> int:
    """
    Get which quarter a month falls into based on fiscal start month.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        month: The month number (1-12)
    
    Returns:
        Quarter number (1-4)
    
    Example:
        get_quarter_for_month(7, 8) -> 1   # August is in Q1 for July start
        get_quarter_for_month(7, 1) -> 3   # January is in Q3 for July start
        get_quarter_for_month(1, 4) -> 2   # April is in Q2 for January start
    """
    # Calculate months from fiscal start
    months_from_start = (month - fiscal_start_month) % 12
    
    # Each quarter is 3 months
    return (months_from_start // 3) + 1


def get_quarter_display(
    fiscal_start_month: int, 
    quarter: int, 
    contract_start_year: int, 
    contract_year: int = 1
) -> str:
    """
    Get a display string for a quarter.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        quarter: Quarter number (1-4)
        contract_start_year: Calendar year when the contract started
        contract_year: Which year of the contract (1, 2, etc.)
    
    Returns:
        Display string like "Q1 (Jul-Sep 2025)" or "Year 2 Q3 (Jan-Mar 2027)"
    
    Example:
        get_quarter_display(7, 1, 2025, 1) -> "Q1 (Jul-Sep 2025)"
        get_quarter_display(7, 3, 2025, 1) -> "Q3 (Jan-Mar 2026)"
        get_quarter_display(7, 1, 2025, 2) -> "Year 2 Q1 (Jul-Sep 2026)"
    """
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    m1, m2, m3 = get_quarter_months(fiscal_start_month, quarter)
    year = get_quarter_year(fiscal_start_month, quarter, contract_start_year, contract_year)
    
    # Format: "Jul-Sep 2025"
    month_range = f"{month_names[m1-1]}-{month_names[m3-1]} {year}"
    
    # Include year prefix if multi-year contract
    if contract_year > 1:
        return f"Year {contract_year} Q{quarter} ({month_range})"
    else:
        return f"Q{quarter} ({month_range})"


def calculate_contract_duration_months(start_date: date, end_date: date) -> int:
    """
    Calculate the duration of a contract in months.
    
    Args:
        start_date: Contract start date
        end_date: Contract end date
    
    Returns:
        Number of months (rounded up for partial months)
    """
    months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month) + 1
    return max(1, months)


def calculate_contract_years(start_date: date, end_date: date) -> int:
    """
    Calculate how many contract years are needed.
    
    Args:
        start_date: Contract start date
        end_date: Contract end date
    
    Returns:
        Number of contract years (1, 2, etc.)
    """
    months = calculate_contract_duration_months(start_date, end_date)
    # Each contract year is 12 months, round up
    return (months + 11) // 12


def generate_quarterly_plan_periods(
    fiscal_start_month: int,
    start_year: int,
    num_contract_years: int
) -> List[dict]:
    """
    Generate the quarterly plan periods for a contract.
    
    Args:
        fiscal_start_month: Month when Q1 starts (1-12)
        start_year: Calendar year when contract starts
        num_contract_years: Number of contract years
    
    Returns:
        List of dicts with period info:
        [
            {"contract_year": 1, "quarter": 1, "months": (7, 8, 9), "year": 2025},
            {"contract_year": 1, "quarter": 2, "months": (10, 11, 12), "year": 2025},
            ...
        ]
    """
    periods = []
    
    for contract_year in range(1, num_contract_years + 1):
        for quarter in range(1, 5):
            months = get_quarter_months(fiscal_start_month, quarter)
            year = get_quarter_year(fiscal_start_month, quarter, start_year, contract_year)
            
            periods.append({
                "contract_year": contract_year,
                "quarter": quarter,
                "months": months,
                "year": year,
                "display": get_quarter_display(fiscal_start_month, quarter, start_year, contract_year)
            })
    
    return periods


def generate_monthly_plan_periods(
    fiscal_start_month: int,
    start_year: int,
    num_months: int
) -> List[dict]:
    """
    Generate monthly plan periods for a contract.
    
    Args:
        fiscal_start_month: Month when contract starts (1-12)
        start_year: Calendar year when contract starts
        num_months: Number of months in the contract
    
    Returns:
        List of dicts with month info:
        [
            {"month": 7, "year": 2025, "quarter": 1, "contract_year": 1},
            {"month": 8, "year": 2025, "quarter": 1, "contract_year": 1},
            ...
        ]
    """
    periods = []
    current_month = fiscal_start_month
    current_year = start_year
    
    for i in range(num_months):
        # Calculate which contract year and quarter this month is in
        contract_year = (i // 12) + 1
        quarter = get_quarter_for_month(fiscal_start_month, current_month)
        
        periods.append({
            "month": current_month,
            "year": current_year,
            "quarter": quarter,
            "contract_year": contract_year
        })
        
        # Move to next month
        current_month += 1
        if current_month > 12:
            current_month = 1
            current_year += 1
    
    return periods

