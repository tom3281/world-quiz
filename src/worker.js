// ===== Constants =====
const PHASES = {
  LOBBY: "lobby",
  LOADING: "loading",
  VIEW: "view",
  GUESS: "guess",
  REVEAL: "reveal",
};
const VIEW_MS = 30_000;
const GUESS_MS = 30_000;
const MAX_PLAYERS = 12;
const GRACE_MS = 15_000; // keep a disconnected player around this long for reconnect

// English Wikipedia article titles + JP display names + lat/lng.
// Image URLs are fetched live each round via Wikipedia REST media-list.
const CITIES = [
  { wiki: "Tokyo",            jp: "東京",             lat: 35.6762,  lng: 139.6503 },
  { wiki: "Paris",            jp: "パリ",             lat: 48.8566,  lng:   2.3522 },
  { wiki: "New_York_City",    jp: "ニューヨーク",     lat: 40.7128,  lng: -74.0060 },
  { wiki: "London",           jp: "ロンドン",         lat: 51.5074,  lng:  -0.1278 },
  { wiki: "Dubai",            jp: "ドバイ",           lat: 25.2048,  lng:  55.2708 },
  { wiki: "Sydney",           jp: "シドニー",         lat:-33.8688,  lng: 151.2093 },
  { wiki: "Rio_de_Janeiro",   jp: "リオデジャネイロ", lat:-22.9068,  lng: -43.1729 },
  { wiki: "Cairo",            jp: "カイロ",           lat: 30.0444,  lng:  31.2357 },
  { wiki: "Bangkok",          jp: "バンコク",         lat: 13.7563,  lng: 100.5018 },
  { wiki: "Istanbul",         jp: "イスタンブール",   lat: 41.0082,  lng:  28.9784 },
  { wiki: "Venice",           jp: "ヴェネツィア",     lat: 45.4408,  lng:  12.3155 },
  { wiki: "Moscow",           jp: "モスクワ",         lat: 55.7558,  lng:  37.6173 },
  { wiki: "Seoul",            jp: "ソウル",           lat: 37.5665,  lng: 126.9780 },
  { wiki: "Singapore",        jp: "シンガポール",     lat:  1.3521,  lng: 103.8198 },
  { wiki: "Rome",             jp: "ローマ",           lat: 41.9028,  lng:  12.4964 },
  { wiki: "Barcelona",        jp: "バルセロナ",       lat: 41.3851,  lng:   2.1734 },
  { wiki: "Cape_Town",        jp: "ケープタウン",     lat:-33.9249,  lng:  18.4241 },
  { wiki: "Amsterdam",        jp: "アムステルダム",   lat: 52.3676,  lng:   4.9041 },
  { wiki: "Prague",           jp: "プラハ",           lat: 50.0755,  lng:  14.4378 },
  { wiki: "Mexico_City",      jp: "メキシコシティ",   lat: 19.4326,  lng: -99.1332 },
  { wiki: "Toronto",          jp: "トロント",         lat: 43.6532,  lng: -79.3832 },
  { wiki: "Buenos_Aires",     jp: "ブエノスアイレス", lat:-34.6037,  lng: -58.3816 },
  { wiki: "Athens",           jp: "アテネ",           lat: 37.9838,  lng:  23.7275 },
  { wiki: "Lisbon",           jp: "リスボン",         lat: 38.7223,  lng:  -9.1393 },
  { wiki: "Marrakesh",        jp: "マラケシュ",       lat: 31.6295,  lng:  -7.9811 },
  { wiki: "Reykjav%C3%ADk",   jp: "レイキャビク",     lat: 64.1466,  lng: -21.9426 },
  { wiki: "Hong_Kong",        jp: "香港",             lat: 22.3193,  lng: 114.1694 },
  { wiki: "Beijing",          jp: "北京",             lat: 39.9042,  lng: 116.4074 },
  { wiki: "San_Francisco",    jp: "サンフランシスコ", lat: 37.7749,  lng:-122.4194 },
  { wiki: "Stockholm",        jp: "ストックホルム",   lat: 59.3293,  lng:  18.0686 },
  { wiki: "Vienna",           jp: "ウィーン",         lat: 48.2082,  lng:  16.3738 },
  { wiki: "Berlin",           jp: "ベルリン",         lat: 52.5200,  lng:  13.4050 },
  { wiki: "Mumbai",           jp: "ムンバイ",         lat: 19.0760,  lng:  72.8777 },
  { wiki: "Havana",           jp: "ハバナ",           lat: 23.1136,  lng: -82.3666 },
  { wiki: "Edinburgh",        jp: "エディンバラ",     lat: 55.9533,  lng:  -3.1883 },
];

