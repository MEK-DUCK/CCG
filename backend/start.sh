#!/bin/bash

# Start script for backend
echo "Starting Oil Lifting Program Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please update .env with your database credentials!"
fi

# Start the server
echo "Starting FastAPI server on http://localhost:8000"
uvicorn app.main:app --reload --port 8000

