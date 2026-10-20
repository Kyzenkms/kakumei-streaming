# KyzenStream - Complete Changelog

## Version 1.0.7 - Seek & Subtitle Reliability (October 20, 2026)

### Mobile
- Seek bar drag rebuilt on a stable anchor: taps and drags both land where you release
- Player no longer snaps back to the start while the stream re-buffers after a seek
- Subtitle track choice survives episode and quality switches
- Sync slider widened to +/-30s in 0.25s steps; WebVTT X-TIMESTAMP-MAP offsets applied
- 24-hue colour wheel plus 8 tone rings, including true black and charcoal with an adaptive outline
- Overlapping cues no longer drop the visible line
- Android: versionCode 13, versionName 1.0.7

### Web / Desktop player
- Subtitle colour selector actually changes colour (it was writing to the size field)
- Late subtitle-list merges keep the chosen track and playback position instead of restarting at 0:00
- Stale subtitle downloads can no longer overwrite a newer track selection
- Bigger seek-bar hit target; controls stay reachable on touch devices
- Wider sync presets and black/grey/extra colour choices

### Backend
- Subtitle search ranks exact movie matches first and drops series/season packs for films


## Version 1.0.6 - Episode Switching & Resolve Speed (October 19, 2026)

### Mobile
- Switching episodes keeps the player on screen (spinner inside the video area) instead of flashing the full "Resolving stream" page
- NetMirror series read their season/episode lists from NetMirror itself, including skipped episodes, instead of TMDB
- The next three episodes prewarm in the background while you watch, so binge hops land on a warm cache
- Android: versionCode 12, versionName 1.0.6

### Backend
- Cold stream resolves cut from 24-30s to roughly 6-10s: subtitle lookup parallelized, dash fallback runs concurrently, HLS bridge capped at a 5s deadline, sibling episodes raced
- Last-good results are saved on every success path, so revisiting an episode stays instant

## Version 1.0.5 - Picker & Playback Fixes (October 19, 2026)

### Mobile
- Custom colour picker rebuilt natively: tap a hue on the ring, then a tone (no WebView, works on device)
- Seek bar no longer springs back to the pre-seek position while the stream catches up
- NetMirror titles from search ("Breaking Bad S1-S5" etc.) now resolve their TMDB twin, so series show the full episode list and seasons
- Playback starts sooner: recommendations and episode metadata no longer compete with stream resolution
- Next episode resolves in the background while you watch (binge prewarm)
- Android: versionCode 11, versionName 1.0.5

## Version 1.0.4 - Player & Personalisation (October 19, 2026)

### Mobile
- Player rebuilt: dedicated portrait and landscape control layouts, no overlapping transport
- Compact settings and episodes cards (top-right) instead of full-screen sheets
- Episode picker: season dropdown + instant search
- Watch party docks to the right; video shrinks beside chat
- Audio row shows and highlights the current language/dub
- Black Luxury (onyx & gold) theme and a custom colour wheel for accents
- Background play toggle (keeps audio playing when the app is backgrounded)
- Glassy "What's new" card on first launch after an update
- Anime-aware TMDB matching (correct anime entry, no live-action mix-ups)
- Android: versionCode 10, versionName 1.0.4
## Version 2.0 - Major UI Overhaul (April 28, 2026)

### 🎨 UI/UX Improvements
- Complete redesign with premium dark theme
- Added smooth animations and transitions
- Improved color palette with purple/sky gradients
- Better typography with Space Grotesk font
- Enhanced responsive design for mobile/tablet/desktop

### 📱 Pages Upgraded
1. **Home Page**
   - Hero banner with featured content
   - Continue Watching section
   - Bookmarks preview
   - Live search functionality
   - Better category sections

2. **Discover Page**
   - Year filters (All Years, 2024, 2023, etc.)
   - Rating filters (8+, 7+, 6+)
   - Sort options (Popularity, Rating, Newest, Oldest)
   - Category tabs (Movies, TV, Anime, Popular, Top Rated)

3. **Player Page**
   - Quality selector (360p, 480p, 720p, 1080p, Auto)
   - "Try Next Server" button
   - Info overlay with movie details
   - Bookmark functionality
   - Share button with clipboard
   - Fullscreen toggle
   - Mute/unmute
   - Keyboard shortcuts (F, M, I, N, arrows)
   - Episode navigation for TV shows

4. **MediaGrid Component**
   - Hover effects with zoom animation
   - Rating badges
   - Type badges (Movie/TV)
   - Bookmark buttons
   - Loading skeletons

### 🦶 Footer Added
- Brand section with logo
- Category links
- Legal links
- Connect/social placeholders
- Server status indicator
- Copyright notice
- "Back to Top" button

### 🔧 Technical Improvements
- Error boundary for graceful error handling
- SEO meta tags (Open Graph, Twitter Cards)
- Preconnect to TMDB domains
- Lazy loading images
- Optimized bundle size
- Clean code structure

### 🔄 Features Added
- **Search**: Live search with dropdown results
- **Filters**: Year, rating, sort filters on Discover
- **Bookmarks**: Save favorite movies/shows
- **Continue Watching**: Track watch progress
- **Keyboard Shortcuts**: Control player with keys

### 📁 Project Structure
```
kyzen-stream/
├── src/
│   ├── components/
│   │   ├── Footer.jsx      (NEW)
│   │   ├── MediaGrid.jsx   (Enhanced)
│   │   ├── Navbar.jsx      (Enhanced)
│   │   └── Sidebar.jsx
│   ├── pages/
│   │   ├── Discover.jsx    (Enhanced)
│   │   ├── Home.jsx        (Enhanced)
│   │   └── Player.jsx      (Enhanced)
│   ├── services/
│   │   └── api.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html              (SEO optimized)
└── dist/                  (Production build)
```

### ✅ Backups Created
- kyzen-stream-20260428-085751-UI-UPGRADE.tar.gz
- kyzen-stream-FINAL-20260428-100956.tar.gz
- kyzen-stream-MISSION-START.tar.gz
- kyzen-stream-FINAL-V2-20260428-101502.tar.gz

### 🚀 Running At
- Development: http://localhost:5173
- Production build available in /dist

---

## Previous Version (v1.0)
- Basic streaming site
- Simple player with server selection
- Basic movie/TV browsing
- No advanced features
