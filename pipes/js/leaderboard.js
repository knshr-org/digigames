const LeaderboardAPI = (() => {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get('api') || window.PIPES_API_BASE || '';
  const LS_NAME_KEY = 'pipes_player_name';
  const LS_SCORES_KEY = 'pipes_local_scores';
  const GAME_ID = 'pipes';

  function getStoredName() {
    if (typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn()) {
      return DigiAuth.getUser()?.name || '';
    }
    return localStorage.getItem(LS_NAME_KEY) || '';
  }

  function setStoredName(name) {
    localStorage.setItem(LS_NAME_KEY, name);
  }

  function isLoggedIn() {
    return typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn();
  }

  function getLocalScores() {
    try {
      return JSON.parse(localStorage.getItem(LS_SCORES_KEY)) || [];
    } catch { return []; }
  }

  function saveLocalScore(name, score) {
    const scores = getLocalScores();
    scores.push({ name, score, created_at: new Date().toISOString() });
    if (scores.length > 100) scores.shift();
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(scores));
  }

  async function submitScore(name, score) {
    saveLocalScore(name, score);
    setStoredName(name);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof DigiAuth !== 'undefined') {
        Object.assign(headers, DigiAuth.authHeaders());
      }
      const res = await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, score, game_id: GAME_ID }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Score submit failed, saved locally:', err);
      return { id: null, rank: null, offline: true };
    }
  }

  async function getTopScores(limit = 10) {
    try {
      const res = await fetch(`${API_BASE}/api/scores/top?limit=${limit}&game_id=${GAME_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch top scores, using local:', err);
      const local = getLocalScores();
      const bestByName = new Map();
      for (const s of local) {
        const prev = bestByName.get(s.name);
        if (!prev || s.score > prev.score) bestByName.set(s.name, s);
      }
      const deduped = [...bestByName.values()];
      deduped.sort((a, b) => b.score - a.score);
      return deduped.slice(0, limit).map((s, i) => ({ rank: i + 1, ...s }));
    }
  }

  async function getPlayerScores(name, limit = 10) {
    try {
      const headers = {};
      if (typeof DigiAuth !== 'undefined') {
        Object.assign(headers, DigiAuth.authHeaders());
      }
      const url = `${API_BASE}/api/scores/player?game_id=${GAME_ID}&name=${encodeURIComponent(name)}&limit=${limit}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch player scores, using local:', err);
      const local = getLocalScores().filter(s => s.name === name);
      local.sort((a, b) => b.score - a.score);
      return local.slice(0, limit);
    }
  }

  return { submitScore, getTopScores, getPlayerScores, getStoredName, setStoredName, isLoggedIn };
})();
