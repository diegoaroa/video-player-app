import os
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

app = FastAPI(title="Multi-Movie Video Playlist Player API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VIDEO_ROOT_DIR = os.getenv("VIDEO_ROOT_DIR", "/mnt/storage/media")
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

# Natural sorting helper
def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

def verify_safe_path(movie_id: str) -> str:
    """Validate that the movie directory is a subdirectory of VIDEO_ROOT_DIR to prevent directory traversal."""
    target_path = os.path.realpath(os.path.join(VIDEO_ROOT_DIR, movie_id))
    root_path = os.path.realpath(VIDEO_ROOT_DIR)
    if not target_path.startswith(root_path):
        raise HTTPException(status_code=403, detail="Access denied: invalid path")
    return target_path

@app.get("/api/movies")
def list_movies():
    if not os.path.exists(VIDEO_ROOT_DIR):
        raise HTTPException(status_code=404, detail="Media root directory not found")
    
    try:
        entries = os.listdir(VIDEO_ROOT_DIR)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read media root: {str(e)}")
        
    movies = []
    for entry in entries:
        if entry.startswith("."):
            continue
        entry_path = os.path.join(VIDEO_ROOT_DIR, entry)
        if os.path.isdir(entry_path):
            # Check if there are any MP4 files inside to consider it a movie folder
            try:
                has_mp4 = any(f.lower().endswith(".mp4") for f in os.listdir(entry_path))
            except Exception:
                has_mp4 = False
            
            # We include it if it's a directory (even if empty, we let it list empty playlist)
            # but folders with mp4 are definitely movies.
            movies.append({
                "id": entry,
                "title": entry,
                "has_videos": has_mp4
            })
            
    # Sort movies alphabetically
    movies.sort(key=lambda x: x["title"].lower())
    return movies

@app.get("/api/movies/{movie_id}/videos")
def list_videos(movie_id: str):
    movie_path = verify_safe_path(movie_id)
    
    if not os.path.exists(movie_path) or not os.path.isdir(movie_path):
        raise HTTPException(status_code=404, detail="Movie not found")
        
    try:
        files = [f for f in os.listdir(movie_path) if f.lower().endswith(".mp4")]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read movie directory: {str(e)}")
        
    # Sort files naturally
    files.sort(key=natural_sort_key)
    
    video_list = []
    for f in files:
        # Generate a clean title
        title = os.path.splitext(f)[0].replace("_", " ")
        video_list.append({
            "id": f,
            "filename": f,
            "title": title,
            # URL must point to /videos/movie_id/filename (FastAPI serves this statically)
            "url": f"/videos/{movie_id}/{f}"
        })
    return video_list

# Mount parent video directory (serves nested static files, supports range requests natively)
if os.path.exists(VIDEO_ROOT_DIR):
    app.mount("/videos", StaticFiles(directory=VIDEO_ROOT_DIR), name="videos")

# Mount frontend static files
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/", response_class=HTMLResponse)
    def read_root():
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            with open(index_path, "r", encoding="utf-8") as f:
                return f.read()
        return "Frontend index.html not found. Please create it."
else:
    @app.get("/")
    def read_root():
        return {"message": "Video player API is running. Please set up the frontend folder."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8008))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
