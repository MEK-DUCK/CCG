from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, List, Union
from datetime import date, datetime
from app.models import ContractType, ContractCategory, CargoStatus, PaymentMethod, LCStatus
import re
import html


def sanitize_text(value: Optional[str]) -> Optional[str]:
    """
    Sanitize text input to prevent XSS and remove control characters.
    - Strips HTML tags
    - Removes null bytes and control characters (except newline, tab)
    - Escapes remaining HTML entities
    """
    if value is None:
        return None

    # Remove null bytes and control characters (except \n, \r, \t)
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)

    # Strip HTML tags
    value = re.sub(r'<[^>]*>', '', value)

    # Escape any remaining HTML entities for safety
    value = html.escape(value, quote=False)

    return value.strip() if value else value


class SanitizedModel(BaseModel):
    """Base model that sanitizes all string fields."""

    @model_validator(mode='before')
    @classmethod
    def sanitize_strings(cls, values):
        """Sanitize all string values in the model."""
        if isinstance(values, dict):
            for key, val in values.items():
                if isinstance(val, str):
                    values[key] = sanitize_text(val)
        return values

# Product Schemas (for admin-managed product configuration)
class ProductBase(SanitizedModel):
    code: str = Field(..., min_length=1, max_length=20, description="Short code e.g., JETA1")
    name: str = Field(..., min_length=1, max_length=64, description="Display name e.g., JET A-1")
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True, description="Whether product is available for new contracts")
    sort_order: int = Field(0, ge=0, description="Display order in dropdowns")

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

class Product(ProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Load Port Schemas (for admin-managed port configuration)
class LoadPortBase(SanitizedModel):
    code: str = Field(..., min_length=1, max_length=10, description="Short code e.g., MAA")
    name: str = Field(..., min_length=1, max_length=100, description="Full name e.g., Mina Al Ahmadi")
    country: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True, description="Whether port is available for selection")
    sort_order: int = Field(0, ge=0, description="Display order in dropdowns")

class LoadPortCreate(LoadPortBase):
    pass

class LoadPortUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=10)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    country: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

class LoadPort(LoadPortBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Inspector Schemas (for admin-managed inspector configuration)
class InspectorBase(SanitizedModel):
    code: str = Field(..., min_length=1, max_length=20, description="Short code e.g., SGS")
    name: str = Field(..., min_length=1, max_length=100, description="Full name e.g., SGS SA")
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True, description="Whether inspector is available for selection")
    sort_order: int = Field(0, ge=0, description="Display order in dropdowns")

class InspectorCreate(InspectorBase):
    pass

class InspectorUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

