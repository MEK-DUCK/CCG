"""
SQLAlchemy models for the Oil Lifting Program.
"""
from typing import Optional
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum, Text, Boolean, UniqueConstraint, CheckConstraint, Index, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

# Cross-database JSON type: uses JSONB on PostgreSQL, JSON on SQLite
JSONType = JSON().with_variant(JSONB, 'postgresql')
from sqlalchemy.sql import func
from app.database import Base
import enum


# =============================================================================
# ENUMS
# =============================================================================

class ContractType(str, enum.Enum):
    FOB = "FOB"
    CIF = "CIF"


class ContractCategory(str, enum.Enum):
    """Contract duration category."""
    TERM = "TERM"           # 1-2 years, full quarterly planning
    SEMI_TERM = "SEMI_TERM" # 3-9 months, partial year
    SPOT = "SPOT"           # Single cargo, 1 month or less


class PaymentMethod(str, enum.Enum):
    TT = "T/T"
    LC = "LC"


class LCStatus(str, enum.Enum):
    """LC payment status for contracts with LC payment method."""
    PENDING_LC = "Pending LC"
    LC_IN_ORDER = "LC in Order"
    LC_NOT_IN_ORDER = "LC Not in Order"
    LC_MEMO_ISSUED = "LC Memo Issued"
    FINANCIAL_HOLD = "Financial Hold"


class CargoStatus(str, enum.Enum):
    """Cargo lifecycle status."""
    PLANNED = "Planned"
    LOADING = "Loading"
    COMPLETED_LOADING = "Completed Loading"
    DISCHARGE_COMPLETE = "Discharge Complete"
    PENDING_NOMINATION = "Pending Nomination"
    PENDING_TL_APPROVAL = "Pending TL Approval"
    NOMINATION_RELEASED = "Nomination Released"


class UserRole(str, enum.Enum):
    """User role for access control."""
    ADMIN = "admin"
    USER = "user"


class UserStatus(str, enum.Enum):
    """User account status."""
    PENDING = "pending"      # Invited but hasn't set password
    ACTIVE = "active"        # Normal active user
    INACTIVE = "inactive"    # Deactivated by admin


# =============================================================================
# CONFIGURATION MODELS
# =============================================================================

class Product(Base):
    """
    Product configuration - defines available products for contracts and cargos.
    Admin can add/edit/delete products through the admin interface.
    """
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)  # Short code e.g., "JETA1"
    name = Column(String(64), unique=True, nullable=False)  # Display name e.g., "JET A-1"
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)  # Can be deactivated instead of deleted
    sort_order = Column(Integer, default=0)  # For display ordering
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contract_products = relationship("ContractProduct", back_populates="product")


class LoadPort(Base):
    """
    Load port configuration - defines available loading ports.
    Admin can add/edit/delete ports through the admin interface.
    """
    __tablename__ = "load_ports"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False, index=True)  # Short code e.g., "MAA"
    name = Column(String(100), unique=True, nullable=False)  # Full name e.g., "Mina Al Ahmadi"
    country = Column(String(50), nullable=True)  # Country name
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Inspector(Base):
    """
    Inspector/Surveyor configuration - defines available inspection companies.
    Admin can add/edit/delete inspectors through the admin interface.
    """
    __tablename__ = "inspectors"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)  # Short code e.g., "SGS"
    name = Column(String(100), unique=True, nullable=False)  # Full name e.g., "SGS SA"
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class DischargePort(Base):
    """
    Discharge port configuration for CIF contracts.
    Stores port restrictions for TNG memos and voyage durations for delivery window calculation.
    Admin can add/edit/delete discharge ports through the admin interface.
    """
    __tablename__ = "discharge_ports"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)  # Port name e.g., "Shell Haven", "Rotterdam"
    restrictions = Column(Text, nullable=True)  # Full restriction text for TNG memo
    voyage_days_suez = Column(Integer, nullable=True)  # Voyage duration via Suez route (days from loading)
    voyage_days_cape = Column(Integer, nullable=True)  # Voyage duration via Cape route (days from loading)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# =============================================================================
