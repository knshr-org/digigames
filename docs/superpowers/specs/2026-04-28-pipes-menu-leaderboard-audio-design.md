# Pipes Game: Menu, Leaderboard & Audio System

## Overview

Add a main menu, leaderboard system with MySQL persistence, audio (BGM + SFX), and an improved death screen to the pipes game.

## Screen Flow

```
MAIN MENU ──→ PLAY ──→ GAME OVER
  ├─ Start         │       ├─ Retry → PLAY
  ├─ Leaderboards  │       ├─ Menu → MAIN MENU
  └─ Settings      │       └─ Submit Score → name prompt → API
                   │
                   └─ Pause
                        ├─ Resume
                        └─ Menu → MAIN MENU
```

### Main Menu

Replaces the current "start hint" SVG overlay. Three vertically stacked buttons in the same visual style as the existing game UI (Rubik font, rounded pill buttons, dark translucent card background):

- **START** — begins gameplay (coral accent color)
- **LEADERBOARDS** — opens leaderboard overlay
- **SETTINGS** — opens audio settings overlay

The game title "PIPES" stays as the header. Background scenery (sky, clouds, hills, ground) remains animated behind the menu.

### Game Over Screen

Replaces the current single "TAP OR PRESS R" button with:

- Existing elements: GAME OVER header, medal slot, score, best score
- **Name input**: text field (max 20 chars) for score submission, pre-filled with last used name from localStorage
- **SUBMIT** button: sends score to the API, disabled after submission, shows checkmark
- **RETRY** button: restarts the game immediately
- **MENU** button: returns to main menu

Score submission is optional — players can retry or go to menu without submitting.

### Pause Overlay

Updated to include:

- "PAUSED" header (existing)
- **RESUME** button (tap or press P)
- **MENU** button: returns to main menu (confirms first: "Quit to menu? Progress will be lost.")

### Leaderboard Screen

SVG overlay with two tabs:

- **GLOBAL** tab: top 10 scores across all players. Shows rank, name, score, date.
- **MY SCORES** tab: score history for the current player name (from localStorage). Shows score, date, sorted by score descending.

Each row: `#1  PlayerName ......... 42  Apr 28`

Loading state: "Loading..." text. Error state: "Could not load scores" with a retry button. Falls back to localStorage scores if API is unreachable.

### Settings Screen

SVG overlay with:

- **Music** volume slider (0–100%) + mute toggle
- **Sound Effects** volume slider (0–100%) + mute toggle
- **Back** button to return to menu

Settings persisted to localStorage under key `pipes_settings`:
```json
{
  "bgmVolume": 0.7,
  "sfxVolume": 0.8,
  "bgmMuted": false,
  "sfxMuted": false
}
```

## Audio System

### Background Music (BGM)

- Single looping track loaded via `<audio>` element
- Placeholder: royalty-free chiptune/casual game music file (`assets/bgm.mp3`)
- Starts on first user interaction (browser autoplay policy compliance)
- Fades out on game over, fades back in on menu/retry
- Volume controlled by settings slider

### Sound Effects (SFX)

Generated programmatically via Web Audio API oscillators (no audio files needed):

| Event | Sound | Description |
|-------|-------|-------------|
| Flap | Short chirp | Quick sine wave pitch-up, 80ms |
| Score | Rising ding | Two-tone ascending, 150ms |
| Powerup collect | Sparkle | Rapid arpeggio, 200ms |
| Hit/Death | Low thud | Low freq sine + noise, 300ms |
| Milestone banner | Fanfare | Three-note ascending chord, 400ms |
| Menu button press | Click | Short tick, 50ms |
| Score submit | Success chime | Bright two-tone, 150ms |

Each SFX function creates a short-lived oscillator node, so no cleanup is needed. Volume controlled by settings slider.

### Audio Manager (`js/audio.js`)