class Inspector(InspectorBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Discharge Port Schemas (for admin-managed CIF discharge port configuration)
class DischargePortBase(SanitizedModel):
    name: str = Field(..., min_length=1, max_length=100, description="Port name e.g., Shell Haven, Rotterdam")
    restrictions: Optional[str] = Field(None, description="Full restriction text for TNG memo")
    voyage_days_suez: Optional[int] = Field(None, ge=0, description="Voyage duration via Suez route (days)")
    voyage_days_cape: Optional[int] = Field(None, ge=0, description="Voyage duration via Cape route (days)")
    is_active: bool = Field(True, description="Whether port is available for selection")
    sort_order: int = Field(0, ge=0, description="Display order in dropdowns")

class DischargePortCreate(DischargePortBase):
    pass

class DischargePortUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    restrictions: Optional[str] = None
    voyage_days_suez: Optional[int] = Field(None, ge=0)
    voyage_days_cape: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

class DischargePort(DischargePortBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Customer Schemas
class CustomerBase(SanitizedModel):
    name: str = Field(..., min_length=1, max_length=255)

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)

class Customer(CustomerBase):
    id: int
    customer_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Per-year quantity for multi-year contracts
class YearQuantity(BaseModel):
    year: int = Field(..., ge=1)  # Contract year (1, 2, 3, etc.)
    # Fixed quantity mode (legacy/simple)
    quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Fixed quantity for this year in KT (max 10M)
    optional_quantity: Optional[float] = Field(0, ge=0, le=10000000)  # Optional quantity for this year in KT (max 10M)
    # Min/Max quantity mode (range-based)
    min_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Minimum quantity for this year in KT (max 10M)
    max_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Maximum quantity for this year in KT (max 10M)


# Contract Product Schema (for products array in contract)
class ContractProduct(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)  # JET A-1, GASOIL, GASOIL 10PPM, HFO, LSFO
    # Fixed quantity mode (legacy/simple) - total_quantity = fixed amount, optional_quantity = extra allowed
    total_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Total fixed quantity in KT (max 10M)
    optional_quantity: Optional[float] = Field(0, ge=0, le=10000000)  # Optional quantity in KT (max 10M)
    # Min/Max quantity mode (range-based) - customer can lift anywhere between min and max
    min_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Minimum contract quantity in KT (max 10M)
    max_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Maximum contract quantity in KT (max 10M)
    # Per-year breakdown (for multi-year contracts)
    year_quantities: Optional[List[YearQuantity]] = None  # Per-year quantities for multi-year contracts
    # Original quantities (before amendments) - read-only, set by backend
    original_min_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Original min before amendments (max 10M)
    original_max_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Original max before amendments (max 10M)
    original_year_quantities: Optional[List[YearQuantity]] = None  # Original per-year quantities
    
    @model_validator(mode="after")
    def _validate_quantity_mode(self):
        """Ensure either fixed or min/max mode is used, not both mixed incorrectly."""
        has_fixed = self.total_quantity is not None and self.total_quantity > 0
        has_minmax = (self.min_quantity is not None and self.min_quantity > 0) or \
                     (self.max_quantity is not None and self.max_quantity > 0)
        
        # Allow both for backward compatibility - fixed mode takes precedence if both set
        # If min/max mode, validate min <= max
        if has_minmax and self.min_quantity is not None and self.max_quantity is not None:
            if self.min_quantity > self.max_quantity:
                raise ValueError(f"min_quantity ({self.min_quantity}) cannot be greater than max_quantity ({self.max_quantity})")
        
        return self


# Authority Amendment Schema (for mid-contract min/max adjustments)
class AuthorityAmendment(BaseModel):
    """
    Represents an authorized amendment to contract quantities mid-contract.
    Used when customer receives authority to adjust min/max quantities.
    """
    product_name: str = Field(..., min_length=1, max_length=64)  # Must match a product in the contract
    amendment_type: str = Field(..., pattern="^(increase_max|decrease_max|increase_min|decrease_min|set_min|set_max)$")
    # Either specify the change amount OR the new absolute value
    quantity_change: Optional[float] = Field(None, le=10000000)  # Amount to add/subtract (positive value, max 10M)
    new_min_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # New absolute min value (if set_min, max 10M)
    new_max_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # New absolute max value (if set_max, max 10M)
    authority_reference: str = Field(..., min_length=1, max_length=100)  # Reference number
    reason: Optional[str] = Field(None, max_length=500)  # Reason for the amendment
    effective_date: Optional[str] = None  # When the amendment takes effect
    year: Optional[int] = Field(None, ge=1)  # Specific contract year affected (None = all years)


# Authority Top-Up Schema (for authorized quantity increases beyond contract)
class AuthorityTopUp(BaseModel):
    """
    Represents an authorized top-up quantity beyond the original contract.
    Used when customer gets authority to load more than contracted amount.
    """
    product_name: str = Field(..., min_length=1, max_length=64)  # Must match a product in the contract
    quantity: float = Field(..., gt=0, le=10000000)  # Top-up quantity in KT (must be positive, max 10M)
    authority_reference: str = Field(..., min_length=1, max_length=100)  # Reference number (e.g., AUTH-2024-001)
    reason: str | None = Field(default=None, max_length=500)  # Reason for the top-up
    authorization_date: str | None = None  # Date of authorization (renamed to avoid conflict, stored as string in JSON)
    month: int | None = None  # Month of the cargo
    year: int | None = None  # Year of the cargo
    monthly_plan_id: int | None = None  # Reference to the monthly plan


# Authority Top-Up Request for Monthly Plan (cargo-level top-up)
class AuthorityTopUpRequest(BaseModel):
    """
    Request to add authority top-up to a specific monthly plan cargo.
    Used when authorization is received to load more than originally planned.
    """
    quantity: float = Field(..., gt=0, le=10000000)  # Additional quantity in KT (max 10M)
    authority_reference: str = Field(..., min_length=1, max_length=100)  # Reference number
    reason: str | None = Field(default=None, max_length=500)  # Reason for the top-up
    authorization_date: date | None = None  # Date of authorization (renamed to avoid conflict)

# Contract Schemas
class ContractBase(SanitizedModel):
    contract_number: str = Field(..., min_length=1, max_length=255)
    contract_type: ContractType
    contract_category: Optional[ContractCategory] = ContractCategory.TERM  # TERM, SEMI_TERM, or SPOT
    payment_method: Optional[PaymentMethod] = None  # T/T or LC
    start_period: date
    end_period: date
    fiscal_start_month: Optional[int] = Field(1, ge=1, le=12)  # When Q1 starts (1=Jan, 7=Jul, etc.)
    products: List[ContractProduct] = Field(..., min_length=1)  # At least one product required
    authority_amendments: Optional[List[AuthorityAmendment]] = None  # Mid-contract min/max adjustments
    discharge_ranges: Optional[str] = Field(None, max_length=10000)
    additives_required: Optional[bool] = None
    fax_received: Optional[bool] = None
    fax_received_date: Optional[date] = None
    concluded_memo_received: Optional[bool] = None
    concluded_memo_received_date: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=10000)
    # CIF Tonnage Memo lead days (25 or 30 typically)
    tng_lead_days: Optional[int] = Field(None, ge=1, le=90)
    # TNG-specific notes for tonnage memo generation
    tng_notes: Optional[str] = Field(None, max_length=10000)
    # CIF base destination for delivery window calculation
    cif_destination: Optional[str] = None

    @model_validator(mode="after")
    def _validate_contract_period(self):
        if self.start_period and self.end_period and self.start_period > self.end_period:
            raise ValueError("start_period must be on or before end_period")
        return self
    
    @model_validator(mode="after")
    def _validate_fiscal_month_alignment(self):
        """For TERM/SEMI_TERM, fiscal_start_month should align with start_period month."""
        if self.contract_category != ContractCategory.SPOT and self.fiscal_start_month:
            # If fiscal_start_month is not provided, default to start_period month
            if self.start_period and self.fiscal_start_month == 1:
                # Auto-align to start_period month if using default
                pass  # Allow default, will be set in backend if needed
        return self

