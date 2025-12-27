# Oil Lifting Program

A full-stack web application for managing oil contract planning, lifting schedules, vessel operations, and CIF/FOB cargo tracking with **real-time collaboration features**.

## Features

### Core Features
- **Customer Management**: Create and manage customers with contact details
- **Product Management**: Manage products under each customer
- **Contract Management**: Create FOB and CIF contracts with quarterly and monthly planning
- **Cargo Tracking**: Track vessel operations with automatic status updates
- **Dashboard**: Multi-tab interface for Port Movement, Active Loadings, Completed Cargos, In-Road CIF, and Completed In-Road CIF

### Real-Time Collaboration Features
- **🔄 Real-Time Sync**: Changes made by one user are instantly reflected for all other users viewing the same page (no refresh needed)
- **👥 Presence Awareness**: See who else is viewing/editing the same Quarterly or Monthly plan
- **✏️ Field-Level Editing Indicators**: Know which specific field another user is currently editing
- **🔒 Optimistic Locking**: Prevents lost updates when multiple users edit the same record simultaneously
- **⚠️ Conflict Detection**: Automatic detection and notification when edit conflicts occur

### Authentication & Security
- **JWT Authentication**: Secure token-based authentication with 7-day expiration
- **Role-Based Access**: User management with different permission levels
- **Auto-Logout**: Automatic session handling for expired tokens

## Technology Stack

### Backend
- **FastAPI**: Python web framework with async support
- **SQLAlchemy**: ORM for database operations
- **PostgreSQL**: Database (can be configured to use MySQL)
- **Pydantic**: Data validation
- **WebSockets**: Real-time bidirectional communication for presence and data sync

### Frontend
- **React 18**: UI library
- **TypeScript**: Type safety
- **Material-UI (MUI)**: Component library
- **Vite**: Build tool and dev server
- **React Router**: Navigation
- **WebSocket Hooks**: Custom hooks for real-time features

## Project Structure

```
oil-lifting-program/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI application
│   │   ├── auth.py              # JWT authentication
│   │   ├── database.py          # Database configuration
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── presence.py          # WebSocket presence manager
│   │   └── routers/             # API route handlers
│   │       ├── auth.py          # Authentication endpoints
│   │       ├── customers.py
│   │       ├── products.py
│   │       ├── contracts.py
│   │       ├── quarterly_plans.py
│   │       ├── monthly_plans.py
│   │       ├── cargos.py
│   │       ├── presence_router.py  # WebSocket endpoints
│   │       └── ...
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                 # API client with interceptors
│   │   ├── components/
│   │   │   ├── Presence/        # Real-time collaboration components
│   │   │   │   ├── ActiveUsersIndicator.tsx
│   │   │   │   ├── EditingWarningBanner.tsx
│   │   │   │   └── ConflictDialog.tsx
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx  # Authentication context
│   │   ├── hooks/
│   │   │   ├── usePresence.ts   # WebSocket presence hook
│   │   │   └── useRealTimeSync.ts # Real-time data sync hook
│   │   ├── pages/               # Page components
│   │   ├── types/               # TypeScript types
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
JWT_SECRET_KEY=your-secure-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
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

The frontend will be available at `http://localhost:5173`

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

1. **Login** - Authenticate with your credentials
2. **Create Customer** - Add a new customer with contact details
3. **Add Product** - Create products under each customer
4. **Create Contract** - Set up FOB or CIF contracts for products
5. **Enter Total Quantity** - Define the contract quantity
6. **Create Quarterly Plan** - Allocate quantities across Q1-Q4
7. **Create Monthly Plan** - Plan monthly liftings with laycan windows
8. **Add Cargo Details** - Add vessel information and tracking details
9. **System Updates Status** - Automatic status updates based on completion times
10. **View in Tabs** - Cargos appear in appropriate tabs based on status

## Real-Time Features

### Presence Awareness (Quarterly & Monthly Plans)
When viewing a contract's quarterly or monthly plan:
- See colored chips showing other users' initials who are on the same page
- Get notified when someone starts editing a specific field
- Warning banners appear when potential conflicts are detected

