// Stand-in for normal site traffic: keeps the cache warm. No JS, no exposures, fixed pool of 20 identities.
const PORT = process.env.PORT || 8080; let i = 0;
setInterval(() => { fetch(`http://127.0.0.1:${PORT}/`, { headers: { cookie: `uid=warm-${i++ % 20}` } }).catch(() => {}); }, 2000);