class ContractCreate(ContractBase):
    customer_id: int

class ContractUpdate(BaseModel):
    contract_number: Optional[str] = Field(None, min_length=1, max_length=255)
    contract_type: Optional[ContractType] = None
    contract_category: Optional[ContractCategory] = None
    payment_method: Optional[PaymentMethod] = None
    start_period: Optional[date] = None
    end_period: Optional[date] = None
    fiscal_start_month: Optional[int] = Field(None, ge=1, le=12)
    products: Optional[List[ContractProduct]] = None
    authority_amendments: Optional[List[AuthorityAmendment]] = None  # Mid-contract min/max adjustments
    discharge_ranges: Optional[str] = Field(None, max_length=10000)
    additives_required: Optional[bool] = None
    fax_received: Optional[bool] = None
    fax_received_date: Optional[date] = None
    concluded_memo_received: Optional[bool] = None
    concluded_memo_received_date: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=10000)
    tng_lead_days: Optional[int] = Field(None, ge=1, le=90)  # CIF Tonnage Memo lead days
    tng_notes: Optional[str] = Field(None, max_length=10000)  # TNG-specific notes
    cif_destination: Optional[str] = None  # CIF base destination
    customer_id: Optional[int] = None
    version: Optional[int] = None  # Optimistic locking - send to detect conflicts

    @model_validator(mode="after")
    def _validate_contract_period(self):
        # Partial updates: only validate if both are provided in payload
        if self.start_period is not None and self.end_period is not None and self.start_period > self.end_period:
            raise ValueError("start_period must be on or before end_period")
        return self

class Contract(ContractBase):
    id: int
    contract_id: str
    customer_id: int
    version: int = 1  # Optimistic locking version
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Quarterly Plan Schemas
class QuarterlyPlanBase(BaseModel):
    product_name: Optional[str] = None  # Product name - makes quarterly plan product-specific
    contract_year: Optional[int] = Field(1, ge=1)  # Which year of the contract (1, 2, etc.)
    q1_quantity: float = Field(0, ge=0, le=10000000)  # Max 10M KT
    q2_quantity: float = Field(0, ge=0, le=10000000)  # Max 10M KT
    q3_quantity: float = Field(0, ge=0, le=10000000)  # Max 10M KT
    q4_quantity: float = Field(0, ge=0, le=10000000)  # Max 10M KT
    adjustment_notes: Optional[str] = None  # Notes about deferred/advanced quantities

class QuarterlyPlanCreate(QuarterlyPlanBase):
    contract_id: int

class QuarterlyPlanUpdate(BaseModel):
    product_name: Optional[str] = None
    contract_year: Optional[int] = Field(None, ge=1)
    q1_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    q2_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    q3_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    q4_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    adjustment_notes: Optional[str] = None  # Notes about deferred/advanced quantities
    version: Optional[int] = None  # Optimistic locking - send to detect conflicts

class QuarterlyPlan(QuarterlyPlanBase):
    id: int
    contract_id: int
    version: int = 1  # Optimistic locking version
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Monthly Plan Schemas
class MonthlyPlanBase(SanitizedModel):
    month: int = Field(..., ge=1, le=12)
    year: int
    month_quantity: float = Field(..., ge=0, le=10000000)  # Max 10M KT
    number_of_liftings: int = Field(1, ge=0)
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None  # For FOB contracts only
    laycan_2_days: Optional[str] = None  # For FOB contracts only
    laycan_2_days_remark: Optional[str] = Field(None, max_length=10000)
    loading_month: Optional[str] = None  # For CIF contracts only (planning)
    loading_window: Optional[str] = None  # For CIF contracts only
    cif_route: Optional[str] = None  # SUEZ or CAPE - for delivery window calculation
    delivery_month: Optional[str] = None  # For CIF contracts only (planning)
    delivery_window: Optional[str] = None  # For CIF contracts only
    delivery_window_remark: Optional[str] = Field(None, max_length=10000)
    combi_group_id: Optional[str] = None  # UUID to link combi monthly plans (multiple products, same vessel/laycan)
    product_name: Optional[str] = None  # Product name - stored for ALL contract types (TERM, SPOT, SEMI_TERM)
    # Authority Top-Up fields
    authority_topup_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Additional KT authorized (max 10M)
    authority_topup_reference: Optional[str] = Field(None, max_length=100)  # Reference number
    authority_topup_reason: Optional[str] = Field(None, max_length=500)  # Reason for top-up
    authority_topup_date: Optional[date] = None  # Date of authorization
    # Tonnage Memo (TNG) tracking for CIF contracts
    tng_issued: Optional[bool] = False  # Whether TNG has been issued
    tng_issued_date: Optional[date] = None  # Date TNG was issued
    tng_issued_initials: Optional[str] = Field(None, max_length=10)  # Initials of user who issued TNG
    tng_revised: Optional[bool] = False  # Whether TNG has been revised
    tng_revised_date: Optional[date] = None  # Date TNG was revised
    tng_revised_initials: Optional[str] = Field(None, max_length=10)  # Initials of user who revised TNG
    tng_remarks: Optional[str] = Field(None, max_length=1000)  # Notes about the TNG
    # Move tracking fields (for deferred/advanced plans)
    original_month: Optional[int] = None  # Original month before first move
    original_year: Optional[int] = None  # Original year before first move
    last_move_authority_reference: Optional[str] = None  # Authority ref for last cross-quarter move
    last_move_reason: Optional[str] = None  # Reason for last move
    last_move_date: Optional[date] = None  # Date of last move
    last_move_action: Optional[str] = None  # DEFER or ADVANCE

