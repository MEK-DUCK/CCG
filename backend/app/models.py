"""
SQLAlchemy models for the Oil Lifting Program.
"""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
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
    IN_ROAD = "In-Road (Pending Discharge)"
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
    
    # Who created this user
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


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
    Contains one or more products with quantities.
    """
    __tablename__ = "contracts"
    
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
    
    # Products as JSON array: [{"name": "JET A-1", "total_quantity": 1000, "optional_quantity": 200}]
    # Using Text for SQLite compatibility, but PostgreSQL can use JSONB natively
    products = Column(Text, nullable=False)
    
    # Authority Top-Up: Additional quantity authorized beyond contract total + optional
    # JSON array: [{"product_name": "GASOIL", "quantity": 50, "authority_reference": "AUTH-2024-001", "reason": "Customer request", "date": "2024-12-25"}]
    authority_topups = Column(Text, nullable=True)
    
    discharge_ranges = Column(Text, nullable=True)  # Free-form notes
    additives_required = Column(Boolean, nullable=True)  # For JET A-1 contracts
    fax_received = Column(Boolean, nullable=True)
    fax_received_date = Column(Date, nullable=True)
    concluded_memo_received = Column(Boolean, nullable=True)
    concluded_memo_received_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    
    # Legacy fields - kept for backward compatibility, will be removed in future
    total_quantity = Column(Float, nullable=True, default=0)
    product_id = Column(Integer, nullable=True)  # Deprecated
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    customer = relationship("Customer", back_populates="contracts")
    quarterly_plans = relationship("QuarterlyPlan", back_populates="contract", cascade="all, delete-orphan")


class QuarterlyPlan(Base):
    """
    Quarterly allocation plan for a contract.
    For multi-product contracts, there's one plan per product.
    Each QuarterlyPlan represents one contract year with 4 quarters.
    """
    __tablename__ = "quarterly_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=True)  # For multi-product contracts
    
    # Contract year: 1, 2, etc. (which year of the contract)
    # Default 1 for backward compatibility
    contract_year = Column(Integer, nullable=True, default=1)
    
    q1_quantity = Column(Float, default=0)
    q2_quantity = Column(Float, default=0)
    q3_quantity = Column(Float, default=0)
    q4_quantity = Column(Float, default=0)
    # Authority top-up quantities per quarter (tracked separately from original allocation)
    q1_topup = Column(Float, default=0)
    q2_topup = Column(Float, default=0)
    q3_topup = Column(Float, default=0)
    q4_topup = Column(Float, default=0)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    contract = relationship("Contract", back_populates="quarterly_plans")
    monthly_plans = relationship("MonthlyPlan", back_populates="quarterly_plan", cascade="all, delete-orphan")


class MonthlyPlan(Base):
    """
    Monthly cargo plan within a quarterly plan.
    Contains laycan windows and delivery details.
    For SPOT contracts, can link directly to contract without quarterly plan.
    """
    __tablename__ = "monthly_plans"
    
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
    
    # Nullable for SPOT contracts that skip quarterly planning
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=True)
    
    # Direct contract link for SPOT contracts (when quarterly_plan_id is null)
    # Also useful for quick lookups without joining through quarterly_plan
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    
    # Product name for SPOT contracts (when no quarterly plan to get it from)
    product_name = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    quarterly_plan = relationship("QuarterlyPlan", back_populates="monthly_plans")
    contract = relationship("Contract", foreign_keys=[contract_id])
    cargos = relationship("Cargo", back_populates="monthly_plan", cascade="all, delete-orphan")


class Cargo(Base):
    """
    Actual cargo/vessel assignment for a monthly plan.
    Tracks vessel details, loading operations, and status.
    """
    __tablename__ = "cargos"
    
    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(String, unique=True, index=True)  # System generated (e.g., CARGO-XXXX)
    vessel_name = Column(String, nullable=False)
    customer_id = Column(Integer, nullable=False)
    product_name = Column(String, nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    contract_type = Column(Enum(ContractType), nullable=False)
    
    # Combi cargo support - links multiple cargos sharing same vessel
    combi_group_id = Column(String, nullable=True, index=True)
    
    # LC status - stored as string value for database compatibility
    lc_status = Column(String, nullable=True)
    
    load_ports = Column(Text, nullable=False)  # Comma-separated or JSON array
    inspector_name = Column(String)
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
    five_nd_date = Column(String, nullable=True)  # 5-ND: Narrowing down due date
    nd_delivery_window = Column(String, nullable=True)  # Narrowed Down Delivery Window
    
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
    
    # Legacy field - deprecated
    product_id = Column(Integer, nullable=True, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    monthly_plan = relationship("MonthlyPlan", back_populates="cargos")
    contract = relationship("Contract")
    port_operations = relationship("CargoPortOperation", back_populates="cargo", cascade="all, delete-orphan")


class CargoPortOperation(Base):
    """
    Per-load-port operational tracking for a cargo.
    Allows tracking the same cargo independently across multiple load ports.
    """
    __tablename__ = "cargo_port_operations"

    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=False, index=True)
    port_code = Column(String, nullable=False, index=True)  # MAA, MAB, SHU, ZOR

    # Per-port status (String for easy migration across SQLite/Postgres)
    status = Column(String, nullable=False, default="Planned")  # Planned | Loading | Completed Loading

    # Per-port vessel operation fields
    eta = Column(String, nullable=True)
    berthed = Column(String, nullable=True)
    commenced = Column(String, nullable=True)
    etc = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    cargo = relationship("Cargo", back_populates="port_operations")


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
