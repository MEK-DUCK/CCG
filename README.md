# Oil Lifting Program

A full-stack web application for managing oil contract planning, lifting schedules, vessel operations, and CIF/FOB cargo tracking with **real-time collaboration features**.

## Features

### Core Features
- **Customer Management**: Create and manage customers with contact details
- **Product Management**: Manage products under each customer
- **Contract Management**: Create FOB and CIF contracts with quarterly and monthly planning
- **Range Contracts**: Support for min/max quantity ranges with optional quantities
- **Cargo Tracking**: Track vessel operations with automatic status updates
- **Combi Cargo**: Load multiple products in a single vessel with unified tracking
- **Cross-Contract Combi**: Combine products from different contracts (same customer, same type) into a single vessel
- **Dashboard**: Multi-tab interface for Port Movement, Active Loadings, Completed Cargos, In-Road CIF, and Completed In-Road CIF

### Contract Types & Quantity Modes
- **Fixed Quantity Mode**: Set a firm total quantity with optional additional quantity
- **Range (Min/Max) Mode**: Set minimum and maximum quantity bounds for flexible contracts
- **Authority Amendments**: Mid-contract adjustments to min/max quantities with reference tracking
- **Optional Quantities**: Additional quantities beyond firm commitments (shown in purple on progress bars)
- **Progress Tracking**: Visual progress bars showing allocation against min/max thresholds

### CIF Contract Features
- **Delivery-Based Tracking**: CIF contracts track quantities by delivery month/quarter (not loading month)
- **Pre-Month Loading**: For CIF contracts, the month before contract start is available for loadings that deliver in the first contract month
- **Auto-Calculated Delivery Windows**: Based on loading window, destination, and route (Via SUEZ/CAPE)
- **Voyage Duration Lookup**: Built-in voyage times for Rotterdam, Le Havre, Shell Haven, Naples, Milford Haven
- **TNG (Tonnage Memo) Tracking**: Track issuance and revision of tonnage memos with due date alerts

### Combi Cargo Features
Combi cargos allow multiple products to be loaded on a single vessel, sharing the same timing and vessel details.

#### Same-Contract Combi
- Available for contracts with multiple products (e.g., Gasoil + Jet A-1)
- Check "Combi Cargo" when creating a new monthly plan entry
- Enter quantities for each product separately
- All products share the same laycan/loading window

#### Cross-Contract Combi
- Combine products from **different contracts** belonging to the **same customer**
- Requirements:
  - All contracts must belong to the same customer
  - All contracts must be the same type (all FOB or all CIF)
  - Monthly plans must be for the same month/year
- Click "Add from Another Contract" button in the monthly plan
- Select products from eligible contracts and enter quantities
- All selected products share the same vessel, load ports, and timing
- Each product's quantity counts against its respective contract

#### Combi Cargo Behavior
- **Unified Display**: Combi cargos appear as a single row in Port Movement and Active Loadings
- **Synchronized Updates**: Vessel name, load ports, and status changes apply to all products
- **Individual Quantities**: Each product maintains its own quantity for contract tracking
- **Deletion**: Deleting a combi cargo removes all associated products (with confirmation for cross-contract)

### Monthly Plan Views
- **Grid View**: Detailed editing layout organized by quarter with full field access
- **Table View**: Compact list showing all cargos with key info (Loading Month, Quantity, Windows)
- **Toggle Switch**: Easily switch between views using the Grid/List icons in the header

### Real-Time Collaboration Features
- **🔄 Real-Time Sync**: Changes made by one user are instantly reflected for all other users viewing the same page (no refresh needed)
- **👥 Presence Awareness**: See who else is viewing/editing the same Quarterly or Monthly plan
- **✏️ Field-Level Editing Indicators**: Know which specific field another user is currently editing
- **🔒 Optimistic Locking**: Prevents lost updates when multiple users edit the same record simultaneously
- **⚠️ Conflict Detection**: Automatic detection and notification when edit conflicts occur