class MonthlyPlanCreate(MonthlyPlanBase):
    quarterly_plan_id: Optional[int] = None  # Optional - only for TERM contracts
    contract_id: Optional[int] = None  # Required for SPOT/RANGE, set from quarterly_plan for TERM
    
    @model_validator(mode="after")
    def _validate_plan_link(self):
        """Either quarterly_plan_id OR contract_id must be provided.
        
        For TERM contracts: quarterly_plan_id is provided, contract_id is set by backend
        For SPOT/RANGE contracts: contract_id is provided directly
        """
        if self.quarterly_plan_id is None and self.contract_id is None:
            raise ValueError("Either quarterly_plan_id or contract_id must be provided")
        return self

class MonthlyPlanUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    year: Optional[int] = None
    month_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    number_of_liftings: Optional[int] = Field(None, ge=0)
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None
    laycan_2_days: Optional[str] = None
    laycan_2_days_remark: Optional[str] = Field(None, max_length=10000)
    loading_month: Optional[str] = None
    loading_window: Optional[str] = None
    cif_route: Optional[str] = None  # SUEZ or CAPE
    delivery_month: Optional[str] = None
    delivery_window: Optional[str] = None
    delivery_window_remark: Optional[str] = Field(None, max_length=10000)
    combi_group_id: Optional[str] = None
    product_name: Optional[str] = None
    # Authority Top-Up fields
    authority_topup_quantity: Optional[float] = Field(None, ge=0, le=10000000)  # Max 10M KT
    authority_topup_reference: Optional[str] = Field(None, max_length=100)
    authority_topup_reason: Optional[str] = Field(None, max_length=500)
    authority_topup_date: Optional[date] = None
    # Tonnage Memo (TNG) tracking for CIF contracts
    tng_issued: Optional[bool] = None
    tng_issued_date: Optional[date] = None
    tng_issued_initials: Optional[str] = Field(None, max_length=10)
    tng_revised: Optional[bool] = None
    tng_revised_date: Optional[date] = None
    tng_revised_initials: Optional[str] = Field(None, max_length=10)
    tng_remarks: Optional[str] = Field(None, max_length=1000)
    version: Optional[int] = None  # Optimistic locking - send to detect conflicts

class MonthlyPlan(MonthlyPlanBase):
    id: int
    quarterly_plan_id: Optional[int] = None  # Optional - only set for TERM contracts
    contract_id: int  # Required - ALL monthly plans must have a contract
    version: int = 1  # Optimistic locking version
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Monthly Plan Move Schema (for defer/advance actions)
class MonthlyPlanMoveRequest(BaseModel):
    action: str = Field(..., pattern="^(DEFER|ADVANCE)$")  # DEFER or ADVANCE
    target_month: int = Field(..., ge=1, le=12)
    target_year: int = Field(..., ge=2020, le=2100)
    reason: Optional[str] = Field(None, max_length=500)  # Reason for the move (required for cross-quarter)
    authority_reference: Optional[str] = Field(None, max_length=100)  # Required for cross-quarter moves


# Enriched schemas for bulk queries (with embedded related data)
class CustomerEmbedded(BaseModel):
    """Minimal customer info for embedding in other schemas"""
    id: int
    customer_id: str
    name: str
    
    class Config:
        from_attributes = True


class ContractEmbedded(BaseModel):
    """Contract with embedded customer info for bulk queries"""
    id: int
    contract_id: str
    contract_number: str
    contract_type: ContractType
    contract_category: Optional[ContractCategory] = ContractCategory.TERM
    payment_method: Optional[PaymentMethod] = None
    start_period: date
    end_period: date
    fiscal_start_month: Optional[int] = 1
    products: List[ContractProduct]
    tng_lead_days: Optional[int] = None  # CIF Tonnage Memo lead days
    tng_notes: Optional[str] = None  # TNG-specific notes
    cif_destination: Optional[str] = None  # CIF base destination for delivery window
    customer_id: int
    customer: Optional[CustomerEmbedded] = None
    
    @model_validator(mode="before")
    @classmethod
    def parse_products_json(cls, data):
        """Parse products from JSON string if needed (database stores as JSON string)"""
        import json
        if isinstance(data, dict):
            products = data.get("products")
            if isinstance(products, str):
                try:
                    data["products"] = json.loads(products)
                except (json.JSONDecodeError, TypeError):
                    data["products"] = []
        elif hasattr(data, "products"):
            # Handle SQLAlchemy model object
            products = getattr(data, "products", None)
            if isinstance(products, str):
                try:
                    # Create a dict from the model and parse products
                    obj_dict = {
                        "id": data.id,
                        "contract_id": data.contract_id,
                        "contract_number": data.contract_number,
                        "contract_type": data.contract_type,
                        "payment_method": data.payment_method,
                        "start_period": data.start_period,
                        "end_period": data.end_period,
                        "products": json.loads(products),
                        "tng_lead_days": getattr(data, "tng_lead_days", None),
                        "tng_notes": getattr(data, "tng_notes", None),
                        "cif_destination": getattr(data, "cif_destination", None),
                        "customer_id": data.customer_id,
                        "customer": data.customer if hasattr(data, "customer") else None,
                    }
                    return obj_dict
                except (json.JSONDecodeError, TypeError):
                    pass
        return data
    
    class Config:
        from_attributes = True


