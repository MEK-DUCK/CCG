from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import customers, contracts, quarterly_plans, monthly_plans, cargos, audit_logs, documents

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Oil Lifting Program API", 
    version="1.0.0"
)

# CORS middleware - explicitly list allowed origins (Safari needs exact matches)
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://0.0.0.0:5173",
    "http://192.168.0.5:5173",  # Local network IP for Safari testing
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(quarterly_plans.router, prefix="/api/quarterly-plans", tags=["quarterly-plans"])
app.include_router(monthly_plans.router, prefix="/api/monthly-plans", tags=["monthly-plans"])
app.include_router(cargos.router, prefix="/api/cargos", tags=["cargos"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["audit-logs"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])

@app.get("/")
def read_root():
    return {"message": "Oil Lifting Program API"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

