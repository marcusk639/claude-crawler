"use strict";

const TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES || "60", 10);

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMinutes = TTL_MINUTES) {
  store.set(key, { value, expiresAt: Date.now() + ttlMinutes * 60 * 1000 });
}

function del(key) {
  store.delete(key);
}

function clear() {
  store.clear();
}

function size() {
  const now = Date.now();
  let live = 0;
  for (const entry of store.values()) {
    if (now <= entry.expiresAt) live++;
  }
  return live;
}

module.exports = { get, set, del, clear, size };