class QuarterlyPlanEmbedded(BaseModel):
    """Quarterly plan with embedded contract info for bulk queries"""
    id: int
    product_name: Optional[str] = None
    contract_year: Optional[int] = 1  # Which year of the contract
    q1_quantity: float = 0
    q2_quantity: float = 0
    q3_quantity: float = 0
    q4_quantity: float = 0
    contract_id: int
    contract: Optional[ContractEmbedded] = None
    
    class Config:
        from_attributes = True


class MonthlyPlanEnriched(MonthlyPlanBase):
    """Monthly plan with embedded quarterly plan and contract info for bulk queries"""
    id: int
    quarterly_plan_id: Optional[int] = None  # Optional - only set for TERM contracts
    contract_id: int  # Required - ALL monthly plans must have a contract
    product_name: Optional[str] = None  # Product name - stored for ALL contract types
    version: int = 1  # Optimistic locking version
    created_at: datetime
    updated_at: Optional[datetime] = None
    quarterly_plan: Optional[QuarterlyPlanEmbedded] = None
    contract: Optional[ContractEmbedded] = None  # Embedded contract info
    
    class Config:
        from_attributes = True


# Cargo Schemas
class CargoBase(SanitizedModel):
    vessel_name: str
    load_ports: str
    inspector_name: Optional[str] = None
    cargo_quantity: float = Field(..., gt=0, le=10000000)  # Max 10M KT
    laycan_window: Optional[str] = None
    # Manual vessel operation fields
    eta: Optional[str] = None  # ETA (manual entry)
    berthed: Optional[str] = None  # Berthed (manual entry)
    commenced: Optional[str] = None  # Commenced (manual entry)
    etc: Optional[str] = None  # ETC - Estimated Time of Completion (manual entry)
    # Legacy fields kept for backward compatibility
    eta_load_port: Optional[datetime] = None
    loading_start_time: Optional[datetime] = None
    loading_completion_time: Optional[datetime] = None
    etd_load_port: Optional[datetime] = None
    eta_discharge_port: Optional[str] = None  # Free text field for ETA like "Dec 20" or "20/12"
    discharge_port_location: Optional[str] = None
    discharge_completion_time: Optional[datetime] = None
    # CIF In-Road tracking fields
    five_nd_date: Optional[str] = None  # ND Due Date: Due date for narrowing down delivery window
    nd_completed: Optional[bool] = False  # ND Completed checkbox - removes highlight when checked
    nd_days: Optional[str] = None  # ND Days selection (3 Days, 5 Days, 7 Days, 10 Days)
    nd_delivery_window: Optional[str] = None  # Narrowed Down Delivery Window (actual dates)
    notes: Optional[str] = None
    # Completion tracking fields
    sailing_fax_entry_completed: Optional[bool] = False
    sailing_fax_entry_initials: Optional[str] = None
    sailing_fax_entry_date: Optional[datetime] = None
    documents_mailing_completed: Optional[bool] = False
    documents_mailing_initials: Optional[str] = None
    documents_mailing_date: Optional[datetime] = None
    inspector_invoice_completed: Optional[bool] = False
    inspector_invoice_initials: Optional[str] = None
    inspector_invoice_date: Optional[datetime] = None
    lc_status: Optional[LCStatus] = None  # LC status (only for LC payment method contracts)

class CargoCreate(CargoBase):
    customer_id: int
    product_name: str  # Product name from contract's products list
    contract_id: int
    monthly_plan_id: int
    combi_group_id: Optional[str] = None  # UUID to link combi cargos together


# Cross-Contract Combi Cargo Schemas
class CrossContractCombiCargoItem(BaseModel):
    """Individual cargo item within a cross-contract combi"""
    contract_id: int
    monthly_plan_id: int
    product_name: str
    cargo_quantity: float = Field(..., gt=0, le=10000000)  # Max 10M KT


class CrossContractCombiCreate(BaseModel):
    """
    Create a cross-contract combi cargo - multiple products from different contracts
    sharing the same vessel, load ports, and timing.
    
    Requirements:
    - All contracts must belong to the same customer
    - All contracts must be the same type (FOB or CIF)
    - All monthly plans must be for the same month/year
    """
    customer_id: int
    vessel_name: str
    load_ports: str
    inspector_name: Optional[str] = None
    laycan_window: Optional[str] = None
    notes: Optional[str] = None
    # Individual cargo items (one per contract/product)
    cargo_items: List[CrossContractCombiCargoItem] = Field(..., min_length=2)
    
    @model_validator(mode="after")
    def _validate_multiple_contracts(self):
        """Ensure at least 2 different contracts are involved"""
        if self.cargo_items:
            contract_ids = set(item.contract_id for item in self.cargo_items)
            if len(contract_ids) < 2:
                raise ValueError("Cross-contract combi must include products from at least 2 different contracts")
        return self


