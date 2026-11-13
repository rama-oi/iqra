// An identity = a name + the SSH key used for git operations.
//
// Backend contract (every call answers with the full, updated list):
//   GET    /api/identities                 -> { identities: [...] }
//   POST   /api/identities   (multipart: name, key)  -> { identities: [...] }
//   POST   /api/identities/:id/activate    -> { identities: [...] }
//   DELETE /api/identities/:id             -> { identities: [...] }
//
// identity: { id, name, avatarUrl | null, keyName, isActive }
// The private key is only ever sent to the backend, never kept in the browser.

const USE_MOCK = true;
const BASE = "/api/identities";

let mockStore = [
  { id: "id-1", name: "Fikret", avatarUrl: null, keyName: "id_ed25519", isActive: true },
  { id: "id-2", name: "Marc Dubois", avatarUrl: null, keyName: "id_rsa_work", isActive: false },
];
let mockCounter = 2;

const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
const snapshot = () => structuredClone(mockStore);

async function request(path = "", options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
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
      name,
      avatarUrl: null,
      keyName: keyFile.name,
      isActive: mockStore.length === 0,
    });
    return snapshot();
  }
  const body = new FormData();
  body.set("name", name);
  body.set("key", keyFile);
  return request("", { method: "POST", body });
}

export async function selectIdentity(id) {
  if (USE_MOCK) {
    await delay();
    mockStore.forEach((i) => (i.isActive = i.id === id));
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
    return snapshot();
  }
  return request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