```
AudioManager
  ├─ init()              — create AudioContext on first interaction
  ├─ playBGM()           — start/resume background music
  ├─ stopBGM()           — pause background music
  ├─ fadeBGM(vol, dur)   — fade BGM volume over duration
  ├─ playSFX(name)       — play a named sound effect
  ├─ setBGMVolume(v)     — set BGM volume 0-1
  ├─ setSFXVolume(v)     — set SFX volume 0-1
  ├─ loadSettings()      — load from localStorage
  └─ saveSettings()      — save to localStorage
```

## Leaderboard System

### API Server (`api/server.js`)

Minimal Express server deployed on Railway. Reads MySQL credentials from Railway environment variables.

**Endpoints:**

#### `POST /api/scores`
- Body: `{ "name": "string (1-20 chars)", "score": "integer (>0)" }`
- Validates input, inserts into `scores` table
- Returns: `{ "id": 123, "rank": 5 }`
- Rate limited: max 10 submissions per IP per minute

#### `GET /api/scores/top?limit=10`
- Returns top N scores globally (default 10, max 50)
- Response: `[{ "rank": 1, "name": "Ken", "score": 42, "created_at": "2026-04-28T..." }]`

#### `GET /api/scores/player?name=Ken&limit=10`
- Returns a player's score history, sorted by score descending
- Response: `[{ "score": 42, "created_at": "2026-04-28T..." }]`

**CORS:** Allow requests from the game's origin (or `*` for development).

### MySQL Schema

```sql
CREATE TABLE scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_score (score DESC),
  INDEX idx_name_score (name, score DESC)
);
```

### API Client (`js/leaderboard.js`)

```
LeaderboardAPI
  ├─ submitScore(name, score)    — POST to API, also saves to localStorage
  ├─ getTopScores(limit)         — GET global top scores, fallback to localStorage
  ├─ getPlayerScores(name, limit)— GET player history, fallback to localStorage
  ├─ getStoredName()             — get last used name from localStorage
  └─ setStoredName(name)         — save name to localStorage
```

localStorage keys:
- `pipes_player_name` — last entered player name
- `pipes_local_scores` — array of `{ name, score, date }` for offline fallback

### API Base URL

Configurable constant at the top of `leaderboard.js`. Points to the Railway deployment URL. For local development, can be overridden via a query parameter `?api=http://localhost:3000`.

## File Structure

```
pipes/
  index.html              — game + all SVG menu/overlay screens
  js/
    audio.js              — AudioManager: BGM + SFX
    leaderboard.js        — LeaderboardAPI: API client + localStorage
  assets/
    bgm.mp3              — background music track (royalty-free)
    player-logo.png       — (existing)
    player-logo-2.png     — (existing)
  api/
    server.js             — Express API server
    package.json          — dependencies: express, mysql2, cors, express-rate-limit
    .env.example          — template for Railway env vars
```

## Integration Points

### Game State Changes → Audio

- `startGame()` → `audio.playBGM()`, `audio.playSFX('click')`
- `flap()` → `audio.playSFX('flap')`
- Pipe scored → `audio.playSFX('score')`
- Powerup collected → `audio.playSFX('powerup')`
- `gameOver()` → `audio.playSFX('hit')`, `audio.fadeBGM(0, 500)`
- Milestone banner → `audio.playSFX('milestone')`
- Menu/button press → `audio.playSFX('click')`

### Game State Changes → Menu

- New mode `'menu'` added to state machine alongside existing `'start'`, `'play'`, `'pause'`, `'over'`
- `'start'` mode is removed — game boots into `'menu'` mode instead
- Menu button on game over/pause → `state.mode = 'menu'`, show menu overlay, reset game state

### New Game Modes

```
'menu'  → main menu visible, scenery animating in background
'play'  → active gameplay
'pause' → pause overlay with resume/menu options
'over'  → game over overlay with retry/menu/submit options
```

The `'start'` mode is absorbed into `'menu'`.