### Version History & Recovery
- **📜 Version History**: View complete history of changes for cargos and monthly plans
- **🔍 Change Diff**: User-friendly display showing what changed (old values in red, new values in green)
- **⏪ Restore**: Ability to restore previous versions with one click
- **🗑️ Recycle Bin**: Soft delete with 30-day retention period
- **♻️ Recovery**: Restore deleted items from the Recycle Bin in Admin page
- **🔄 Batched Autosave**: Multiple field changes within 2 minutes are grouped into a single version

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

### Database Design (Normalized)
The database uses proper relational design with foreign key constraints:
- **Products**: Centralized product definitions (code, name, description)
- **Load Ports**: Centralized port definitions with FK references from cargo operations
- **Inspectors**: Centralized inspector definitions with FK references from cargos
- **Discharge Ports**: CIF destination ports with voyage duration data

All business entities use foreign keys instead of storing names as strings:
- `Cargo.product_id` → `products.id`
- `Cargo.inspector_id` → `inspectors.id`
- `Cargo.customer_id` → `customers.id`
- `CargoPortOperation.load_port_id` → `load_ports.id`
- `MonthlyPlan.product_id` → `products.id`
- `QuarterlyPlan.product_id` → `products.id`

This ensures data integrity and makes renaming entities automatic across all references.

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
│   │       ├── version_history_router.py  # Version history & recycle bin
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
│   │   │   ├── VersionHistory/  # Version history components
│   │   │   │   └── VersionHistory.tsx
│   │   │   ├── RecycleBin/      # Recycle bin components
│   │   │   │   └── RecycleBin.tsx
│   │   ├── MonthlyPlan/      # Monthly plan sub-components
│   │   │   ├── MoveEntryDialog.tsx
│   │   │   ├── TopupDialog.tsx
│   │   │   └── CrossContractCombiDialog.tsx
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx  # Authentication context
│   │   ├── hooks/
│   │   │   ├── usePresence.ts   # WebSocket presence hook
│   │   │   ├── useRealTimeSync.ts # Real-time data sync hook
│   │   │   └── useAutosave.ts   # Debounced autosave hook
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
          → Contract Category (TERM, SEMI_TERM, or SPOT)
          → Contract Period
          → Quantity Mode:
              → Fixed: Total Quantity + Optional Quantity
              → Range: Min Quantity + Max Quantity + Optional Quantity
          → Authority Amendments (for range contracts)
              → Quarterly Plan (skipped for SPOT and Range contracts)
                  → Monthly Plan
                      → Cargo Details (Vessel details)
                      → Combi Cargo (multiple products in one vessel)
