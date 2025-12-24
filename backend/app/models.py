from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum, Text, Boolean
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum
import uuid

class ContractType(str, enum.Enum):
    FOB = "FOB"
    CIF = "CIF"

class PaymentMethod(str, enum.Enum):
    TT = "T/T"
    LC = "LC"

# LCStatus enum - duplicate of CargoStatus pattern
class LCStatus(str, enum.Enum):
    PENDING_LC = "Pending LC"
    LC_IN_ORDER = "LC in Order"
    LC_NOT_IN_ORDER = "LC Not in Order"
    LC_MEMO_ISSUED = "LC Memo Issued"

class CargoStatus(str, enum.Enum):
    PLANNED = "Planned"
    LOADING = "Loading"
    COMPLETED_LOADING = "Completed Loading"
    IN_ROAD = "In-Road (Pending Discharge)"
    PENDING_NOMINATION = "Pending Nomination"
    PENDING_TL_APPROVAL = "Pending TL Approval"
    NOMINATION_RELEASED = "Nomination Released"


class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, unique=True, index=True)  # System generated
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    contracts = relationship("Contract", back_populates="customer", cascade="all, delete-orphan")

class Contract(Base):
    __tablename__ = "contracts"
    
    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(String, unique=True, index=True)
    contract_number = Column(String, nullable=False)
    contract_type = Column(Enum(ContractType), nullable=False)
    payment_method = Column(Enum(PaymentMethod), nullable=True)  # T/T or LC
    start_period = Column(Date, nullable=False)
    end_period = Column(Date, nullable=False)
    products = Column(Text, nullable=False)  # JSON: [{"name": "JET A-1", "total_quantity": 1000, "optional_quantity": 200}]
    discharge_ranges = Column(Text, nullable=True)  # Free-form notes for user reference
    additives_required = Column(Boolean, nullable=True)  # For JET A-1 contracts (Yes/No)
    fax_received = Column(Boolean, nullable=True)  # Yes/No
    fax_received_date = Column(Date, nullable=True)  # Optional date if fax_received == True
    concluded_memo_received = Column(Boolean, nullable=True)  # Yes/No
    concluded_memo_received_date = Column(Date, nullable=True)  # Optional date if concluded_memo_received == True
    remarks = Column(Text, nullable=True)  # User remarks (editable in Contract Summary)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    # Legacy fields for backward compatibility (will be removed in future migration)
    total_quantity = Column(Float, nullable=True, default=0)  # Calculated from products
    product_id = Column(Integer, nullable=True)  # Old field, no longer used
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    customer = relationship("Customer", back_populates="contracts")
    quarterly_plans = relationship("QuarterlyPlan", back_populates="contract", cascade="all, delete-orphan")

class QuarterlyPlan(Base):
    __tablename__ = "quarterly_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=True)  # Product name - makes quarterly plan product-specific for multi-product contracts
    q1_quantity = Column(Float, default=0)
    q2_quantity = Column(Float, default=0)
    q3_quantity = Column(Float, default=0)
    q4_quantity = Column(Float, default=0)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    contract = relationship("Contract", back_populates="quarterly_plans")
    monthly_plans = relationship("MonthlyPlan", back_populates="quarterly_plan", cascade="all, delete-orphan")

class MonthlyPlan(Base):
    __tablename__ = "monthly_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)
    month_quantity = Column(Float, nullable=False)
    number_of_liftings = Column(Integer, default=1)
    planned_lifting_sizes = Column(Text)  # JSON string or comma-separated
    laycan_5_days = Column(String, nullable=True)  # For FOB contracts only
    laycan_2_days = Column(String, nullable=True)  # For FOB contracts only
    laycan_2_days_remark = Column(Text, nullable=True)  # Free-form remark under "2 Days"
    loading_month = Column(String, nullable=True)  # For CIF contracts only (planning)
    loading_window = Column(String, nullable=True)  # For CIF contracts only
    delivery_month = Column(String, nullable=True)  # For CIF contracts only (planning)
    delivery_window = Column(String, nullable=True)  # For CIF contracts only
    delivery_window_remark = Column(Text, nullable=True)  # Free-form remark under "Delivery Window"
    combi_group_id = Column(String, nullable=True, index=True)  # UUID to link combi monthly plans (multiple products, same vessel/laycan)
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    quarterly_plan = relationship("QuarterlyPlan", back_populates="monthly_plans")
    cargos = relationship("Cargo", back_populates="monthly_plan", cascade="all, delete-orphan")

class Cargo(Base):
    __tablename__ = "cargos"
    
    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(String, unique=True, index=True)
    vessel_name = Column(String, nullable=False)
    customer_id = Column(Integer, nullable=False)  # Reference to customer, derived from contract
    product_name = Column(String, nullable=False)  # Product name from contract's products list (e.g., "JET A-1")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    # Combi cargo support - links multiple cargos (different products) that share the same vessel/laycan
    combi_group_id = Column(String, nullable=True, index=True)  # UUID to link combi cargos together
    # Legacy field for backward compatibility
    product_id = Column(Integer, nullable=True, default=0)  # Old field, no longer used
    contract_type = Column(Enum(ContractType), nullable=False)  # FOB or CIF
    lc_status = Column(String, nullable=True)  # LC status - use String to store enum VALUE directly (database enum has values, not names)
    load_ports = Column(Text, nullable=False)  # JSON string or comma-separated
    inspector_name = Column(String)
    cargo_quantity = Column(Float, nullable=False)
    laycan_window = Column(String)
    # Manual vessel operation fields (replaced old datetime fields)
    eta = Column(String)  # ETA (manual entry)
    berthed = Column(String)  # Berthed (manual entry)
    commenced = Column(String)  # Commenced (manual entry)
    etc = Column(String)  # ETC - Estimated Time of Completion (manual entry)
    # Legacy fields kept for backward compatibility
    eta_load_port = Column(DateTime, nullable=True)
    loading_start_time = Column(DateTime, nullable=True)
    loading_completion_time = Column(DateTime, nullable=True)
    etd_load_port = Column(DateTime, nullable=True)
    
    # CIF specific fields
    eta_discharge_port = Column(DateTime)
    discharge_port_location = Column(String)
    discharge_completion_time = Column(DateTime)
    
    # Completion tracking fields
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    monthly_plan = relationship("MonthlyPlan", back_populates="cargos")
    contract = relationship("Contract")
    port_operations = relationship("CargoPortOperation", back_populates="cargo", cascade="all, delete-orphan")


