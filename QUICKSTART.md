# Quick Start Guide

Get the Oil Lifting Program up and running in minutes!

## Prerequisites

- Python 3.11+ installed
- Node.js 18+ and npm installed
- PostgreSQL (optional - app will use SQLite if PostgreSQL is not available)

## Quick Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (if not exists)
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Create .env file (optional - app will use defaults)
cp .env.example .env
# Edit .env with your database credentials if needed

# Start the backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at: `http://localhost:8000`

### 2. Frontend Setup

Open a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at: `http://localhost:5173`

## First Time Setup

### Database Configuration

The app will automatically:
- Try to connect to PostgreSQL if configured
- Fall back to SQLite if PostgreSQL is not available
- Create all necessary tables automatically

**To use PostgreSQL:**
1. Install PostgreSQL (see `INSTALL_POSTGRESQL.md`)
2. Create database: `createdb oil_lifting`
3. Update `.env` file with your PostgreSQL credentials
4. Restart the backend

**To use SQLite (default fallback):**
- No configuration needed! The app will create `oil_lifting.db` automatically.

## Access the Application

1. **Frontend**: Open `http://localhost:5173` in your browser
2. **Backend API**: `http://localhost:8000`
3. **API Documentation**: `http://localhost:8000/docs` (Swagger UI)

## Common Commands

### Backend
```bash
# Start backend
uvicorn app.main:app --reload

# Run with specific host/port
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Troubleshooting

### Backend won't start
- Check if port 8000 is already in use: `lsof -i :8000`
- Verify Python version: `python3 --version` (needs 3.11+)
- Check virtual environment is activated
- Verify dependencies are installed: `pip list`

### Frontend won't start
- Check if port 5173 is already in use: `lsof -i :5173`
- Verify Node.js version: `node --version` (needs 18+)
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Database connection issues
- Check database is running (if using PostgreSQL)
- Verify `.env` file has correct credentials
- Check database exists: `psql -l | grep oil_lifting` (PostgreSQL)
- The app will automatically fall back to SQLite if PostgreSQL fails

### CORS errors
- Ensure backend is running on port 8000
- Check `backend/app/main.py` has correct CORS origins
- Verify frontend is using the proxy in `vite.config.ts`

## Next Steps

1. **Create your first customer**: Navigate to "Customer Management" in the app
2. **Create a contract**: Go to "Contract Management" and add a new contract
3. **Set up quarterly plans**: Create quarterly plans for your contracts
4. **Create monthly plans**: Break down quarterly plans into monthly quantities
5. **Track cargos**: Use the "Port Movement" tab to manage vessel operations

## Production Deployment

For production deployment, see:
- `INSTALL_POSTGRESQL.md` for PostgreSQL setup
- `backend/POSTGRESQL_SETUP.md` for detailed database configuration
- Google Cloud deployment guide (in README.md)

## Need Help?

- Check the main `README.md` for detailed documentation
- Review API documentation at `http://localhost:8000/docs`
- Check backend logs for error messages
- Verify all environment variables are set correctly

