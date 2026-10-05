# Multi-Movie Video Playlist Player

A lightweight web application for playing and browsing video playlists with a FastAPI backend and a clean HTML/CSS/JavaScript frontend.

## Structure

- `backend/`: FastAPI server providing API endpoints to list movies and serve video playlists.
- `frontend/`: Interactive responsive web UI (HTML, CSS, JS) for playlist playback.

## Getting Started

### 1. Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn
uvicorn main:app --reload --port 8000
```

### 2. Frontend
Access the frontend by navigating to `http://localhost:8000` in your web browser.

### 3. Features

