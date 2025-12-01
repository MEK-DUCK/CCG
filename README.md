# Oil Lifting Program

A full-stack web application for managing oil contract planning, lifting schedules, vessel operations, and CIF/FOB cargo tracking.

## Features

- **Customer Management**: Create and manage customers with contact details
- **Product Management**: Manage products under each customer
- **Contract Management**: Create FOB and CIF contracts with quarterly and monthly planning
- **Cargo Tracking**: Track vessel operations with automatic status updates
- **Dashboard**: 4-tab interface for Port Movement, Lifting Plan, Completed Cargos, and In-Road CIF Cargos

## Technology Stack

### Backend
- **FastAPI**: Python web framework
- **SQLAlchemy**: ORM for database operations
- **PostgreSQL**: Database (can be configured to use MySQL)
- **Pydantic**: Data validation

### Frontend
- **React 18**: UI library
- **TypeScript**: Type safety
- **Material-UI (MUI)**: Component library
- **Vite**: Build tool and dev server
- **React Router**: Navigation

## Project Structure

```
oil-lifting-program/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application
│   │   ├── database.py      # Database configuration
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic schemas
│   │   └── routers/         # API route handlers
│   │       ├── customers.py
│   │       ├── products.py
│   │       ├── contracts.py
│   │       ├── quarterly_plans.py
│   │       ├── monthly_plans.py
│   │       └── cargos.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/             # API client
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── types/           # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.8+
- Node.js 16+
- PostgreSQL (or MySQL)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up the database:
   - Create a PostgreSQL database named `oil_lifting_db`
   - Or update the connection string in `.env` for your preferred database

5. Create a `.env` file in the backend directory:
```bash
cp .env.example .env
```

6. Update the `.env` file with your database credentials:
```
DATABASE_URL=postgresql://user:password@localhost:5432/oil_lifting_db
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

7. Run the backend server:
```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`
API documentation: `http://localhost:8000/docs`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Data Hierarchy

The application follows this exact data structure:

```
Customer
  → Product
      → Contract
          → Contract Type (FOB or CIF)
          → Contract Period
          → Contract Total Quantity
              → Quarterly Plan
                  → Monthly Plan
                      → Cargo Details (Vessel details)
```

## Workflow

1. **Create Customer** - Add a new customer with contact details
2. **Add Product** - Create products under each customer
3. **Create Contract** - Set up FOB or CIF contracts for products
4. **Enter Total Quantity** - Define the contract quantity
5. **Create Quarterly Plan** - Allocate quantities across Q1-Q4
6. **Create Monthly Plan** - Plan monthly liftings
7. **Add Cargo Details** - Add vessel information and tracking details
8. **System Updates Status** - Automatic status updates based on completion times
9. **View in Tabs** - Cargos appear in appropriate tabs based on status

## Status Logic

### FOB Cargo Status Flow
- **Planned** → **Loading** → **Completed Loading** → **Completed Cargos** tab

### CIF Cargo Status Flow
- **Planned** → **Loading** → **Completed Loading** → **In-Road (Pending Discharge)** → **Fully Completed** → **Completed Cargos** tab

## API Endpoints

### Customers
- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
- `GET /api/customers/{id}` - Get customer by ID
- `PUT /api/customers/{id}` - Update customer
- `DELETE /api/customers/{id}` - Delete customer

### Products
- `GET /api/products` - List all products (optional: filter by customer_id)
- `POST /api/products` - Create product
- `GET /api/products/{id}` - Get product by ID
- `PUT /api/products/{id}` - Update product
- `DELETE /api/products/{id}` - Delete product

### Contracts
- `GET /api/contracts` - List all contracts (optional: filter by product_id)
- `POST /api/contracts` - Create contract
- `GET /api/contracts/{id}` - Get contract by ID
- `PUT /api/contracts/{id}` - Update contract
- `DELETE /api/contracts/{id}` - Delete contract

### Quarterly Plans
- `GET /api/quarterly-plans` - List all quarterly plans (optional: filter by contract_id)
- `POST /api/quarterly-plans` - Create quarterly plan
- `GET /api/quarterly-plans/{id}` - Get quarterly plan by ID
- `PUT /api/quarterly-plans/{id}` - Update quarterly plan
- `DELETE /api/quarterly-plans/{id}` - Delete quarterly plan

### Monthly Plans
- `GET /api/monthly-plans` - List all monthly plans (optional: filter by quarterly_plan_id)
- `POST /api/monthly-plans` - Create monthly plan
- `GET /api/monthly-plans/{id}` - Get monthly plan by ID
- `PUT /api/monthly-plans/{id}` - Update monthly plan
- `DELETE /api/monthly-plans/{id}` - Delete monthly plan

### Cargos
- `GET /api/cargos` - List all cargos (with optional filters)
- `GET /api/cargos/port-movement` - Get current month cargos
- `GET /api/cargos/completed-cargos` - Get completed cargos
- `GET /api/cargos/in-road-cif` - Get in-road CIF cargos
- `POST /api/cargos` - Create cargo
- `GET /api/cargos/{id}` - Get cargo by ID
- `PUT /api/cargos/{id}` - Update cargo
- `DELETE /api/cargos/{id}` - Delete cargo

## Homepage Tabs

1. **Port Movement (Current Month Only)**: Shows cargos planned in the current calendar month
2. **Lifting Plan (Schedule)**: Shows all scheduled liftings (past, current, future)
3. **Completed Cargos**: Shows FOB completed cargos and CIF cargos after discharge
4. **In-Road CIF Cargos**: Shows CIF cargos that completed loading but not discharge

## Development

### Running in Development Mode

**Backend:**
```bash
cd backend
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm run dev
```

### Building for Production

**Frontend:**
```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`

## Notes

- The system automatically generates IDs for all entities (Customer ID, Product ID, Contract ID, Cargo ID)
- Cargo status is automatically updated based on loading and discharge completion times
- FOB cargos move to "Completed Cargos" after loading completion
- CIF cargos move to "In-Road CIF Cargos" after loading, then to "Completed Cargos" after discharge

## License

This project is built for oil lifting program management.

