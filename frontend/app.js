// DOM Elements
const movieSelector = document.getElementById('movie-selector');
const videoPlayer = document.getElementById('video-player');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const currentVideoTitle = document.getElementById('current-video-title');
const autoplayToggle = document.getElementById('autoplay-toggle');
const playlistEl = document.getElementById('playlist');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const playlistProgressBar = document.getElementById('playlist-progress-bar');
const progressText = document.getElementById('progress-text');
const speedBtn = document.getElementById('speed-btn');
const speedMenu = document.getElementById('speed-menu');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const videoOverlayPlay = document.getElementById('video-overlay-play');

// State Variables
let movies = [];
let currentMovieId = '';
let videos = [];
let currentVideoIndex = -1;
let lastSavedTime = 0;

// Persistent states maps
let watchedVideosMap = {}; // movieId -> array of videoIds
let historyMap = {};       // movieId -> { videoId, time }

// LocalStorage Keys
const STORAGE_CURRENT_MOVIE = 'cinemaStream_currentMovie';
const STORAGE_WATCHED_MAP = 'cinemaStream_watched';
const STORAGE_HISTORY_MAP = 'cinemaStream_history';
const STORAGE_AUTOPLAY = 'cinemaStream_autoplay';
const STORAGE_VOLUME = 'cinemaStream_volume';

// Initialize App
async function init() {
    loadSettings();
    setupEventListeners();
    await fetchMovies();
}

// Load Settings from LocalStorage
function loadSettings() {
    // Watched videos map
    const savedWatched = localStorage.getItem(STORAGE_WATCHED_MAP);
    if (savedWatched) {
        try {
            watchedVideosMap = JSON.parse(savedWatched);
        } catch (e) {
            watchedVideosMap = {};
        }
    }

    // Playback history map
    const savedHistory = localStorage.getItem(STORAGE_HISTORY_MAP);
    if (savedHistory) {
        try {
            historyMap = JSON.parse(savedHistory);
        } catch (e) {
            historyMap = {};
        }
    }

    // Autoplay preference
    const savedAutoplay = localStorage.getItem(STORAGE_AUTOPLAY);
    if (savedAutoplay !== null) {
        autoplayToggle.checked = savedAutoplay === 'true';
    }

    // Volume preference
    const savedVolume = localStorage.getItem(STORAGE_VOLUME);
    if (savedVolume !== null) {
        const vol = parseFloat(savedVolume);
        videoPlayer.volume = vol;
        volumeSlider.value = vol;
        updateVolumeIcon(vol);
    }
}

// Fetch Movies list from API
async function fetchMovies() {
    try {
        const response = await fetch('/api/movies');
        if (!response.ok) throw new Error('Failed to fetch movies');
        
        movies = await response.json();
        
        if (movies.length === 0) {
            playlistEl.innerHTML = `
                <div class="no-results">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>No movie folders found in the media directory.</p>
                </div>`;
            return;
        }

        // Render movie dropdown
        movieSelector.innerHTML = '';
        movies.forEach(movie => {
            const option = document.createElement('option');
            option.value = movie.id;
            option.textContent = movie.title;
            movieSelector.appendChild(option);
        });

        // Determine starting movie
        let startMovieId = movies[0].id;
        const savedMovieId = localStorage.getItem(STORAGE_CURRENT_MOVIE);
        if (savedMovieId && movies.some(m => m.id === savedMovieId)) {
            startMovieId = savedMovieId;
        }

        movieSelector.value = startMovieId;
        await selectMovie(startMovieId, false);

    } catch (error) {
        console.error('Error fetching movies:', error);
        playlistEl.innerHTML = `
            <div class="no-results" style="color: #ef4444;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error loading movies. Make sure the server is running.</p>
            </div>`;
    }
}