class CrossContractCombiResponse(BaseModel):
    """Response for cross-contract combi creation"""
    combi_group_id: str
    cargos: List["Cargo"]
    message: str

class CargoUpdate(BaseModel):
    vessel_name: Optional[str] = None
    load_ports: Optional[str] = None
    inspector_name: Optional[str] = None
    cargo_quantity: Optional[float] = Field(None, gt=0, le=10000000)  # Max 10M KT
    laycan_window: Optional[str] = None
    # Manual vessel operation fields
    eta: Optional[str] = None  # ETA (manual entry)
    berthed: Optional[str] = None  # Berthed (manual entry)
    commenced: Optional[str] = None  # Commenced (manual entry)
    etc: Optional[str] = None  # ETC - Estimated Time of Completion (manual entry)
    # Legacy fields kept for backward compatibility
    eta_load_port: Optional[datetime] = None
    loading_start_time: Optional[datetime] = None
    loading_completion_time: Optional[datetime] = None
    etd_load_port: Optional[datetime] = None
    eta_discharge_port: Optional[str] = None  # Free text field for ETA like "Dec 20" or "20/12"
    discharge_port_location: Optional[str] = None
    discharge_completion_time: Optional[datetime] = None
    # CIF In-Road tracking fields
    five_nd_date: Optional[str] = None  # ND Due Date: Due date for narrowing down delivery window
    nd_completed: Optional[bool] = None  # ND Completed checkbox - removes highlight when checked
    nd_days: Optional[str] = None  # ND Days selection (3 Days, 5 Days, 7 Days, 10 Days)
    nd_delivery_window: Optional[str] = None  # Narrowed Down Delivery Window (actual dates)
    status: Optional[CargoStatus] = None
    notes: Optional[str] = None
    # Accept empty string from UI; router converts '' -> None before writing to DB.
    lc_status: Optional[Union[LCStatus, str]] = None  # LC status - EXACT duplicate of status pattern
    # Completion tracking fields
    sailing_fax_entry_completed: Optional[bool] = None
    sailing_fax_entry_initials: Optional[str] = None
    sailing_fax_entry_date: Optional[datetime] = None
    documents_mailing_completed: Optional[bool] = None
    documents_mailing_initials: Optional[str] = None
    documents_mailing_date: Optional[datetime] = None
    inspector_invoice_completed: Optional[bool] = None
    inspector_invoice_initials: Optional[str] = None
    inspector_invoice_date: Optional[datetime] = None
    # Optimistic locking - client must send current version to prevent lost updates
    version: Optional[int] = None

class Cargo(CargoBase):
    id: int
    cargo_id: str
    customer_id: int
    product_name: str
    contract_id: int
    contract_type: ContractType
    status: CargoStatus
    monthly_plan_id: int
    combi_group_id: Optional[str] = None  # UUID to link combi cargos together
    version: int = 1  # Optimistic locking version
    created_at: datetime
    updated_at: Optional[datetime] = None
    port_operations: Optional[List["CargoPortOperation"]] = None
    
    # Broadcast status (optional, included when real-time sync is attempted)
    broadcast_success: Optional[int] = None  # Number of users successfully notified
    broadcast_failures: Optional[int] = None  # Number of notification failures
    
    class Config:
        from_attributes = True
        use_enum_values = True


class CargoPortOperationBase(BaseModel):
    port_code: str = Field(..., min_length=1, max_length=8)
    status: str = Field("Planned")  # Planned | Loading | Completed Loading
    eta: Optional[str] = None
    berthed: Optional[str] = None
    commenced: Optional[str] = None
    etc: Optional[str] = None
    notes: Optional[str] = None


class CargoPortOperationCreate(CargoPortOperationBase):
    pass


class CargoPortOperationUpdate(BaseModel):
    status: Optional[str] = None
    eta: Optional[str] = None
    berthed: Optional[str] = None
    commenced: Optional[str] = None
    etc: Optional[str] = None
    notes: Optional[str] = None


class CargoPortOperation(CargoPortOperationBase):
    id: int
    cargo_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Resolve forward refs (Cargo.port_operations)
Cargo.model_rebuild()

# Cargo Audit Log Schemas
class CargoAuditLog(BaseModel):
    id: int
    cargo_id: Optional[int] = None
    cargo_db_id: Optional[int] = None
    cargo_cargo_id: str
    action: str  # 'CREATE', 'UPDATE', 'DELETE', 'MOVE'
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    old_monthly_plan_id: Optional[int] = None
    new_monthly_plan_id: Optional[int] = None
    old_month: Optional[int] = None
    old_year: Optional[int] = None
    new_month: Optional[int] = None
    new_year: Optional[int] = None
    description: Optional[str] = None
    created_at: datetime
    cargo_snapshot: Optional[str] = None
    
    class Config:
        from_attributes = True

# Monthly Plan Audit Log Schemas
class MonthlyPlanAuditLog(BaseModel):
    id: int
    monthly_plan_id: Optional[int] = None
    monthly_plan_db_id: Optional[int] = None
    action: str  # 'CREATE', 'UPDATE', 'DELETE', 'DEFER', 'ADVANCE'
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    contract_id: Optional[int] = None
    contract_number: Optional[str] = None
    contract_name: Optional[str] = None
    quarterly_plan_id: Optional[int] = None
    product_name: Optional[str] = None  # Product name from quarterly plan
    description: Optional[str] = None
    created_at: datetime
    monthly_plan_snapshot: Optional[str] = None
    user_initials: Optional[str] = None  # User who made the change
    
    class Config:
        from_attributes = True

