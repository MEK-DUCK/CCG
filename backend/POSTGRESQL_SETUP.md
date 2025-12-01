# PostgreSQL Setup Guide

This guide will help you set up PostgreSQL for the Oil Lifting Program application.

## Prerequisites

1. **Install PostgreSQL** (if not already installed):
   - **macOS**: `brew install postgresql@15` or download from [PostgreSQL Downloads](https://www.postgresql.org/download/)
   - **Linux**: `sudo apt-get install postgresql postgresql-contrib` (Ubuntu/Debian)
   - **Windows**: Download installer from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)

2. **Start PostgreSQL service**:
   - **macOS**: `brew services start postgresql@15`
   - **Linux**: `sudo systemctl start postgresql`
   - **Windows**: PostgreSQL service should start automatically

## Database Setup

### 1. Create Database and User

Connect to PostgreSQL as the superuser:

```bash
psql postgres
```

Then run the following SQL commands:

```sql
-- Create database
CREATE DATABASE oil_lifting;

-- Create user (optional, you can use the default postgres user)
CREATE USER oil_lifting_user WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE oil_lifting TO oil_lifting_user;

-- Connect to the new database
\c oil_lifting

-- Grant schema privileges (if using a separate user)
GRANT ALL ON SCHEMA public TO oil_lifting_user;
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update the database connection:

**Option 1: Full Connection String**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/oil_lifting
```

**Option 2: Individual Components**
```env
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=oil_lifting
```

Replace `postgres`, `password`, and other values with your actual PostgreSQL credentials.

### 3. Install Dependencies

Make sure you have the PostgreSQL adapter installed:

```bash
pip install -r requirements.txt
```

This will install `psycopg2-binary` which is required for PostgreSQL connectivity.

### 4. Create Database Tables

The application will automatically create all necessary tables when you start it. The tables are created using SQLAlchemy's `Base.metadata.create_all()` in `app/main.py`.

Alternatively, you can use Alembic for migrations (recommended for production):

```bash
# Initialize Alembic (if not already done)
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migration
alembic upgrade head
```

### 5. Start the Application

```bash
# Activate virtual environment (if using one)
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows

# Start the backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The application will automatically:
- Connect to PostgreSQL using the connection string from `.env`
- Create all necessary tables if they don't exist
- Start the API server

## Migrating from SQLite to PostgreSQL

If you have existing data in SQLite that you want to migrate:

### Option 1: Manual Export/Import (Simple)

1. **Export data from SQLite**:
   ```bash
   sqlite3 oil_lifting.db .dump > dump.sql
   ```

2. **Convert SQLite dump to PostgreSQL format** (requires manual editing):
   - Remove SQLite-specific syntax
   - Convert data types if needed
   - Update AUTOINCREMENT to SERIAL

### Option 2: Use a Migration Tool

1. **Install pgloader** (recommended):
   ```bash
   # macOS
   brew install pgloader
   
   # Linux
   sudo apt-get install pgloader
   ```

2. **Migrate data**:
   ```bash
   pgloader sqlite:///path/to/oil_lifting.db postgresql://postgres:password@localhost:5432/oil_lifting
   ```

### Option 3: Python Script (Custom)

Create a migration script that:
1. Reads data from SQLite
2. Transforms data if needed
3. Inserts into PostgreSQL

## Verification

To verify the connection is working:

1. **Check database connection**:
   ```bash
   psql -U postgres -d oil_lifting -c "SELECT version();"
   ```

2. **Check tables were created**:
   ```bash
   psql -U postgres -d oil_lifting -c "\dt"
   ```

3. **Test API health endpoint**:
   ```bash
   curl http://localhost:8000/api/health
   ```

## Troubleshooting

### Connection Refused
- Ensure PostgreSQL is running: `pg_isready`
- Check PostgreSQL is listening on the correct port (default: 5432)
- Verify firewall settings

### Authentication Failed
- Check username and password in `.env`
- Verify PostgreSQL authentication method in `pg_hba.conf`
- For local development, you may need to set `trust` authentication

### Database Does Not Exist
- Create the database: `CREATE DATABASE oil_lifting;`
- Verify database name in `.env` matches

### Permission Denied
- Grant proper privileges to your database user
- Check schema permissions

## Production Considerations

For production deployments:

1. **Use connection pooling**: Already configured in `database.py`
2. **Set up SSL**: Add `?sslmode=require` to connection string
3. **Use environment variables**: Never commit `.env` files
4. **Backup regularly**: Set up automated PostgreSQL backups
5. **Monitor performance**: Use PostgreSQL's built-in monitoring tools
6. **Use managed database**: Consider Google Cloud SQL, AWS RDS, or Azure Database

## Cloud Deployment

For Google Cloud SQL or other cloud providers:

```env
# Google Cloud SQL (Unix socket)
DATABASE_URL=postgresql://user:password@/database?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME

# Google Cloud SQL (TCP)
DATABASE_URL=postgresql://user:password@/database?host=IP_ADDRESS

# AWS RDS
DATABASE_URL=postgresql://user:password@rds-endpoint.amazonaws.com:5432/database

# Azure Database
DATABASE_URL=postgresql://user:password@server.postgres.database.azure.com:5432/database?sslmode=require
```

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SQLAlchemy PostgreSQL Dialect](https://docs.sqlalchemy.org/en/14/dialects/postgresql.html)
- [psycopg2 Documentation](https://www.psycopg.org/docs/)