### Real-Time Sync (Port Movement & Related Tabs)
On the HomePage tabs (Port Movement, Active Loadings, Completed Cargos, In-Road CIF):
- New cargos created by other users appear instantly
- Updates to cargo details (vessel name, status, etc.) sync in real-time
- Deleted cargos are removed from your view automatically
- No manual refresh required

### Optimistic Locking
- Each record has a version number
- When saving changes, the system checks if the version matches
- If someone else modified the record, you'll be notified to refresh and try again

## Status Logic

### FOB Cargo Status Flow
- **Planned** → **Loading** → **Completed Loading** → **Completed Cargos** tab

### CIF Cargo Status Flow
- **Planned** → **Loading** → **Completed Loading** → **In-Road CIF** tab → **Completed Discharge** → **Completed Cargos** tab

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user info

### WebSocket Endpoints
- `WS /api/ws/presence/{resource_type}/{resource_id}` - Real-time presence and data sync

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
- `PUT /api/contracts/{id}` - Update contract (with optimistic locking)
- `DELETE /api/contracts/{id}` - Delete contract

### Quarterly Plans
- `GET /api/quarterly-plans` - List all quarterly plans (optional: filter by contract_id)
- `POST /api/quarterly-plans` - Create quarterly plan
- `GET /api/quarterly-plans/{id}` - Get quarterly plan by ID
- `PUT /api/quarterly-plans/{id}` - Update quarterly plan (with optimistic locking)
- `DELETE /api/quarterly-plans/{id}` - Delete quarterly plan

### Monthly Plans
- `GET /api/monthly-plans` - List all monthly plans (optional: filter by quarterly_plan_id)
- `POST /api/monthly-plans` - Create monthly plan
- `GET /api/monthly-plans/{id}` - Get monthly plan by ID
- `PUT /api/monthly-plans/{id}` - Update monthly plan (with optimistic locking)
- `DELETE /api/monthly-plans/{id}` - Delete monthly plan

### Cargos
- `GET /api/cargos` - List all cargos (with optional filters)
- `GET /api/cargos/port-movement` - Get current month cargos
- `GET /api/cargos/active-loadings` - Get cargos currently loading
- `GET /api/cargos/completed-cargos` - Get completed cargos (FOB + CIF)
- `GET /api/cargos/in-road-cif` - Get in-road CIF cargos
- `GET /api/cargos/completed-in-road-cif` - Get completed CIF discharge cargos
- `POST /api/cargos` - Create cargo (broadcasts to connected users)
- `GET /api/cargos/{id}` - Get cargo by ID
- `PUT /api/cargos/{id}` - Update cargo (broadcasts to connected users)
- `DELETE /api/cargos/{id}` - Delete cargo (broadcasts to connected users)

## Homepage Tabs

1. **Port Movement**: Shows cargos planned for the selected month(s)
2. **Active Loadings**: Shows cargos currently in "Loading" status
3. **Completed Cargos**: Shows FOB completed cargos and CIF cargos with Completed Loading/Discharge
4. **In-Road CIF**: Shows CIF cargos that completed loading but not discharge
5. **Completed In-Road CIF**: Shows CIF cargos that have completed discharge

## Development

### Running in Development Mode

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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

### Environment Variables

**Backend (.env):**
```
DATABASE_URL=postgresql://user:password@localhost:5432/oil_lifting_db
JWT_SECRET_KEY=your-production-secret-key-change-this
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

## Notes

- The system automatically generates IDs for all entities (Customer ID, Product ID, Contract ID, Cargo ID)
- Cargo status is automatically updated based on loading and discharge completion times
- FOB cargos move to "Completed Cargos" after loading completion
- CIF cargos move to "In-Road CIF Cargos" after loading, then to "Completed Cargos" after discharge
- Real-time sync uses WebSockets - ensure your deployment supports WebSocket connections
- For production, use a proper secret key and consider shorter token expiration times

## Troubleshooting

### WebSocket Connection Issues
- Ensure the backend is running on port 8000
- Check that your firewall allows WebSocket connections
- In development, the frontend connects directly to `localhost:8000` for WebSockets

### Token Expired Errors
- The default token expiration is 7 days
- Users will be automatically logged out when tokens expire
- Re-login to get a new token

### Optimistic Locking Conflicts
- If you see a conflict error, click "Refresh" to get the latest data
- Re-apply your changes and save again

## License

This project is built for oil lifting program management.