# USER/AUTH MODELS
# =============================================================================

class User(Base):
    """
    User account for authentication and audit tracking.
    Users can only be created by admins (no public registration).
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)  # Null until user sets password
    full_name = Column(String(255), nullable=False)
    initials = Column(String(4), unique=True, nullable=False, index=True)  # For audit logs
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    status = Column(Enum(UserStatus), default=UserStatus.PENDING, nullable=False)
    
    # Invite/password reset token
    invite_token = Column(String(255), nullable=True, unique=True)
    invite_token_expires = Column(DateTime(timezone=True), nullable=True)
    password_reset_token = Column(String(255), nullable=True, unique=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Who created this user (SET NULL if creator is deleted)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


# =============================================================================
# CORE MODELS
# =============================================================================

class Customer(Base):
    """Customer/buyer entity."""
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, unique=True, index=True)  # System generated (e.g., CUST-XXXX)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    contracts = relationship("Contract", back_populates="customer", cascade="all, delete-orphan")


class Contract(Base):
    """
    Sales contract with a customer.
    Contains one or more products with quantities via ContractProduct relationship.
    """
    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint('end_period >= start_period', name='chk_contracts_date_range'),
        CheckConstraint('fiscal_start_month >= 1 AND fiscal_start_month <= 12', name='chk_contracts_fiscal_month'),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(String, unique=True, index=True)  # System generated
    contract_number = Column(String, nullable=False)
    contract_type = Column(Enum(ContractType), nullable=False)
    payment_method = Column(Enum(PaymentMethod), nullable=True)
    start_period = Column(Date, nullable=False)
    end_period = Column(Date, nullable=False)
    
    # Fiscal year support - when does Q1 start for this contract?
    # Default 1 (January) for backward compatibility
    fiscal_start_month = Column(Integer, nullable=True, default=1)  # 1-12
    
    # Contract category for different planning needs
    # Default TERM for backward compatibility
    contract_category = Column(Enum(ContractCategory), nullable=True, default=ContractCategory.TERM)
    
    discharge_ranges = Column(Text, nullable=True)  # Free-form notes
    additives_required = Column(Boolean, nullable=True)  # For JET A-1 contracts
    fax_received = Column(Boolean, nullable=True)
    fax_received_date = Column(Date, nullable=True)
    concluded_memo_received = Column(Boolean, nullable=True)
    concluded_memo_received_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    
    # CIF Tonnage Memo (TNG) lead days - how many days before loading window to issue TNG
    # Only applicable for CIF contracts (25 or 30 days typically)
    tng_lead_days = Column(Integer, nullable=True)
    # TNG-specific notes for tonnage memo generation (separate from general contract notes)
    tng_notes = Column(Text, nullable=True)
    
    # CIF Delivery Window calculation - base destination for voyage duration lookup
    # Options: Rotterdam, Le Havre, Shell Haven, Naples, Milford Haven
    cif_destination = Column(String, nullable=True)

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)


    # Optimistic locking - prevents lost updates in concurrent edits
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    customer = relationship("Customer", back_populates="contracts")
    quarterly_plans = relationship("QuarterlyPlan", back_populates="contract", cascade="all, delete-orphan")
    # New normalized relationships
    contract_products = relationship("ContractProduct", back_populates="contract", cascade="all, delete-orphan", order_by="ContractProduct.id")
    authority_amendments = relationship("AuthorityAmendment", back_populates="contract", cascade="all, delete-orphan", order_by="AuthorityAmendment.id")
    
    def get_products_list(self):
        """Convert contract_products relationship to list of dicts for API compatibility."""
        return [cp.to_dict() for cp in self.contract_products]
    
    def get_amendments_list(self):
        """Convert authority_amendments relationship to list of dicts for API compatibility."""
        return [aa.to_dict() for aa in self.authority_amendments] if self.authority_amendments else None


class ContractProduct(Base):
    """
    Product allocation within a contract.
    Links contracts to products with quantity information.
    Replaces the old JSON products column for proper relational storage.

    Original quantities store the base contract values before any amendments.
    Current quantities (min_quantity, max_quantity) are the effective values
    that should be calculated dynamically from original + amendments.
    """
    __tablename__ = "contract_products"
    __table_args__ = (
        UniqueConstraint('contract_id', 'product_id', name='uq_contract_products_contract_product'),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    
    # Fixed quantity mode (legacy/simple)
    total_quantity = Column(Float, nullable=True)  # Total fixed quantity in KT
    optional_quantity = Column(Float, nullable=True, default=0)  # Optional quantity in KT
    
    # Min/Max quantity mode (range-based) - these are the ORIGINAL contract values
    min_quantity = Column(Float, nullable=True)  # Original minimum contract quantity in KT
    max_quantity = Column(Float, nullable=True)  # Original maximum contract quantity in KT
    
    # Original quantities preserved for audit/reference (populated from initial contract values)
    # These remain unchanged even when amendments are applied
    original_min_quantity = Column(Float, nullable=True)  # Original min before any amendments
    original_max_quantity = Column(Float, nullable=True)  # Original max before any amendments
    original_year_quantities = Column(JSONType, nullable=True)  # Original per-year quantities

    # Per-year breakdown stored as JSONB (PostgreSQL) or JSON (SQLite) for flexibility
    # Format: [{"year": 1, "quantity": 500, "min_quantity": 200, "max_quantity": 600}, ...]
    year_quantities = Column(JSONType, nullable=True)  # JSON array for per-year quantities
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contract = relationship("Contract", back_populates="contract_products")
    product = relationship("Product", back_populates="contract_products")
    
    def to_dict(self, include_originals: bool = True):
        """Convert to dict format matching the old JSON structure for API compatibility.

        Args:
            include_originals: If True, include original_min/max quantities for UI display
        """
        result = {
            "name": self.product.name,
            "product_id": self.product_id,  # Include product_id for normalized lookups
        }

        if self.total_quantity is not None:
            result["total_quantity"] = self.total_quantity
        if self.optional_quantity is not None and self.optional_quantity > 0:
            result["optional_quantity"] = self.optional_quantity
        if self.min_quantity is not None:
            result["min_quantity"] = self.min_quantity
        if self.max_quantity is not None:
            result["max_quantity"] = self.max_quantity
        if self.year_quantities:
            # JSONB returns Python objects directly, no parsing needed
            result["year_quantities"] = self.year_quantities

        # Include original quantities for audit/display purposes
        if include_originals:
            if self.original_min_quantity is not None:
                result["original_min_quantity"] = self.original_min_quantity
            if self.original_max_quantity is not None:
                result["original_max_quantity"] = self.original_max_quantity
            if self.original_year_quantities:
                # JSONB returns Python objects directly, no parsing needed
                result["original_year_quantities"] = self.original_year_quantities

        return result


class AuthorityAmendment(Base):
    """
    Authority amendment for mid-contract quantity adjustments.
    Replaces the old JSON authority_amendments column.
    """
    __tablename__ = "authority_amendments"
    __table_args__ = (
        CheckConstraint(
            "amendment_type IN ('increase_max', 'decrease_max', 'increase_min', 'decrease_min', 'set_min', 'set_max')",
            name='chk_amendment_type'
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    
    amendment_type = Column(String(20), nullable=False)  # increase_max, decrease_max, increase_min, decrease_min, set_min, set_max
    quantity_change = Column(Float, nullable=True)  # Amount to add/subtract
    new_min_quantity = Column(Float, nullable=True)  # New absolute min value (if set_min)
    new_max_quantity = Column(Float, nullable=True)  # New absolute max value (if set_max)
    authority_reference = Column(String(100), nullable=False)  # Reference number
    reason = Column(String(500), nullable=True)  # Reason for the amendment
    effective_date = Column(Date, nullable=True)  # When the amendment takes effect
    year = Column(Integer, nullable=True)  # Specific contract year affected (None = all years)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contract = relationship("Contract", back_populates="authority_amendments")
    product = relationship("Product")
    
    def to_dict(self):
        """Convert to dict format matching the old JSON structure for API compatibility."""
        result = {
            "product_name": self.product.name,
            "amendment_type": self.amendment_type,
            "authority_reference": self.authority_reference,
        }
        
        if self.quantity_change is not None:
            result["quantity_change"] = self.quantity_change
        if self.new_min_quantity is not None:
            result["new_min_quantity"] = self.new_min_quantity
        if self.new_max_quantity is not None:
            result["new_max_quantity"] = self.new_max_quantity
        if self.reason:
            result["reason"] = self.reason
        if self.effective_date:
            result["effective_date"] = self.effective_date.isoformat()
        if self.year is not None:
            result["year"] = self.year
        
        return result


class QuarterlyPlan(Base):
    """
    Quarterly allocation plan for a contract.
    For multi-product contracts, there's one plan per product.
    Each QuarterlyPlan represents one contract year with 4 quarters.
    """
    __tablename__ = "quarterly_plans"
    __table_args__ = (
        CheckConstraint('q1_quantity >= 0', name='chk_quarterly_q1'),
        CheckConstraint('q2_quantity >= 0', name='chk_quarterly_q2'),
        CheckConstraint('q3_quantity >= 0', name='chk_quarterly_q3'),
        CheckConstraint('q4_quantity >= 0', name='chk_quarterly_q4'),
        CheckConstraint('contract_year >= 1', name='chk_quarterly_contract_year'),
        Index('idx_quarterly_plans_contract', 'contract_id'),
        Index('idx_quarterly_plans_product', 'product_id'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Foreign key to products table - normalized reference
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)

    # Contract year: 1, 2, etc. (which year of the contract)
    # Must be >= 1
    contract_year = Column(Integer, nullable=False, default=1)
    
    q1_quantity = Column(Float, default=0)
    q2_quantity = Column(Float, default=0)
    q3_quantity = Column(Float, default=0)
    q4_quantity = Column(Float, default=0)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    
    # Adjustment notes for deferred/advanced quantities
    # Format: "Includes 50 KT deferred from Q1 (AUTH-2025-007)"
    adjustment_notes = Column(Text, nullable=True)
    
    # Optimistic locking - prevents lost updates in concurrent edits
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    contract = relationship("Contract", back_populates="quarterly_plans")
    product = relationship("Product")
    monthly_plans = relationship("MonthlyPlan", back_populates="quarterly_plan", cascade="all, delete-orphan")


class MonthlyPlan(Base):
    """
    Monthly cargo plan within a quarterly plan.
    Contains laycan windows and delivery details.
    For SPOT contracts, can link directly to contract without quarterly plan.
    """
    __tablename__ = "monthly_plans"
    __table_args__ = (
        CheckConstraint('month >= 1 AND month <= 12', name='chk_monthly_plans_month'),
        CheckConstraint('year >= 2020 AND year <= 2100', name='chk_monthly_plans_year'),
        CheckConstraint('month_quantity >= 0', name='chk_monthly_plans_quantity'),
        Index('idx_monthly_plans_year_month', 'year', 'month'),
        Index('idx_monthly_plans_contract_year_month', 'contract_id', 'year', 'month'),
        Index('idx_monthly_plans_product', 'product_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)
    month_quantity = Column(Float, nullable=False)
    number_of_liftings = Column(Integer, default=1)
    planned_lifting_sizes = Column(Text)  # JSON string or comma-separated
    
    # FOB contract fields
    laycan_5_days = Column(String, nullable=True)
    laycan_2_days = Column(String, nullable=True)
    laycan_2_days_remark = Column(Text, nullable=True)
    
    # CIF contract fields
    loading_month = Column(String, nullable=True)
    loading_window = Column(String, nullable=True)
    cif_route = Column(String, nullable=True)  # SUEZ or CAPE - for delivery window calculation
    delivery_month = Column(String, nullable=True)
    delivery_window = Column(String, nullable=True)
    delivery_window_remark = Column(Text, nullable=True)
    
    # Combi cargo support - links multiple monthly plans for same vessel
    combi_group_id = Column(String, nullable=True, index=True)
    
    # Authority Top-Up: Additional quantity authorized for this specific cargo
    # Used when customer gets authority to load more than originally planned
    authority_topup_quantity = Column(Float, nullable=True, default=0)  # Additional KT authorized
    authority_topup_reference = Column(String, nullable=True)  # Reference number (e.g., AUTH-2025-001)
    authority_topup_reason = Column(Text, nullable=True)  # Reason for the top-up
    authority_topup_date = Column(Date, nullable=True)  # Date of authorization
    
    # Tonnage Memo (TNG) tracking for CIF contracts
    tng_issued = Column(Boolean, default=False)  # Whether TNG has been issued
    tng_issued_date = Column(Date, nullable=True)  # Date TNG was issued
    tng_issued_initials = Column(String(10), nullable=True)  # Initials of user who issued TNG
    tng_revised = Column(Boolean, default=False)  # Whether TNG has been revised
    tng_revised_date = Column(Date, nullable=True)  # Date TNG was revised
    tng_revised_initials = Column(String(10), nullable=True)  # Initials of user who revised TNG
    tng_remarks = Column(Text, nullable=True)  # Notes about the TNG
    
    # Move tracking - for deferred/advanced plans
    # Stores original month/year before any moves (for display indicator)
    original_month = Column(Integer, nullable=True)  # Original month before first move
    original_year = Column(Integer, nullable=True)  # Original year before first move
    last_move_authority_reference = Column(String(100), nullable=True)  # Authority ref for last cross-quarter move
    last_move_reason = Column(Text, nullable=True)  # Reason for last move
    last_move_date = Column(Date, nullable=True)  # Date of last move
    last_move_action = Column(String(10), nullable=True)  # DEFER or ADVANCE
    
    # Nullable for SPOT contracts that skip quarterly planning
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=True)
    
    # Direct contract link - ALL monthly plans must have a contract
    # For TERM contracts: set from quarterly_plan.contract_id
    # For SPOT/RANGE contracts: set directly
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    
    # Foreign key to products table - normalized reference
    # For multi-product contracts, identifies which product this monthly plan is for
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    
    # Optimistic locking - prevents lost updates in concurrent edits
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    quarterly_plan = relationship("QuarterlyPlan", back_populates="monthly_plans")
    contract = relationship("Contract", foreign_keys=[contract_id])
    product = relationship("Product")
    cargos = relationship("Cargo", back_populates="monthly_plan", cascade="all, delete-orphan")


class Cargo(Base):
    """
    Actual cargo/vessel assignment for a monthly plan.
    Tracks vessel details, loading operations, and status.
    """
    __tablename__ = "cargos"
    __table_args__ = (
        CheckConstraint('cargo_quantity > 0', name='chk_cargos_quantity'),
        Index('idx_cargos_status', 'status'),
        Index('idx_cargos_contract_id', 'contract_id'),
        Index('idx_cargos_customer_id', 'customer_id'),
        Index('idx_cargos_product_id', 'product_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(String, unique=True, index=True)  # System generated (e.g., CARGO-XXXX)
    vessel_name = Column(String, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    contract_type = Column(Enum(ContractType), nullable=False)
    
    # Combi cargo support - links multiple cargos sharing same vessel
    combi_group_id = Column(String, nullable=True, index=True)

    # LC status for contracts with LC payment method
    lc_status = Column(Enum(LCStatus), nullable=True)
    
    # NOTE: load_ports column REMOVED - now derived from port_operations relationship
    # Use cargo.get_load_ports_string() or cargo.port_operations for port data
    
    # Normalized FK to inspectors table (replaces old inspector_name string)
    inspector_id = Column(Integer, ForeignKey("inspectors.id"), nullable=True, index=True)
    
    cargo_quantity = Column(Float, nullable=False)
    laycan_window = Column(String)
    
    # Manual vessel operation fields
    eta = Column(String)
    berthed = Column(String)
    commenced = Column(String)
    etc = Column(String)  # Estimated Time of Completion
    
    # Legacy datetime fields - kept for backward compatibility
    eta_load_port = Column(DateTime, nullable=True)
    loading_start_time = Column(DateTime, nullable=True)
    loading_completion_time = Column(DateTime, nullable=True)
    etd_load_port = Column(DateTime, nullable=True)
    
    # CIF specific fields
    eta_discharge_port = Column(String, nullable=True)  # Free text field for ETA like "Dec 20" or "20/12"
    discharge_port_location = Column(String)
    discharge_completion_time = Column(DateTime)
    five_nd_date = Column(String, nullable=True)  # ND Due Date: Narrowing down due date
    nd_completed = Column(Boolean, default=False)  # ND Completed checkbox - removes highlight when checked
    nd_days = Column(String, nullable=True)  # ND Days selection (3 Days, 5 Days, 7 Days, 10 Days)
    nd_delivery_window = Column(String, nullable=True)  # Narrowed Down Delivery Window (actual dates)
    
    # Completion tracking
    sailing_fax_entry_completed = Column(Boolean, default=False)
    sailing_fax_entry_initials = Column(String)
    sailing_fax_entry_date = Column(DateTime)
    
    documents_mailing_completed = Column(Boolean, default=False)
    documents_mailing_initials = Column(String)
    documents_mailing_date = Column(DateTime)
    
    inspector_invoice_completed = Column(Boolean, default=False)
    inspector_invoice_initials = Column(String)
    inspector_invoice_date = Column(DateTime)
    
    status = Column(Enum(CargoStatus), default=CargoStatus.PLANNED)
    notes = Column(Text)
    
    monthly_plan_id = Column(Integer, ForeignKey("monthly_plans.id"), nullable=False, unique=True)
    
    
    # Optimistic locking - prevents lost updates in concurrent edits
    version = Column(Integer, nullable=False, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    monthly_plan = relationship("MonthlyPlan", back_populates="cargos")
    contract = relationship("Contract")
    customer = relationship("Customer")
    product = relationship("Product")
    inspector = relationship("Inspector")
    port_operations = relationship("CargoPortOperation", back_populates="cargo", cascade="all, delete-orphan")
    
    def get_load_ports_string(self) -> str:
        """Get load ports as comma-separated string for API compatibility."""
        if not self.port_operations:
            return ""
        # Sort by load_port.sort_order for consistent display
        sorted_ops = sorted(
            self.port_operations, 
            key=lambda op: (op.load_port.sort_order if op.load_port else 0, op.load_port_id)
        )
        return ",".join(op.load_port.code for op in sorted_ops if op.load_port)
    
    def get_load_port_ids(self) -> list:
        """Get list of load_port_ids for this cargo."""
        return [op.load_port_id for op in (self.port_operations or [])]
    
    def get_inspector_name(self) -> Optional[str]:
        """Get inspector name from relationship for API compatibility."""
        return self.inspector.name if self.inspector else None


class CargoPortOperation(Base):
    """
    Per-load-port operational tracking for a cargo.
    Allows tracking the same cargo independently across multiple load ports.
    This is now the SOURCE OF TRUTH for which ports a cargo is loading at.
    """
    __tablename__ = "cargo_port_operations"
    __table_args__ = (
        UniqueConstraint('cargo_id', 'load_port_id', name='uq_cargo_port_operations_cargo_port'),
        CheckConstraint("status IN ('Planned', 'Loading', 'Completed Loading')", name='chk_port_op_status'),
        Index('idx_cargo_port_ops_cargo', 'cargo_id'),
        Index('idx_cargo_port_ops_status', 'status'),
    )

    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargos.id", ondelete="CASCADE"), nullable=False, index=True)

    # Normalized FK to load_ports table (replaces old port_code string)
    load_port_id = Column(Integer, ForeignKey("load_ports.id"), nullable=False, index=True)

    # Per-port status - valid values: Planned, Loading, Completed Loading
    status = Column(String, nullable=False, default="Planned")

    # Per-port vessel operation fields
    eta = Column(String, nullable=True)
    berthed = Column(String, nullable=True)
    commenced = Column(String, nullable=True)
    etc = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    cargo = relationship("Cargo", back_populates="port_operations")
    load_port = relationship("LoadPort")


# =============================================================================
# AUDIT LOG MODELS
# =============================================================================

class CargoAuditLog(Base):
    """Audit log for cargo changes."""
    __tablename__ = "cargo_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=True)  # Nullable for deleted cargos
    cargo_db_id = Column(Integer, nullable=True, index=True)  # Stable ID for filtering after delete
    cargo_cargo_id = Column(String, index=True)  # Store cargo_id string for reference
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE, MOVE
    field_name = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    old_monthly_plan_id = Column(Integer, nullable=True)
    new_monthly_plan_id = Column(Integer, nullable=True)
    old_month = Column(Integer, nullable=True)
    old_year = Column(Integer, nullable=True)
    new_month = Column(Integer, nullable=True)
    new_year = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cargo_snapshot = Column(Text, nullable=True)  # JSON snapshot for deleted cargos
    
    # Authority reference for cross-quarter moves
    authority_reference = Column(String(100), nullable=True)
    
    # User tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True, index=True)
    

class MonthlyPlanAuditLog(Base):
    """Audit log for monthly plan changes."""
    __tablename__ = "monthly_plan_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    monthly_plan_id = Column(Integer, ForeignKey("monthly_plans.id"), nullable=True)
    monthly_plan_db_id = Column(Integer, nullable=True, index=True)
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE, DEFER, ADVANCE
    field_name = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    month = Column(Integer, nullable=True)
    year = Column(Integer, nullable=True)
    contract_id = Column(Integer, nullable=True)
    contract_number = Column(String, nullable=True)
    contract_name = Column(String, nullable=True)
    quarterly_plan_id = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    monthly_plan_snapshot = Column(Text, nullable=True)
    
    # Authority reference for cross-quarter moves
    authority_reference = Column(String(100), nullable=True)
    
    # User tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True, index=True)
    

class QuarterlyPlanAuditLog(Base):
    """Audit log for quarterly plan changes."""
    __tablename__ = "quarterly_plan_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=True)
    quarterly_plan_db_id = Column(Integer, nullable=True, index=True)
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE
    field_name = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    contract_id = Column(Integer, nullable=True)
    contract_number = Column(String, nullable=True)
    contract_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    quarterly_plan_snapshot = Column(Text, nullable=True)
    
    # User tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True, index=True)


class QuarterlyPlanAdjustment(Base):
    """
    Tracks authority-approved adjustments to quarterly plan quantities.
    Created when monthly plans are deferred/advanced across quarters.
    """
    __tablename__ = "quarterly_plan_adjustments"
    __table_args__ = (
        CheckConstraint(
            "adjustment_type IN ('DEFER_OUT', 'DEFER_IN', 'ADVANCE_OUT', 'ADVANCE_IN')",
            name='chk_adjustment_type'
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=False)
    
    # Adjustment details
    adjustment_type = Column(String(20), nullable=False)  # DEFER_OUT, DEFER_IN, ADVANCE_OUT, ADVANCE_IN
    quantity = Column(Float, nullable=False)  # Quantity in KT (always positive)
    
    # Source/Target info
    from_quarter = Column(Integer, nullable=True)  # Q1=1, Q2=2, etc. (for incoming adjustments)
    to_quarter = Column(Integer, nullable=True)  # Q1=1, Q2=2, etc. (for outgoing adjustments)
    from_year = Column(Integer, nullable=True)  # Calendar year
    to_year = Column(Integer, nullable=True)  # Calendar year
    
    # Authority tracking
    authority_reference = Column(String(100), nullable=False)
    reason = Column(Text, nullable=True)
    
    # Monthly plan reference (the plan that was moved)
    monthly_plan_id = Column(Integer, ForeignKey("monthly_plans.id"), nullable=True)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True)
    
    # Relationships
    quarterly_plan = relationship("QuarterlyPlan", backref="adjustments")
    monthly_plan = relationship("MonthlyPlan")


class ContractAuditLog(Base):
    """
    Audit log for contract changes, especially authority top-ups.
    Tracks when additional quantities are authorized beyond the original contract.
    """
    __tablename__ = "contract_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    contract_db_id = Column(Integer, nullable=True, index=True)  # Preserved after contract deletion
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE, AUTHORITY_TOPUP
    field_name = Column(String, nullable=True)  # Field that was changed
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    
    # For AUTHORITY_TOPUP actions
    product_name = Column(String, nullable=True)  # Product being topped up
    topup_quantity = Column(Float, nullable=True)  # Quantity added in KT
    authority_reference = Column(String, nullable=True)  # Reference number
    topup_reason = Column(String, nullable=True)  # Reason for top-up
    
    # Context info
    contract_number = Column(String, nullable=True)
    customer_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # User tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True, index=True)


class GeneralAuditLog(Base):
    """
    General audit log for all entity types not covered by specific audit tables.
    Covers: customers, products, load_ports, inspectors, users
    """
    __tablename__ = "general_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)  # CUSTOMER, PRODUCT, LOAD_PORT, INSPECTOR, USER
    entity_id = Column(Integer, nullable=True, index=True)  # ID of the entity
    entity_name = Column(String, nullable=True)  # Name/identifier for display
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE
    field_name = Column(String, nullable=True)  # Field that was changed (for UPDATE)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    entity_snapshot = Column(Text, nullable=True)  # JSON snapshot for deleted entities
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # User tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_initials = Column(String(4), nullable=True, index=True)


# =============================================================================
# VERSION HISTORY & SOFT DELETE MODELS
# =============================================================================

class EntityVersion(Base):
    """
    Version history for all major entities (cargos, contracts, monthly plans, quarterly plans).
    Stores complete snapshots allowing full restoration to any previous version.

    This enables:
    - Viewing history of changes with full before/after data
    - Restoring to any previous version with one click
    - Auditing who changed what and when
    """
    __tablename__ = "entity_versions"
    __table_args__ = (
        # Unique constraint: one version number per entity
        UniqueConstraint('entity_type', 'entity_id', 'version_number', name='uq_entity_versions_type_id_version'),
        Index('idx_entity_versions_lookup', 'entity_type', 'entity_id'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Entity identification
    entity_type = Column(String(50), nullable=False, index=True)  # cargo, contract, monthly_plan, quarterly_plan
    entity_id = Column(Integer, nullable=False, index=True)  # ID of the entity

    # Version info
    version_number = Column(Integer, nullable=False)  # 1, 2, 3, etc.

    # Complete snapshot of the entity at this version (JSON)
    snapshot_data = Column(Text, nullable=False)  # Full JSON representation

    # What changed from previous version (for quick display)
    change_summary = Column(Text, nullable=True)  # Human-readable summary
    changed_fields = Column(Text, nullable=True)  # JSON array of field names that changed

    # Who and when
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_initials = Column(String(4), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DeletedEntity(Base):
    """
    Recycle bin for soft-deleted entities.
    Records are moved here instead of being permanently deleted.
    
    This enables:
    - Recovering accidentally deleted records
    - Viewing what was deleted and by whom
    - Automatic permanent deletion after retention period (e.g., 90 days)
    """
    __tablename__ = "deleted_entities"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Entity identification
    entity_type = Column(String(50), nullable=False, index=True)  # cargo, contract, monthly_plan, quarterly_plan, customer
    entity_id = Column(Integer, nullable=False, index=True)  # Original ID of the deleted entity
    entity_display_name = Column(String(255), nullable=True)  # Human-readable name for display
    
    # Complete snapshot at time of deletion (JSON)
    snapshot_data = Column(Text, nullable=False)  # Full JSON representation
    
    # Related entities (for context)
    related_info = Column(Text, nullable=True)  # JSON with related IDs/names (e.g., contract, customer)
    
    # Deletion info
    deleted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_by_initials = Column(String(4), nullable=True)
    deleted_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    deletion_reason = Column(Text, nullable=True)  # Optional reason for deletion
    
    # Restoration info (if restored)
    restored_at = Column(DateTime(timezone=True), nullable=True)
    restored_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    restored_by_initials = Column(String(4), nullable=True)
    new_entity_id = Column(Integer, nullable=True)  # ID after restoration (may differ from original)
    
    # For automatic cleanup
    permanent_delete_after = Column(DateTime(timezone=True), nullable=True)  # When to permanently delete
