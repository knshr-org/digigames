# DigiGames

Browser game platform at [digigames.fun](https://digigames.fun).

## Project Structure

```
digigames/
├── index.html          Main menu (loads games in iframe)
├── js/
│   └── auth.js         Shared auth module (DigiAuth)
├── games/
│   ├── pipes/          Flappy pipes game
│   │   ├── index.html      Source HTML (edit this)
│   │   ├── js/             Source JS (audio.js, leaderboard.js)
│   │   ├── build-bundle.js Inlines JS into pipes.html
│   │   └── pipes.html      Bundled output (don't edit directly)
│   └── snake/          Snake merge game
│       └── index.html      Single-file game
├── api/                Express API server
│   ├── server.js       Routes (auth, scores, static files)
│   ├── migrate.js      Migration runner
│   └── package.json    API dependencies
├── migrations/         Database migrations (auto-run on server start)
└── package.json        Root scripts
```

## Adding a New Game

1. Create `games/<game-name>/index.html`

2. Add route in `index.html`:
```js
const ROUTES = {
  snake: { src: 'games/snake/index.html', title: 'SNAKE' },
  pipes: { src: 'games/pipes/pipes.html', title: 'PIPES' },
  yourgame: { src: 'games/yourgame/index.html', title: 'YOUR GAME' },
};
```

3. Add a card in the `.games` grid in `index.html`:
```html
<a class="card yourgame" href="#yourgame" data-game="yourgame">
  <div class="icon">🎮</div>
  <div class="info">
    <div class="name">YOUR GAME</div>
    <div class="desc">Short description</div>
  </div>
  <div class="play-btn">PLAY</div>
</a>
```

4. Register the game_id in `api/server.js`:
```js
const VALID_GAME_IDS = ['pipes', 'snake', 'yourgame'];
```

5. Add auth + leaderboard support in your game HTML:
```html
<script src="../../js/auth.js"></script>
<script>
  // Use DigiAuth for login state
  var loggedIn = typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn();
  var playerName = loggedIn ? DigiAuth.getUser().name : '';

  // Submit score
  var headers = { 'Content-Type': 'application/json' };
  if (loggedIn) Object.assign(headers, DigiAuth.authHeaders());

  fetch('/api/scores', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ name: playerName, score: 42, game_id: 'yourgame' }),
  });

  // Fetch top scores
  fetch('/api/scores/top?game_id=yourgame&limit=10');

  // Fetch player scores
  fetch('/api/scores/player?game_id=yourgame&name=' + encodeURIComponent(playerName));
</script>
```

## Adding a Migration

Migrations live in `migrations/` and auto-run on server startup.

1. Create a new SQL file with the next sequence number:
```
migrations/004_your_change.sql
```

2. Write standard SQL:
```sql
ALTER TABLE scores ADD COLUMN some_field VARCHAR(50) NULL;
```

3. The migration runner:
   - Tracks applied migrations in a `migrations` table
   - Runs pending migrations in filename order
   - Each migration runs in a transaction (rolls back on failure)
   - Runs automatically on `npm start` (server startup)

4. To check migration status:
```bash
npm run migrate:status
```

5. To run migrations manually:
```bash
npm run migrate
```

## API Endpoints

### Auth
- `POST /api/auth/register` — `{ name, username, password }` → `{ token, user }`
- `POST /api/auth/login` — `{ username, password }` → `{ token, user }`
- `GET /api/auth/me` — Bearer token → `{ id, name, username }`

### Scores
- `POST /api/scores` — `{ name, score, game_id }` (name optional if authenticated)
- `GET /api/scores/top?game_id=pipes&limit=10` — Global leaderboard (best per player)
- `GET /api/scores/player?game_id=pipes&name=Ken&limit=10` — Player scores

Auth is optional. Pass `Authorization: Bearer <token>` to link scores to user account.

## Development

```bash
npm install          # installs api dependencies
npm start            # starts Express server on port 3000
```

Server serves all static files from the project root. Games are accessible at `http://localhost:3000/#pipes`, `http://localhost:3000/#snake`.

### Pipes Build

After editing pipes source files, rebuild the bundle:
```bash
node games/pipes/build-bundle.js
```

## Deployment

Deployed on Railway. Push to `main` triggers auto-deploy. Set `JWT_SECRET` env var for production auth.