// Skip flags / coats of arms / locator maps / generic diagrams.
const BAD_PATTERNS = /(flag|coat[_-]of[_-]arms|seal[_-]of|logo[_-]|^map[_-]|[_-]map$|\bmap_of|location[_-]map|locator|wappen|gemeindewappen|infobox|wikidata|crest)/i;

// License whitelist for commercial use.
//   - Public domain / CC0: no attribution legally required, but we attribute anyway
//   - CC-BY / CC-BY-SA (any version): attribution required, no NC/ND restriction
// Anything else (CC-BY-NC, CC-BY-ND, "fair use", "non-free", "all rights reserved")
// is excluded so a paid App Store release can ship the same images without
// re-licensing risk.
const SAFE_LICENSE = /^(cc0|public[\s-]?domain|pd|cc[\s-]?by(?:[\s-]?sa)?(?:[\s-]?\d)?)\b/i;
const UNSAFE_LICENSE = /(non[\s-]?free|fair[\s-]?use|nc|nd|copyright|all\s*rights|restricted)/i;

function stripHtml(s) {
  if (!s) return "";
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchCityImages(wikiTitle) {
  // Step 1: pull the media list from the article (titles only)
  const listUrl = `https://en.wikipedia.org/api/rest_v1/page/media-list/${wikiTitle}`;
  const listRes = await fetch(listUrl, {
    headers: { "User-Agent": "WorldQuiz/0.2 (https://world-quiz.tom3281.workers.dev/; commons-licensed-only)" },
  });
  if (!listRes.ok) throw new Error("HTTP " + listRes.status);
  const listData = await listRes.json();
  const items = (listData.items || []).filter(it => it.type === "image");
  const candidates = items
    .filter(it => /\.(jpe?g)$/i.test(it.title || ""))
    .filter(it => !BAD_PATTERNS.test((it.title || "").replace(/^File:/, "")));

  if (candidates.length === 0) return [];

  // Step 2: batch-fetch license + attribution metadata via the MediaWiki
  // Action API. The REST media-list endpoint doesn't include license info.
  // Cap at 50 (API limit) and split into pages if needed.
  const titles = candidates.slice(0, 50).map(it => it.title);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    iiextmetadatafilter: "License|LicenseShortName|UsageTerms|Artist|Credit|AttributionRequired",
    titles: titles.join("|"),
  });
  const metaRes = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": "WorldQuiz/0.2 (https://world-quiz.tom3281.workers.dev/; commons-licensed-only)" },
  });
  if (!metaRes.ok) throw new Error("HTTP " + metaRes.status);
  const metaData = await metaRes.json();
  const pages = metaData.query?.pages || [];

  const out = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const m = info.extmetadata || {};
    const licenseRaw = (m.LicenseShortName?.value || m.UsageTerms?.value || "").trim();
    // Reject non-free / fair-use / NC / ND outright
    if (UNSAFE_LICENSE.test(licenseRaw)) continue;
    // Require an explicit safe-license match — no license info means we can't ship it
    if (!SAFE_LICENSE.test(licenseRaw)) continue;

    const artist = stripHtml(m.Artist?.value).slice(0, 80) || "Unknown";
    const fileName = (p.title || "").replace(/^File:/, "");
    out.push({
      src: info.thumburl || info.url,
      attribution: artist,
      license: licenseRaw,
      sourceUrl: info.descriptionurl
        || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || "")}`,
    });
  }
  return out;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ===== Worker entry =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const room = (url.searchParams.get("room") || "").toUpperCase();
      if (!/^[A-Z0-9]{4,6}$/.test(room)) {
        return new Response("Invalid room code", { status: 400 });
      }
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ===== GameRoom Durable Object =====
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Map();   // clientId -> { ws, playerId }
    this.players = new Map();    // clientId -> { name, drinkCount, color, removeTimer }
    this.phase = PHASES.LOBBY;
    this.hostId = null;
    this.phaseEndAt = null;
    this.timer = null;
    this.lastResult = null;

    // Per-round state
    this.currentCity = null;     // { wiki, jp, lat, lng }
    this.currentImages = [];     // 8 image URLs
    this.guesses = new Map();    // clientId -> { lat, lng }
    this.usedCityIndices = new Set();
    this.roundNum = 0;

    // Re-entrance guard for the async startNewRound (which awaits an external fetch).
    // Without this, a host-double-tap could fire two parallel image fetches.
    this.starting = false;
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim().slice(0, 20);
    const clientId = (url.searchParams.get("clientId") || "").trim();
    if (!name) return new Response("Missing name", { status: 400 });
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) {
      return new Response("Missing or invalid clientId", { status: 400 });
    }

    const existing = this.players.get(clientId);

    // Decide acceptance up front and reject via a WebSocket close code.
    // HTTP 4xx upgrade failures surface to the browser as opaque close 1006,
    // which our reconnecting client can't distinguish from a network blip.
    let rejectCode = 0;
    let rejectReason = "";
    if (!existing) {
      if (this.players.size >= MAX_PLAYERS) {
        rejectCode = 4030; rejectReason = "Room full";
      } else if (this.phase !== PHASES.LOBBY) {
        rejectCode = 4023; rejectReason = "Game in progress";
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (rejectCode) {
      try { server.close(rejectCode, rejectReason); } catch {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (existing) {
      if (existing.removeTimer) {
        clearTimeout(existing.removeTimer);
        existing.removeTimer = null;
      }
      existing.name = name;
    } else {
      this.players.set(clientId, {
        name,
        drinkCount: 0,
        color: this.pickColor(),
        removeTimer: null,
      });
      if (!this.hostId) this.hostId = clientId;
    }

    // Register the new session BEFORE closing the prior one so the prior
    // socket's close handler — which may fire synchronously from close() —
    // sees `sess.ws !== server` and skips handleDisconnect.
    const prior = existing ? this.sessions.get(clientId) : null;
    this.sessions.set(clientId, { ws: server, playerId: clientId });

    server.addEventListener("message", async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      await this.handleMessage(clientId, msg);
    });
    const onClose = () => {
      const sess = this.sessions.get(clientId);
      if (sess && sess.ws === server) {
        this.handleDisconnect(clientId);
      }
    };
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);

    if (prior) {
      try { prior.ws.close(4002, "Replaced by new connection"); } catch {}
    }

    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  pickColor() {
    const COLORS = ["#6ec1ff", "#ff8c66", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#fb7185", "#c084fc", "#facc15", "#4ade80", "#f87171"];
    const used = new Set([...this.players.values()].map(p => p.color));
    return COLORS.find(c => !used.has(c)) || COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  async handleMessage(playerId, msg) {
    switch (msg.type) {
      case "ping": {
        const sess = this.sessions.get(playerId);
        if (sess) {
          try { sess.ws.send(JSON.stringify({ type: "pong" })); } catch {}
        }
        break;
      }
      case "hello": {
        const session = this.sessions.get(playerId);
        if (session) {
          try { session.ws.send(JSON.stringify(this.viewForPlayer(playerId))); } catch {}
        }
        break;
      }
      case "start":
        if (playerId === this.hostId && this.phase === PHASES.LOBBY) {
          if (this.players.size < 2) return;
          await this.startNewRound();
        }
        break;
      case "guess":
        if (this.phase === PHASES.GUESS
            && typeof msg.lat === "number" && typeof msg.lng === "number"
            && Number.isFinite(msg.lat) && Number.isFinite(msg.lng)) {
          if (!this.guesses.has(playerId) && this.players.has(playerId)) {
            this.guesses.set(playerId, {
              lat: Math.max(-90, Math.min(90, msg.lat)),
              lng: Math.max(-180, Math.min(180, msg.lng)),
            });
            this.broadcast();
            // End early if everyone guessed
            const allIds = [...this.players.keys()];
            if (allIds.every(id => this.guesses.has(id))) {
              this.endGuess();
            }
          }
        }
        break;
      case "nextRound":
        if (playerId === this.hostId && this.phase === PHASES.REVEAL) {
          await this.startNewRound();
        }
        break;
      case "endRound":
        if (playerId === this.hostId
            && (this.phase === PHASES.REVEAL || this.phase === PHASES.VIEW || this.phase === PHASES.GUESS)) {
          this.resetToLobby();
        }
        break;
    }
  }

  handleDisconnect(clientId) {
    this.sessions.delete(clientId);
    const player = this.players.get(clientId);
    if (!player) return;

    // In LOBBY, drop immediately — no game state worth preserving
    if (this.phase === PHASES.LOBBY) {
      this.removePlayer(clientId);
      this.broadcast();
      return;
    }

    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = setTimeout(() => {
      player.removeTimer = null;
      if (this.sessions.has(clientId)) return;
      this.removePlayer(clientId);
      if (this.players.size === 0) {
        this.clearTimer();
        this.phase = PHASES.LOBBY;
        this.lastResult = null;
        return;
      }
      if (this.players.size < 2 && this.phase !== PHASES.LOBBY) {
        this.resetToLobby();
        return;
      }
      // If we were waiting on this player to guess, check completion
      if (this.phase === PHASES.GUESS) {
        const allIds = [...this.players.keys()];
        if (allIds.every(id => this.guesses.has(id))) {
          this.endGuess();
          return;
        }
      }
      this.broadcast();
    }, GRACE_MS);
    this.broadcast();
  }

  removePlayer(clientId) {
    this.players.delete(clientId);
    this.guesses.delete(clientId);
    if (this.hostId === clientId) {
      this.hostId = this.players.keys().next().value || null;
    }
  }

  async startNewRound() {
    if (this.starting) return;
    this.starting = true;
    this.phase = PHASES.LOADING;
    this.clearTimer();
    this.lastResult = null;
    this.guesses.clear();
    this.broadcast();
    try {
      // Try cities in random order until one returns enough images
      const remaining = [];
      for (let i = 0; i < CITIES.length; i++) {
        if (!this.usedCityIndices.has(i)) remaining.push(i);
      }
      if (remaining.length === 0) {
        this.usedCityIndices.clear();
        for (let i = 0; i < CITIES.length; i++) remaining.push(i);
      }
      // Shuffle
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }

      let success = false;
      const maxAttempts = Math.min(8, remaining.length);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const idx = remaining[attempt];
        const city = CITIES[idx];
        try {
          const images = await fetchCityImages(city.wiki);
          if (images.length >= 8) {
            this.usedCityIndices.add(idx);
            this.currentCity = city;
            this.currentImages = pickRandom(images, 8);
            success = true;
            break;
          }
        } catch {
          // Try the next city
        }
      }

      if (!success) {
        // Fall back to lobby — couldn't fetch from Wikipedia
        this.phase = PHASES.LOBBY;
        this.currentCity = null;
        this.currentImages = [];
        this.broadcast();
        return;
      }
      this.roundNum++;
      this.phase = PHASES.VIEW;
      this.phaseEndAt = Date.now() + VIEW_MS;
      this.clearTimer();
      this.timer = setTimeout(() => this.startGuessPhase(), VIEW_MS);
      this.broadcast();
    } finally {
      this.starting = false;
    }
  }

  startGuessPhase() {
    this.phase = PHASES.GUESS;
    this.phaseEndAt = Date.now() + GUESS_MS;
    this.guesses.clear();
    this.clearTimer();
    this.timer = setTimeout(() => this.endGuess(), GUESS_MS);
    this.broadcast();
  }

  endGuess() {
    this.clearTimer();
    this.phase = PHASES.REVEAL;
    this.phaseEndAt = null;

    // Compute distances per player
    const guesses = [];      // [{ id, lat, lng, distanceKm }]
    const noGuessIds = [];
    let maxDist = -1;
    for (const [id] of this.players) {
      const g = this.guesses.get(id);
      if (g) {
        const d = haversineKm(g.lat, g.lng, this.currentCity.lat, this.currentCity.lng);
        guesses.push({ id, lat: g.lat, lng: g.lng, distanceKm: d });
        if (d > maxDist) maxDist = d;
      } else {
        noGuessIds.push(id);
      }
    }

    const losers = new Set();
    // Players who didn't guess each drink 1 (timeout penalty)
    noGuessIds.forEach(id => losers.add(id));
    // Furthest among guessers (or all who tie at max distance) drinks 1
    if (guesses.length > 0) {
      guesses
        .filter(g => g.distanceKm === maxDist)
        .forEach(g => losers.add(g.id));
    }
    losers.forEach(id => {
      const p = this.players.get(id);
      if (p) p.drinkCount += 1;
    });

    this.lastResult = {
      city: {
        jp: this.currentCity.jp,
        lat: this.currentCity.lat,
        lng: this.currentCity.lng,
      },
      guesses,
      noGuesses: noGuessIds,
      losers: [...losers],
    };
    this.broadcast();
  }

  resetToLobby() {
    this.phase = PHASES.LOBBY;
    this.phaseEndAt = null;
    this.clearTimer();
    this.currentCity = null;
    this.currentImages = [];
    this.guesses.clear();
    this.lastResult = null;
    this.broadcast();
  }

  clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  broadcast() {
    for (const [, session] of this.sessions) {
      try {
        const msg = this.viewForPlayer(session.playerId);
        session.ws.send(JSON.stringify(msg));
      } catch {
        // ignore broken sockets
      }
    }
  }

  viewForPlayer(playerId) {
    const players = [...this.players.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      drinkCount: p.drinkCount,
      color: p.color,
      isYou: id === playerId,
      hasGuessed: this.guesses.has(id),
    }));
    // Show images during VIEW / GUESS / REVEAL — hidden in LOBBY / LOADING
    const showImages = this.phase === PHASES.VIEW
      || this.phase === PHASES.GUESS
      || this.phase === PHASES.REVEAL;
    return {
      type: "state",
      state: {
        phase: this.phase,
        players,
        hostId: this.hostId,
        you: playerId,
        phaseEndAt: this.phaseEndAt,
        roundNum: this.roundNum,
        images: showImages ? this.currentImages : [],
        result: this.phase === PHASES.REVEAL ? this.lastResult : null,
      },
    };
  }
}