# Quarterly Plan Audit Log Schemas
class QuarterlyPlanAuditLog(BaseModel):
    id: int
    quarterly_plan_id: Optional[int] = None
    quarterly_plan_db_id: Optional[int] = None
    action: str  # 'CREATE', 'UPDATE', 'DELETE'
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    contract_id: Optional[int] = None
    contract_number: Optional[str] = None
    contract_name: Optional[str] = None
    product_name: Optional[str] = None  # Product name from quarterly plan
    description: Optional[str] = None
    created_at: datetime
    quarterly_plan_snapshot: Optional[str] = None
    user_initials: Optional[str] = None  # User who made the change
    
    class Config:
        from_attributes = True


# Weekly Quantity Comparison Schemas (Reconciliation helper)
class WeeklyQuantityMonth(BaseModel):
    month: int
    previous_quantity: float
    current_quantity: float
    delta: float
    remark: Optional[str] = None


class WeeklyQuantityContract(BaseModel):
    contract_id: int
    contract_number: Optional[str] = None
    contract_name: Optional[str] = None
    product_name: Optional[str] = None  # Product name for per-product filtering
    months: List[WeeklyQuantityMonth]
    previous_total: float
    current_total: float
    delta_total: float


class WeeklyQuantityComparisonResponse(BaseModel):
    year: int
    previous_week_start: datetime
    previous_week_end: datetime
    generated_at: datetime
    contracts: List[WeeklyQuantityContract]


# =============================================================================
# AUTH/USER SCHEMAS
# =============================================================================

from app.models import UserRole, UserStatus

class UserBase(SanitizedModel):
    email: str = Field(..., description="User email address")
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name")
    initials: str = Field(..., min_length=2, max_length=4, description="User initials for audit logs (e.g., MEK)")
    role: UserRole = Field(UserRole.USER, description="User role")

class UserCreate(UserBase):
    """Schema for admin creating a new user (no password - user sets it via invite)"""
    pass

class UserUpdate(BaseModel):
    """Schema for updating user details"""
    email: Optional[str] = None
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    initials: Optional[str] = Field(None, min_length=2, max_length=4)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None

class User(UserBase):
    """Full user schema for responses"""
    id: int
    status: UserStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    created_by_id: Optional[int] = None
    
    class Config:
        from_attributes = True

class UserPublic(BaseModel):
    """Public user info (no sensitive data)"""
    id: int
    email: str
    full_name: str
    initials: str
    role: UserRole
    status: UserStatus
    
    class Config:
        from_attributes = True

# Auth request/response schemas
class LoginRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., min_length=1, description="User password")

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None  # For new login flow
    token_type: str = "bearer"
    expires_in: Optional[int] = None  # Seconds until access token expires
    user: UserPublic


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token"""
    refresh_token: str = Field(..., description="Refresh token from login")


def validate_password_strength(password: str) -> str:
    """
    Validate password meets security requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r'[A-Z]', password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r'[a-z]', password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r'\d', password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'`~]', password):
        raise ValueError("Password must contain at least one special character (!@#$%^&*etc.)")
    return password


class SetPasswordRequest(BaseModel):
    """For setting password via invite or reset token"""
    token: str = Field(..., description="Invite or reset token")
    password: str = Field(..., min_length=8, description="New password (min 8 chars, with uppercase, lowercase, digit, and special char)")

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="User email")

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars, with uppercase, lowercase, digit, and special char)")

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        return validate_password_strength(v)

class MessageResponse(BaseModel):
    message: str
    success: bool = True


# =============================================================================
# ADMIN UPDATE SCHEMAS - with strict validation
# =============================================================================

class AdminContractUpdate(SanitizedModel):
    """Schema for admin contract updates with validation."""
    contract_number: Optional[str] = Field(None, min_length=1, max_length=100)
    contract_type: Optional[str] = Field(None, description="Contract type enum value")
    payment_method: Optional[str] = Field(None, description="Payment method enum value")
    start_period: Optional[date] = None
    end_period: Optional[date] = None
    products: Optional[List[dict]] = None
    remarks: Optional[str] = Field(None, max_length=1000)
    discharge_ranges: Optional[str] = Field(None, max_length=500)
    additives_required: Optional[bool] = None
    fax_received: Optional[bool] = None
    concluded_memo_received: Optional[bool] = None

    @field_validator('contract_type')
    @classmethod
    def validate_contract_type(cls, v):
        if v is not None:
            valid_values = [e.value for e in ContractType]
            if v not in valid_values:
                raise ValueError(f"Invalid contract_type. Must be one of: {valid_values}")
        return v

    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v):
        if v is not None:
            valid_values = [e.value for e in PaymentMethod]
            if v not in valid_values:
                raise ValueError(f"Invalid payment_method. Must be one of: {valid_values}")
        return v

    @model_validator(mode='after')
    def validate_dates(self):
        if self.start_period and self.end_period:
            if self.end_period < self.start_period:
                raise ValueError("end_period must be after start_period")
        return self


