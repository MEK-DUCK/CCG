#!/bin/bash

# Startup script for Oil Lifting Program (Safari Compatible)
echo "=========================================="
echo "Starting Oil Lifting Program"
echo "Safari Compatible Configuration"
echo "=========================================="

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Backend
echo ""
echo "Starting Backend Server..."
cd "$SCRIPT_DIR/backend"

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/.dependencies_installed" ]; then
    echo "Installing backend dependencies..."
    pip install -q -r requirements.txt
    touch venv/.dependencies_installed
fi

# Start backend in background
echo "Starting FastAPI server on http://0.0.0.0:8000"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait a moment for backend to start
sleep 3

# Start Frontend
echo ""
echo "Starting Frontend Server..."
cd "$SCRIPT_DIR/frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Start frontend in background
echo "Starting Vite dev server on http://0.0.0.0:5173"
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

# Wait a moment for frontend to start
sleep 5

# Get local IP address
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

echo ""
echo "=========================================="
echo "✓ Servers are starting!"
echo "=========================================="
echo ""
echo "Access the app in Safari:"
echo "  • http://localhost:5173"
echo "  • http://127.0.0.1:5173"
if [ ! -z "$LOCAL_IP" ]; then
    echo "  • http://$LOCAL_IP:5173"
fi
echo ""
echo "Backend API:"
echo "  • http://localhost:8000"
echo "  • API Docs: http://localhost:8000/docs"
echo ""
echo "Logs:"
echo "  • Backend: tail -f /tmp/backend.log"
echo "  • Frontend: tail -f /tmp/frontend.log"
echo ""
echo "To stop servers:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "=========================================="