class CargoPortOperation(Base):
    """
    Per-load-port operational tracking for a cargo.
    Allows the same cargo to be tracked independently across multiple load ports.
    """
    __tablename__ = "cargo_port_operations"

    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=False, index=True)
    port_code = Column(String, nullable=False, index=True)  # e.g. MAA, MAB, SHU, ZOR

    # Per-port status (kept as String for easy migration across SQLite/Postgres)
    status = Column(String, nullable=False, default="Planned")  # Planned | Loading | Completed Loading

    # Per-port vessel operation fields (manual entry)
    eta = Column(String, nullable=True)
    berthed = Column(String, nullable=True)
    commenced = Column(String, nullable=True)
    etc = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    cargo = relationship("Cargo", back_populates="port_operations")

class CargoAuditLog(Base):
    __tablename__ = "cargo_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=True)  # Nullable for deleted cargos
    cargo_db_id = Column(Integer, nullable=True, index=True)  # Stable numeric cargo id (not FK) for filtering after delete
    cargo_cargo_id = Column(String, index=True)  # Store cargo_id string for reference even after deletion
    action = Column(String, nullable=False)  # 'CREATE', 'UPDATE', 'DELETE', 'MOVE'
    field_name = Column(String, nullable=True)  # Field that changed (for UPDATE)
    old_value = Column(Text, nullable=True)  # Previous value (JSON string for complex objects)
    new_value = Column(Text, nullable=True)  # New value (JSON string for complex objects)
    old_monthly_plan_id = Column(Integer, nullable=True)  # For tracking month moves
    new_monthly_plan_id = Column(Integer, nullable=True)  # For tracking month moves
    old_month = Column(Integer, nullable=True)  # Old month (for display)
    old_year = Column(Integer, nullable=True)  # Old year (for display)
    new_month = Column(Integer, nullable=True)  # New month (for display)
    new_year = Column(Integer, nullable=True)  # New year (for display)
    description = Column(Text, nullable=True)  # Human-readable description
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Store cargo snapshot for deleted cargos
    cargo_snapshot = Column(Text, nullable=True)  # JSON string of full cargo data

class MonthlyPlanAuditLog(Base):
    __tablename__ = "monthly_plan_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    monthly_plan_id = Column(Integer, ForeignKey("monthly_plans.id"), nullable=True)  # Nullable for deleted plans
    monthly_plan_db_id = Column(Integer, nullable=True, index=True)  # Stable numeric monthly_plan id (not FK) for filtering after delete
    action = Column(String, nullable=False)  # 'CREATE', 'UPDATE', 'DELETE'
    field_name = Column(String, nullable=True)  # Field that changed (for UPDATE)
    old_value = Column(Text, nullable=True)  # Previous value
    new_value = Column(Text, nullable=True)  # New value
    month = Column(Integer, nullable=True)  # Month (1-12)
    year = Column(Integer, nullable=True)  # Year
    contract_id = Column(Integer, nullable=True)  # Contract ID for reference
    contract_number = Column(String, nullable=True)  # Contract number for display
    contract_name = Column(String, nullable=True)  # Contract name/customer name for display
    quarterly_plan_id = Column(Integer, nullable=True)  # Quarterly plan ID for reference
    description = Column(Text, nullable=True)  # Human-readable description
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Store monthly plan snapshot for deleted plans
    monthly_plan_snapshot = Column(Text, nullable=True)  # JSON string of full monthly plan data

class QuarterlyPlanAuditLog(Base):
    __tablename__ = "quarterly_plan_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    quarterly_plan_id = Column(Integer, ForeignKey("quarterly_plans.id"), nullable=True)  # Nullable for deleted plans
    quarterly_plan_db_id = Column(Integer, nullable=True, index=True)  # Stable numeric quarterly_plan id (not FK) for filtering after delete
    action = Column(String, nullable=False)  # 'CREATE', 'UPDATE', 'DELETE'
    field_name = Column(String, nullable=True)  # Field that changed (for UPDATE)
    old_value = Column(Text, nullable=True)  # Previous value
    new_value = Column(Text, nullable=True)  # New value
    contract_id = Column(Integer, nullable=True)  # Contract ID for reference
    contract_number = Column(String, nullable=True)  # Contract number for display
    contract_name = Column(String, nullable=True)  # Contract name/customer name for display
    description = Column(Text, nullable=True)  # Human-readable description
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Store quarterly plan snapshot for deleted plans
    quarterly_plan_snapshot = Column(Text, nullable=True)  # JSON string of full quarterly plan data