// Switch selected movie
async function selectMovie(movieId, autoPlayFirst = true) {
    currentMovieId = movieId;
    localStorage.setItem(STORAGE_CURRENT_MOVIE, movieId);
    
    // Reset search
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';

    // Show loading
    playlistEl.innerHTML = `
        <div class="playlist-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Loading playlist...</p>
        </div>`;

    try {
        const response = await fetch(`/api/movies/${encodeURIComponent(movieId)}/videos`);
        if (!response.ok) throw new Error('Failed to fetch videos');
        
        videos = await response.json();
        
        if (videos.length === 0) {
            playlistEl.innerHTML = `
                <div class="no-results">
                    <i class="fa-solid fa-film"></i>
                    <p>No video files found in this movie folder.</p>
                </div>`;
            currentVideoTitle.textContent = 'No videos available';
            videoPlayer.removeAttribute('src');
            updatePlayPauseUI(false);
            updateProgress();
            return;
        }

        renderPlaylist(videos);
        updateProgress();

        // Restore playback history for this movie
        const history = historyMap[movieId];
        let startIndex = 0;
        let startPosition = 0;

        if (history) {
            const index = videos.findIndex(v => v.id === history.videoId);
            if (index !== -1) {
                startIndex = index;
                startPosition = history.time || 0;
            }
        }

        // Select the video track
        selectVideo(startIndex, autoPlayFirst);

        // Restore playback position if applicable
        if (startPosition > 0) {
            videoPlayer.addEventListener('loadedmetadata', () => {
                videoPlayer.currentTime = startPosition;
            }, { once: true });
        }

    } catch (error) {
        console.error('Error loading movie chapters:', error);
        playlistEl.innerHTML = `
            <div class="no-results" style="color: #ef4444;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error loading chapters for this movie.</p>
            </div>`;
    }
}

// Render Playlist in sidebar
function renderPlaylist(itemsToRender) {
    if (itemsToRender.length === 0) {
        playlistEl.innerHTML = `
            <div class="no-results">
                <i class="fa-solid fa-magnifying-glass"></i>
                <p>No chapters match your search.</p>
            </div>`;
        return;
    }

    playlistEl.innerHTML = '';
    
    // Get watched set for current movie
    const watchedSet = new Set(watchedVideosMap[currentMovieId] || []);

    itemsToRender.forEach(video => {
        const originalIndex = videos.findIndex(v => v.id === video.id);
        const isActive = originalIndex === currentVideoIndex;
        const isWatched = watchedSet.has(video.id);

        const item = document.createElement('div');
        item.className = `playlist-item ${isActive ? 'active' : ''}`;
        item.dataset.index = originalIndex;

        item.innerHTML = `
            <div class="item-index">
                <i class="fa-solid fa-play item-status-icon"></i>
                <span class="item-index-num">${String(originalIndex + 1).padStart(2, '0')}</span>
            </div>
            <div class="item-details">
                <div class="item-title" title="${video.title}">${video.title}</div>
                <div class="item-meta">
                    ${isWatched ? '<span class="badge-watched"><i class="fa-solid fa-check"></i> Watched</span>' : ''}
                </div>
            </div>
        `;

        item.addEventListener('click', () => {
            selectVideo(originalIndex, true);
        });

        playlistEl.appendChild(item);
    });
}

// Select a video and load it
function selectVideo(index, playImmediate = true) {
    if (index < 0 || index >= videos.length) return;
    
    currentVideoIndex = index;
    const video = videos[index];
    
    // Set title
    currentVideoTitle.textContent = video.title;
    
    // Load video source
    videoPlayer.src = video.url;
    
    // Update active state in playlist sidebar
    const items = playlistEl.querySelectorAll('.playlist-item');
    items.forEach(item => {
        if (parseInt(item.dataset.index) === index) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });

    // Save playing video to history map
    if (!historyMap[currentMovieId]) {
        historyMap[currentMovieId] = {};
    }
    historyMap[currentMovieId].videoId = video.id;
    historyMap[currentMovieId].time = 0;
    localStorage.setItem(STORAGE_HISTORY_MAP, JSON.stringify(historyMap));

    if (playImmediate) {
        videoPlayer.play().catch(err => {
            console.log("Playback failed (possibly blocked by browser policy):", err);
            updatePlayPauseUI(false);
        });
    } else {
        updatePlayPauseUI(false);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Movie selection dropdown change event
    movieSelector.addEventListener('change', (e) => {
        selectMovie(e.target.value, true);
    });

    // Play / Pause toggles
    playBtn.addEventListener('click', togglePlay);
    videoPlayer.addEventListener('click', togglePlay);
    videoOverlayPlay.addEventListener('click', togglePlay);

    // Prev / Next tracks
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);

    // Playback events
    videoPlayer.addEventListener('play', () => updatePlayPauseUI(true));
    videoPlayer.addEventListener('pause', () => updatePlayPauseUI(false));
    videoPlayer.addEventListener('ended', handleVideoEnded);
    
    // Progress / Time Updates
    videoPlayer.addEventListener('timeupdate', handleTimeUpdate);
    videoPlayer.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Mute / Volume controls
    muteBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', handleVolumeSlider);

    // Speed Selector controls
    speedBtn.addEventListener('click', toggleSpeedMenu);
    document.querySelectorAll('.speed-option').forEach(option => {
        option.addEventListener('click', (e) => {
            changeSpeed(parseFloat(e.target.dataset.speed));
        });
    });
    
    // Close speed menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!speedBtn.contains(e.target) && !speedMenu.contains(e.target)) {
            speedMenu.classList.remove('show');
        }
    });

    // Fullscreen controls
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    videoPlayer.addEventListener('dblclick', toggleFullscreen);

    // Autoplay toggle save
    autoplayToggle.addEventListener('change', () => {
        localStorage.setItem(STORAGE_AUTOPLAY, autoplayToggle.checked);
    });

    // Search and Filter list
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        handleSearch();
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Play / Pause Logic
function togglePlay() {
    if (!videoPlayer.src) return;
    if (videoPlayer.paused) {
        videoPlayer.play().catch(err => console.log("Playback error:", err));
    } else {
        videoPlayer.pause();
    }
}

