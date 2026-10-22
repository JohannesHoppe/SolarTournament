/** The browser's localStorage, where it is available: in a private window or with site data blocked it reads nothing and keeps nothing. */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the value just isn't remembered
  }
}
