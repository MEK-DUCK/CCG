from pydantic import BaseModel, Field
from typing import Optional, List, Union
from datetime import date, datetime
from app.models import ContractType, CargoStatus, PaymentMethod, LCStatus

# Customer Schemas
class CustomerBase(BaseModel):
    name: str

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None

class Customer(CustomerBase):
    id: int
    customer_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Contract Product Schema (for products array in contract)
class ContractProduct(BaseModel):
    name: str  # JET A-1, GASOIL, GASOIL 10PPM, HFO, LSFO
    total_quantity: float  # Total quantity in KT
    optional_quantity: Optional[float] = 0  # Optional quantity in KT

# Contract Schemas
class ContractBase(BaseModel):
    contract_number: str
    contract_type: ContractType
    payment_method: Optional[PaymentMethod] = None  # T/T or LC
    start_period: date
    end_period: date
    products: List[ContractProduct]  # List of products with quantities

class ContractCreate(ContractBase):
    customer_id: int

class ContractUpdate(BaseModel):
    contract_number: Optional[str] = None
    contract_type: Optional[ContractType] = None
    payment_method: Optional[PaymentMethod] = None
    start_period: Optional[date] = None
    end_period: Optional[date] = None
    products: Optional[List[ContractProduct]] = None
    customer_id: Optional[int] = None

class Contract(ContractBase):
    id: int
    contract_id: str
    customer_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Quarterly Plan Schemas
class QuarterlyPlanBase(BaseModel):
    q1_quantity: float = 0
    q2_quantity: float = 0
    q3_quantity: float = 0
    q4_quantity: float = 0

class QuarterlyPlanCreate(QuarterlyPlanBase):
    contract_id: int

class QuarterlyPlanUpdate(BaseModel):
    q1_quantity: Optional[float] = None
    q2_quantity: Optional[float] = None
    q3_quantity: Optional[float] = None
    q4_quantity: Optional[float] = None

class QuarterlyPlan(QuarterlyPlanBase):
    id: int
    contract_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Monthly Plan Schemas
class MonthlyPlanBase(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int
    month_quantity: float
    number_of_liftings: int = 1
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None  # For FOB contracts only
    laycan_2_days: Optional[str] = None  # For FOB contracts only
    loading_window: Optional[str] = None  # For CIF contracts only
    delivery_window: Optional[str] = None  # For CIF contracts only

class MonthlyPlanCreate(MonthlyPlanBase):
    quarterly_plan_id: int

class MonthlyPlanUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    year: Optional[int] = None
    month_quantity: Optional[float] = None
    number_of_liftings: Optional[int] = None
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None
    laycan_2_days: Optional[str] = None
    loading_window: Optional[str] = None
    delivery_window: Optional[str] = None

class MonthlyPlan(MonthlyPlanBase):
    id: int
    quarterly_plan_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Cargo Schemas
class CargoBase(BaseModel):
    vessel_name: str
    load_ports: str
    inspector_name: Optional[str] = None
    cargo_quantity: float
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
    eta_discharge_port: Optional[datetime] = None
    discharge_port_location: Optional[str] = None
    discharge_completion_time: Optional[datetime] = None
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

class CargoUpdate(BaseModel):
    vessel_name: Optional[str] = None
    load_ports: Optional[str] = None
    inspector_name: Optional[str] = None
    cargo_quantity: Optional[float] = None
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
    eta_discharge_port: Optional[datetime] = None
    discharge_port_location: Optional[str] = None
    discharge_completion_time: Optional[datetime] = None
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

class Cargo(CargoBase):
    id: int
    cargo_id: str
    customer_id: int
    product_name: str
    contract_id: int
    contract_type: ContractType
    status: CargoStatus
    monthly_plan_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
        use_enum_values = True

# Cargo Audit Log Schemas
class CargoAuditLog(BaseModel):
    id: int
    cargo_id: Optional[int] = None
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
    action: str  # 'CREATE', 'UPDATE', 'DELETE'
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    month: Optional[int] = None
    year: Optional[int] = None
    contract_id: Optional[int] = None
    contract_number: Optional[str] = None
    contract_name: Optional[str] = None
    quarterly_plan_id: Optional[int] = None
    description: Optional[str] = None
    created_at: datetime
    monthly_plan_snapshot: Optional[str] = None
    
    class Config:
        from_attributes = True

# Quarterly Plan Audit Log Schemas
class QuarterlyPlanAuditLog(BaseModel):
    id: int
    quarterly_plan_id: Optional[int] = None
    action: str  # 'CREATE', 'UPDATE', 'DELETE'
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    contract_id: Optional[int] = None
    contract_number: Optional[str] = None
    contract_name: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime
    quarterly_plan_snapshot: Optional[str] = None
    
    class Config:
        from_attributes = True