function updatePlayPauseUI(isPlaying) {
    if (isPlaying) {
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        videoOverlayPlay.classList.remove('visible');
    } else {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        if (videoPlayer.src) {
            videoOverlayPlay.classList.add('visible');
        } else {
            videoOverlayPlay.classList.remove('visible');
        }
    }
}

// Next / Previous Chapter Logic
function playNext() {
    if (videos.length === 0) return;
    let nextIndex = currentVideoIndex + 1;
    if (nextIndex >= videos.length) {
        nextIndex = 0; // loop back to first
    }
    selectVideo(nextIndex, true);
}

function playPrevious() {
    if (videos.length === 0) return;
    let prevIndex = currentVideoIndex - 1;
    if (prevIndex < 0) {
        prevIndex = videos.length - 1; // loop to last
    }
    selectVideo(prevIndex, true);
}

// Handle video complete / Autoplay Next
function handleVideoEnded() {
    if (currentVideoIndex !== -1 && videos[currentVideoIndex]) {
        markAsWatched(videos[currentVideoIndex].id);
    }

    if (autoplayToggle.checked) {
        playNext();
    } else {
        updatePlayPauseUI(false);
    }
}

// Mark video as watched and save state
function markAsWatched(videoId) {
    if (!watchedVideosMap[currentMovieId]) {
        watchedVideosMap[currentMovieId] = [];
    }
    
    if (!watchedVideosMap[currentMovieId].includes(videoId)) {
        watchedVideosMap[currentMovieId].push(videoId);
        localStorage.setItem(STORAGE_WATCHED_MAP, JSON.stringify(watchedVideosMap));
    }
    
    updateProgress();
    
    // Re-render playlist to show badge
    const query = searchInput.value.toLowerCase();
    const filtered = videos.filter(v => v.title.toLowerCase().includes(query));
    renderPlaylist(filtered);
}

// Update Playlist Progress stats
function updateProgress() {
    if (videos.length === 0) {
        progressText.textContent = "0 / 0 Completed";
        playlistProgressBar.style.width = "0%";
        return;
    }
    
    const watchedList = watchedVideosMap[currentMovieId] || [];
    // Count how many of the current movie's videos are in the watched list
    const currentWatchedCount = videos.filter(v => watchedList.includes(v.id)).length;
    const percentage = (currentWatchedCount / videos.length) * 100;
    
    progressText.textContent = `${currentWatchedCount} / ${videos.length} Completed`;
    playlistProgressBar.style.width = `${percentage}%`;
}

// Time Updates
function handleTimeUpdate() {
    const current = videoPlayer.currentTime;
    currentTimeEl.textContent = formatTime(current);
    
    // Throttle saving timestamp (every 2 seconds)
    if (Math.abs(current - lastSavedTime) > 2) {
        if (!historyMap[currentMovieId]) {
            historyMap[currentMovieId] = {};
        }
        historyMap[currentMovieId].videoId = videos[currentVideoIndex].id;
        historyMap[currentMovieId].time = current;
        localStorage.setItem(STORAGE_HISTORY_MAP, JSON.stringify(historyMap));
        lastSavedTime = current;
    }

    // Mark as watched early (at 92% completion)
    if (videoPlayer.duration && (current / videoPlayer.duration) > 0.92) {
        if (currentVideoIndex !== -1 && videos[currentVideoIndex]) {
            const videoId = videos[currentVideoIndex].id;
            const watchedList = watchedVideosMap[currentMovieId] || [];
            if (!watchedList.includes(videoId)) {
                markAsWatched(videoId);
            }
        }
    }
}