```

### Contract Categories
- **TERM**: Long-term contracts with quarterly planning
- **SEMI_TERM**: Medium-term contracts with quarterly planning  
- **SPOT**: Short-term contracts that skip quarterly planning (direct monthly plans)
- **Range Contracts**: Any contract with min/max quantities skips quarterly planning

## Workflow

### Standard Contract Workflow (TERM/SEMI_TERM with Fixed Quantity)
1. **Login** - Authenticate with your credentials
2. **Create Customer** - Add a new customer with contact details
3. **Add Product** - Create products under each customer
4. **Create Contract** - Set up FOB or CIF contracts for products
5. **Enter Total Quantity** - Define the contract quantity (+ optional quantity if needed)
6. **Create Quarterly Plan** - Allocate quantities across Q1-Q4
7. **Create Monthly Plan** - Plan monthly liftings with laycan windows
8. **Add Cargo Details** - Add vessel information and tracking details
9. **Track Progress** - Monitor allocation via progress bars
10. **View in Tabs** - Cargos appear in appropriate tabs based on status

### Range Contract Workflow (Min/Max Quantity)
1. **Create Contract** - Toggle to "Min/Max" quantity mode
2. **Set Range** - Enter minimum and maximum quantities (+ optional quantity if needed)
3. **Skip Quarterly Plan** - Range contracts go directly to monthly planning
4. **Create Monthly Plan** - Plan liftings with visual min/max progress bar
5. **Authority Amendments** - Adjust min/max mid-contract if needed
6. **Track Progress** - Progress bar shows current position relative to min/max thresholds

### SPOT Contract Workflow
1. **Create Contract** - Select "SPOT" category
2. **Skip Quarterly Plan** - SPOT contracts go directly to monthly planning
3. **Create Monthly Plan** - Plan liftings as needed
4. **Add Cargo Details** - Track vessel operations

### Combi Cargo (Multiple Products in One Vessel)
1. **In Monthly Plan** - Check "Combi Cargo" option when adding an entry
2. **Enter Quantities** - Specify quantity for each product in the vessel
3. **Unified Tracking** - All products share vessel name, laycan, port operations
4. **Single Status Update** - Changing status updates all products in the combi group

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
- **Planned** → **Loading** → **Completed Loading** → **In-Road CIF** tab → **Discharge Complete** → **Completed Cargos** tab

### CIF Delivery Month Tracking
- CIF contracts track quantities by **delivery month** (when cargo arrives), not loading month
- Quarterly allocation is based on delivery quarter (Q1 = deliveries in Jan/Feb/Mar)
- Monthly plan grid is organized by loading month, but quantities count toward delivery quarter
- Pre-month loading available for cargos that load before contract start but deliver in first month

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
- `POST /api/contracts` - Create contract (supports fixed or min/max quantity mode)
- `GET /api/contracts/{id}` - Get contract by ID
- `PUT /api/contracts/{id}` - Update contract (with optimistic locking, supports authority amendments)
- `DELETE /api/contracts/{id}` - Delete contract

### Contract Products Schema
Each contract product supports:
- `total_quantity` / `optional_quantity` - For fixed quantity mode
- `min_quantity` / `max_quantity` / `optional_quantity` - For range (min/max) mode
- `authority_amendments[]` - Mid-contract adjustments to min/max quantities

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
- `PUT /api/cargos/combi-group/{combi_group_id}/sync` - Sync all cargos in a combi group (status, vessel, ports)
- `DELETE /api/cargos/{id}` - Soft delete cargo (moves to recycle bin)

### Version History
- `GET /api/versions/{entity_type}/{entity_id}` - Get version history for an entity
- `GET /api/versions/{entity_type}/{entity_id}/{version_number}` - Get specific version details
- `POST /api/versions/{entity_type}/{entity_id}/restore` - Restore to a previous version

### Recycle Bin
- `GET /api/versions/deleted` - List all soft-deleted items
- `GET /api/versions/deleted/{deleted_id}` - Get deleted item details
- `POST /api/versions/deleted/{deleted_id}/restore` - Restore deleted item
- `DELETE /api/versions/deleted/{deleted_id}` - Permanently delete item
- `POST /api/versions/deleted/cleanup` - Clean up expired items (30+ days old)

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
- Version history is available for cargos (via History button in edit dialog) and monthly plans (via 3-dots menu)
- Deleted cargos are soft-deleted with 30-day retention; access Recycle Bin from Admin page to restore or permanently delete

### Range Contracts
- Range contracts use min/max quantities instead of fixed total quantity
- Optional quantity can be added on top of max quantity for additional flexibility
- Authority amendments allow mid-contract adjustments to min/max values
- Range contracts skip quarterly planning - go directly to monthly plans
- Progress bar shows current allocation relative to min (green line) and max (end of bar)
- Purple fill indicates optional quantity usage (beyond max)

### Combi Cargos
- Combi cargos allow multiple products to be loaded in a single vessel
- All products in a combi group share: vessel name, laycan window, load ports, inspector, status
- Individual quantities are tracked per product within the combi group
- Port operation status changes apply to all cargos in the combi group simultaneously
- Combi cargos are displayed as a single unified row in Active Loadings and Port Movement tabs

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
