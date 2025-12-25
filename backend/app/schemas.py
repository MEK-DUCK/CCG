from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Union
from datetime import date, datetime
from app.models import ContractType, CargoStatus, PaymentMethod, LCStatus

# Customer Schemas
class CustomerBase(BaseModel):
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

# Contract Product Schema (for products array in contract)
class ContractProduct(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)  # JET A-1, GASOIL, GASOIL 10PPM, HFO, LSFO
    total_quantity: float = Field(..., ge=0)  # Total quantity in KT
    optional_quantity: Optional[float] = Field(0, ge=0)  # Optional quantity in KT

# Contract Schemas
class ContractBase(BaseModel):
    contract_number: str = Field(..., min_length=1, max_length=255)
    contract_type: ContractType
    payment_method: Optional[PaymentMethod] = None  # T/T or LC
    start_period: date
    end_period: date
    products: List[ContractProduct]  # List of products with quantities
    discharge_ranges: Optional[str] = Field(None, max_length=10000)
    additives_required: Optional[bool] = None
    fax_received: Optional[bool] = None
    fax_received_date: Optional[date] = None
    concluded_memo_received: Optional[bool] = None
    concluded_memo_received_date: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=10000)

    @model_validator(mode="after")
    def _validate_contract_period(self):
        if self.start_period and self.end_period and self.start_period > self.end_period:
            raise ValueError("start_period must be on or before end_period")
        return self

class ContractCreate(ContractBase):
    customer_id: int

class ContractUpdate(BaseModel):
    contract_number: Optional[str] = Field(None, min_length=1, max_length=255)
    contract_type: Optional[ContractType] = None
    payment_method: Optional[PaymentMethod] = None
    start_period: Optional[date] = None
    end_period: Optional[date] = None
    products: Optional[List[ContractProduct]] = None
    discharge_ranges: Optional[str] = Field(None, max_length=10000)
    additives_required: Optional[bool] = None
    fax_received: Optional[bool] = None
    fax_received_date: Optional[date] = None
    concluded_memo_received: Optional[bool] = None
    concluded_memo_received_date: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=10000)
    customer_id: Optional[int] = None

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
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Quarterly Plan Schemas
class QuarterlyPlanBase(BaseModel):
    product_name: Optional[str] = None  # Product name - makes quarterly plan product-specific
    q1_quantity: float = Field(0, ge=0)
    q2_quantity: float = Field(0, ge=0)
    q3_quantity: float = Field(0, ge=0)
    q4_quantity: float = Field(0, ge=0)

class QuarterlyPlanCreate(QuarterlyPlanBase):
    contract_id: int

class QuarterlyPlanUpdate(BaseModel):
    product_name: Optional[str] = None
    q1_quantity: Optional[float] = Field(None, ge=0)
    q2_quantity: Optional[float] = Field(None, ge=0)
    q3_quantity: Optional[float] = Field(None, ge=0)
    q4_quantity: Optional[float] = Field(None, ge=0)

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
    month_quantity: float = Field(..., ge=0)
    number_of_liftings: int = Field(1, ge=0)
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None  # For FOB contracts only
    laycan_2_days: Optional[str] = None  # For FOB contracts only
    laycan_2_days_remark: Optional[str] = Field(None, max_length=10000)
    loading_month: Optional[str] = None  # For CIF contracts only (planning)
    loading_window: Optional[str] = None  # For CIF contracts only
    delivery_month: Optional[str] = None  # For CIF contracts only (planning)
    delivery_window: Optional[str] = None  # For CIF contracts only
    delivery_window_remark: Optional[str] = Field(None, max_length=10000)
    combi_group_id: Optional[str] = None  # UUID to link combi monthly plans (multiple products, same vessel/laycan)

class MonthlyPlanCreate(MonthlyPlanBase):
    quarterly_plan_id: int

class MonthlyPlanUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    year: Optional[int] = None
    month_quantity: Optional[float] = Field(None, ge=0)
    number_of_liftings: Optional[int] = Field(None, ge=0)
    planned_lifting_sizes: Optional[str] = None
    laycan_5_days: Optional[str] = None
    laycan_2_days: Optional[str] = None
    laycan_2_days_remark: Optional[str] = Field(None, max_length=10000)
    loading_month: Optional[str] = None
    loading_window: Optional[str] = None
    delivery_month: Optional[str] = None
    delivery_window: Optional[str] = None
    delivery_window_remark: Optional[str] = Field(None, max_length=10000)
    combi_group_id: Optional[str] = None

class MonthlyPlan(MonthlyPlanBase):
    id: int
    quarterly_plan_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Monthly Plan Move Schema (for defer/advance actions)
class MonthlyPlanMoveRequest(BaseModel):
    action: str = Field(..., pattern="^(DEFER|ADVANCE)$")  # DEFER or ADVANCE
    target_month: int = Field(..., ge=1, le=12)
    target_year: int = Field(..., ge=2020, le=2100)
    reason: Optional[str] = Field(None, max_length=500)  # Optional reason for the move


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
    payment_method: Optional[PaymentMethod] = None
    start_period: date
    end_period: date
    products: List[ContractProduct]
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
    quarterly_plan_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    quarterly_plan: Optional[QuarterlyPlanEmbedded] = None
    
    class Config:
        from_attributes = True


# Cargo Schemas
class CargoBase(BaseModel):
    vessel_name: str
    load_ports: str
    inspector_name: Optional[str] = None
    cargo_quantity: float = Field(..., gt=0)
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
    # CIF In-Road tracking fields
    five_nd_date: Optional[str] = None  # 5-ND: Due date for narrowing down delivery window
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

class CargoUpdate(BaseModel):
    vessel_name: Optional[str] = None
    load_ports: Optional[str] = None
    inspector_name: Optional[str] = None
    cargo_quantity: Optional[float] = Field(None, gt=0)
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
    # CIF In-Road tracking fields
    five_nd_date: Optional[str] = None  # 5-ND: Due date for narrowing down delivery window
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
    combi_group_id: Optional[str] = None  # UUID to link combi cargos together
    created_at: datetime
    updated_at: Optional[datetime] = None
    port_operations: Optional[List["CargoPortOperation"]] = None
    
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