function handleLoadedMetadata() {
    durationEl.textContent = formatTime(videoPlayer.duration);
}

// Formatting Helper (Seconds -> M:SS or H:MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const formattedSeconds = s < 10 ? `0${s}` : s;
    
    if (h > 0) {
        const formattedMinutes = m < 10 ? `0${m}` : m;
        return `${h}:${formattedMinutes}:${formattedSeconds}`;
    }
    return `${m}:${formattedSeconds}`;
}

// Volume Controls
function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
    if (videoPlayer.muted) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        volumeSlider.value = 0;
    } else {
        volumeSlider.value = videoPlayer.volume;
        updateVolumeIcon(videoPlayer.volume);
    }
}

function handleVolumeSlider(e) {
    const val = parseFloat(e.target.value);
    videoPlayer.volume = val;
    videoPlayer.muted = val === 0;
    updateVolumeIcon(val);
    localStorage.setItem(STORAGE_VOLUME, val);
}

function updateVolumeIcon(volume) {
    if (volume === 0 || videoPlayer.muted) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    } else if (volume < 0.4) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    }
}

// Playback Speed dropdown menu
function toggleSpeedMenu() {
    speedMenu.classList.toggle('show');
}

function changeSpeed(rate) {
    videoPlayer.playbackRate = rate;
    speedBtn.textContent = `${rate}x`;
    
    // Update active styling
    document.querySelectorAll('.speed-option').forEach(opt => {
        if (parseFloat(opt.dataset.speed) === rate) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
    
    speedMenu.classList.remove('show');
}

// Fullscreen Actions
function toggleFullscreen() {
    if (!videoPlayer.src) return;
    if (!document.fullscreenElement) {
        const wrapper = document.querySelector('.player-wrapper');
        if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen();
        } else if (videoPlayer.requestFullscreen) {
            videoPlayer.requestFullscreen();
        }
    } else {
        document.exitFullscreen();
    }
}

// Handle Fullscreen UI updates
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    } else {
        fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    }
});

// Search Filtering
function handleSearch() {
    const query = searchInput.value.trim().toLowerCase();
    
    if (query) {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
    }
    
    const filtered = videos.filter(video => 
        video.title.toLowerCase().includes(query)
    );
    
    renderPlaylist(filtered);
    
    // Maintain active class
    const activeItem = playlistEl.querySelector(`.playlist-item[data-index="${currentVideoIndex}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// Keyboard shortcuts handlers
function handleKeyboardShortcuts(e) {
    // Avoid shortcuts triggering while typing in search box
    if (document.activeElement === searchInput) return;
    if (!videoPlayer.src) return;

    switch (e.key.toLowerCase()) {
        case ' ': // Space
            e.preventDefault();
            togglePlay();
            break;
        case 'arrowright': // seek forward 10s
            e.preventDefault();
            videoPlayer.currentTime = Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + 10);
            break;
        case 'arrowleft': // seek backward 10s
            e.preventDefault();
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
            break;
        case 'arrowup': // volume up 5%
            e.preventDefault();
            const volUp = Math.min(1, videoPlayer.volume + 0.05);
            videoPlayer.volume = volUp;
            volumeSlider.value = volUp;
            updateVolumeIcon(volUp);
            localStorage.setItem(STORAGE_VOLUME, volUp);
            break;
        case 'arrowdown': // volume down 5%
            e.preventDefault();
            const volDown = Math.max(0, videoPlayer.volume - 0.05);
            videoPlayer.volume = volDown;
            volumeSlider.value = volDown;
            updateVolumeIcon(volDown);
            localStorage.setItem(STORAGE_VOLUME, volDown);
            break;
        case 'f': // Fullscreen toggle
            e.preventDefault();
            toggleFullscreen();
            break;
        case 'n': // Next chapter
            e.preventDefault();
            playNext();
            break;
        case 'p': // Previous chapter
            e.preventDefault();
            playPrevious();
            break;
    }
}

// Start the App
window.addEventListener('DOMContentLoaded', init);