class AdminQuarterlyPlanUpdate(SanitizedModel):
    """Schema for admin quarterly plan updates with validation."""
    product_name: Optional[str] = Field(None, min_length=1, max_length=64)
    q1_quantity: Optional[float] = Field(None, ge=0, description="Q1 quantity must be non-negative")
    q2_quantity: Optional[float] = Field(None, ge=0, description="Q2 quantity must be non-negative")
    q3_quantity: Optional[float] = Field(None, ge=0, description="Q3 quantity must be non-negative")
    q4_quantity: Optional[float] = Field(None, ge=0, description="Q4 quantity must be non-negative")
    q1_topup: Optional[float] = Field(None, ge=0, description="Q1 topup must be non-negative")
    q2_topup: Optional[float] = Field(None, ge=0, description="Q2 topup must be non-negative")
    q3_topup: Optional[float] = Field(None, ge=0, description="Q3 topup must be non-negative")
    q4_topup: Optional[float] = Field(None, ge=0, description="Q4 topup must be non-negative")
    contract_id: Optional[int] = Field(None, gt=0, description="Contract ID must be positive")


class AdminMonthlyPlanUpdate(SanitizedModel):
    """Schema for admin monthly plan updates with validation."""
    month: Optional[int] = Field(None, ge=1, le=12, description="Month must be 1-12")
    year: Optional[int] = Field(None, ge=2000, le=2100, description="Year must be between 2000-2100")
    month_quantity: Optional[float] = Field(None, ge=0, description="Month quantity must be non-negative")
    number_of_liftings: Optional[int] = Field(None, ge=0, le=100, description="Number of liftings must be 0-100")
    laycan_5_days: Optional[str] = Field(None, max_length=100)
    laycan_2_days: Optional[str] = Field(None, max_length=100)
    laycan_2_days_remark: Optional[str] = Field(None, max_length=500)
    loading_month: Optional[str] = Field(None, max_length=50)
    loading_window: Optional[str] = Field(None, max_length=100)
    delivery_month: Optional[str] = Field(None, max_length=50)
    delivery_window: Optional[str] = Field(None, max_length=100)
    delivery_window_remark: Optional[str] = Field(None, max_length=500)
    combi_group_id: Optional[str] = Field(None, max_length=50)
    quarterly_plan_id: Optional[int] = Field(None, gt=0, description="Quarterly plan ID must be positive")
    authority_topup_quantity: Optional[float] = Field(None, ge=0, description="Authority topup must be non-negative")
    authority_topup_reference: Optional[str] = Field(None, max_length=100)
    authority_topup_reason: Optional[str] = Field(None, max_length=500)
    authority_topup_date: Optional[date] = None


class AdminCargoUpdate(SanitizedModel):
    """Schema for admin cargo updates with validation."""
    vessel_name: Optional[str] = Field(None, min_length=1, max_length=100)
    product_name: Optional[str] = Field(None, min_length=1, max_length=64)
    cargo_quantity: Optional[float] = Field(None, ge=0, description="Cargo quantity must be non-negative")
    status: Optional[str] = Field(None, description="Cargo status enum value")
    load_ports: Optional[str] = Field(None, max_length=200, description="Comma-separated port codes")
    laycan_window: Optional[str] = Field(None, max_length=100)
    eta: Optional[str] = Field(None, max_length=100)
    berthed: Optional[str] = Field(None, max_length=100)
    commenced: Optional[str] = Field(None, max_length=100)
    etc: Optional[str] = Field(None, max_length=100)
    lc_status: Optional[str] = Field(None, description="LC status enum value")
    combi_group_id: Optional[str] = Field(None, max_length=50)
    inspector_name: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    monthly_plan_id: Optional[int] = Field(None, gt=0, description="Monthly plan ID must be positive")
    contract_id: Optional[int] = Field(None, gt=0, description="Contract ID must be positive")
    customer_id: Optional[int] = Field(None, gt=0, description="Customer ID must be positive")

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v is not None:
            valid_values = [e.value for e in CargoStatus]
            if v not in valid_values:
                raise ValueError(f"Invalid status. Must be one of: {valid_values}")
        return v

    @field_validator('lc_status')
    @classmethod
    def validate_lc_status(cls, v):
        if v is not None:
            valid_values = [e.value for e in LCStatus]
            if v not in valid_values:
                raise ValueError(f"Invalid lc_status. Must be one of: {valid_values}")
        return v


class AdminCustomerUpdate(SanitizedModel):
    """Schema for admin customer updates with validation."""
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="Customer name")


# Row Highlight Schemas (for shared team highlights in port movement)
class RowHighlightBase(BaseModel):
    row_key: str = Field(..., min_length=1, max_length=100, description="Unique row identifier")
    note: Optional[str] = Field(None, max_length=500, description="Optional note for the highlight")

class RowHighlightCreate(RowHighlightBase):
    pass

class RowHighlight(RowHighlightBase):
    id: int
    highlighted_by_id: Optional[int] = None
    highlighted_by_initials: Optional[str] = None
    highlighted_at: datetime

    class Config:
        from_attributes = True

class RowHighlightList(BaseModel):
    """Response schema for list of highlighted row keys."""
    row_keys: list[str]

