# Quick PostgreSQL Installation Guide

## Option 1: Official PostgreSQL Installer (Easiest)

1. **Download PostgreSQL**:
   - Visit: https://www.postgresql.org/download/macosx/
   - Click "Download the installer"
   - Choose the latest version (PostgreSQL 15 or 16)
   - Download the `.dmg` file

2. **Install**:
   - Open the downloaded `.dmg` file
   - Run the installer
   - **Remember the password** you set for the `postgres` user
   - Complete the installation

3. **Verify Installation**:
   ```bash
   psql --version
   ```

4. **Start PostgreSQL**:
   ```bash
   # PostgreSQL usually starts automatically, but if not:
   brew services start postgresql@15
   # OR if installed via official installer:
   sudo launchctl load -w /Library/LaunchDaemons/com.edb.launchd.postgresql-*.plist
   ```

5. **Create Database**:
   ```bash
   createdb oil_lifting
   ```

6. **Update .env file** in the backend directory:
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/oil_lifting
   ```

7. **Restart the backend** - it will automatically detect and use PostgreSQL!

---

## Option 2: Homebrew (If Available)

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Create database
createdb oil_lifting

# Update .env file
# DATABASE_URL=postgresql://postgres:password@localhost:5432/oil_lifting
```

---

## Option 3: Docker (Fastest, if Docker is installed)

```bash
# Run PostgreSQL in Docker
docker run --name oil-lifting-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=oil_lifting \
  -p 5432:5432 \
  -d postgres:15

# Update .env file
# DATABASE_URL=postgresql://postgres:password@localhost:5432/oil_lifting
```

---

## Current Status

**The app is currently running with SQLite** as a fallback. This works perfectly for development!

Once PostgreSQL is installed and configured, the app will automatically switch to PostgreSQL when you restart it.

---

## Need Help?

If you encounter any issues:
1. Check PostgreSQL is running: `pg_isready`
2. Check if port 5432 is available: `lsof -i :5432`
3. Verify database exists: `psql -l | grep oil_lifting`

