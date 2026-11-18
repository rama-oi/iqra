// An identity = a name + the SSH key used for git operations.
//
// Backend contract (every call answers with the full, updated list):
//   GET    /api/identities                 -> { identities: [...] }
//   POST   /api/identities   (multipart: key, name?)  -> { identities: [...] }
//          name is optional: left out, the identity is named after the GitHub account
//          the key belongs to (found with `ssh -T git@github.com`)
//   POST   /api/identities/:id/activate    -> { identities: [...] }
//   POST   /api/identities/:id/refresh     -> { identities: [...] }  ("sync with GitHub")
//   DELETE /api/identities/:id             -> { identities: [...] }
//
// identity: { id, name, avatarUrl | null, githubLogin | null, keyName, publicKey | null, isActive }
// Errors answer { error: "human readable text" }, which becomes the Error's message.
// The private key is only ever sent to the backend, never kept in the browser.

import MOCK from "./config.js";
const USE_MOCK = MOCK.identities;
const BASE = "/api/identities";

// Until the backend stores identities, the mock keeps them in localStorage so they
// survive a refresh. Only name and key file name go there: the key itself never does.
const STORAGE_KEY = "pb-mock-identities";
const SEED = [
  { id: "id-1", name: "Fikret", avatarUrl: null, keyName: "id_ed25519", publicKey: null, isActive: true },
  { id: "id-2", name: "Marc Dubois", avatarUrl: null, keyName: "id_rsa_work", isActive: false },
];

function loadMock() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // storage unavailable or corrupt: start from the sample identities
  }
  return structuredClone(SEED);
}

function saveMock() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockStore));
  } catch {
    // the list then only lives until the next refresh
  }
}

let mockStore = loadMock();
let mockCounter = mockStore.reduce((n, i) => Math.max(n, Number(String(i.id).replace(/\D/g, "")) || 0), 0);

const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
const snapshot = () => structuredClone(mockStore);

async function request(path = "", options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const reply = await res.json().catch(() => ({}));
    throw new Error(reply.error || `Request failed (${res.status})`);
  }
  return (await res.json()).identities;
}

export async function fetchIdentities() {
  if (USE_MOCK) {
    await delay();
    return snapshot();
  }
  return request();
}

export async function addIdentity({ name, keyFile }) {
  if (USE_MOCK) {
    await delay();
    mockStore.push({
      id: `id-${++mockCounter}`,
      name: name || keyFile.name,
      avatarUrl: null,
      githubLogin: null,
      keyName: keyFile.name,
      isActive: mockStore.length === 0,
    });
    saveMock();
    return snapshot();
  }
  const body = new FormData();
  if (name) body.set("name", name);
  body.set("key", keyFile);
  return request("", { method: "POST", body });
}

export async function refreshIdentity(id) {
  if (USE_MOCK) {
    await delay();
    return snapshot();
  }
  return request(`/${encodeURIComponent(id)}/refresh`, { method: "POST" });
}

export async function selectIdentity(id) {
  if (USE_MOCK) {
    await delay();
    mockStore.forEach((i) => (i.isActive = i.id === id));
    saveMock();
    return snapshot();
  }
  return request(`/${encodeURIComponent(id)}/activate`, { method: "POST" });
}

export async function removeIdentity(id) {
  if (USE_MOCK) {
    await delay();
    const wasActive = mockStore.find((i) => i.id === id)?.isActive;
    mockStore = mockStore.filter((i) => i.id !== id);
    if (wasActive && mockStore.length) mockStore[0].isActive = true;
    saveMock();
    return snapshot();
  }
  return request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
