const DigiAuth = (() => {
  const LS_TOKEN_KEY = 'digigames_token';
  const LS_USER_KEY = 'digigames_user';

  function getApiBase() {
    const params = new URLSearchParams(window.location.search);
    return params.get('api') || window.DIGIGAMES_API_BASE || '';
  }

  function getToken() { return localStorage.getItem(LS_TOKEN_KEY); }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(LS_USER_KEY)); } catch { return null; }
  }

  function setAuth(token, user) {
    localStorage.setItem(LS_TOKEN_KEY, token);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }

  function isLoggedIn() { return !!getToken(); }

  function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function register(name, username, password) {
    const res = await fetch(`${getApiBase()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setAuth(data.token, data.user);
    return data.user;
  }

  async function login(username, password) {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setAuth(data.token, data.user);
    return data.user;
  }

  function logout() { clearAuth(); }

  async function verify() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) { clearAuth(); return null; }
      const user = await res.json();
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
      return user;
    } catch { return getUser(); }
  }

  return { getToken, getUser, isLoggedIn, authHeaders, register, login, logout, verify };
})();
