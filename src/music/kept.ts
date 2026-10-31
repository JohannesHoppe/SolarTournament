/**
 * The last track pressed on the radio page, kept in the browser's IndexedDB so it can be saved
 * again (after a save dialog clicked away, after a reload) without pressing it anew. Only the
 * last one is kept: a new pressing takes its place. Where IndexedDB is missing or blocked (a
 * private window, site data blocked), nothing is kept and nothing is found; the page works on.
 */

/** A pressing as kept: the track's title and its WAV file. */
export type Pressing = { title: string; wav: Blob };

const DATABASE = 'solartournament';
const STORE = 'pressing';
/** The one record of the store. */
const LAST = 'last';

/** The request's result once it succeeds, or its error. */
function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function open(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settle(request);
}

/** Runs one request on the store, waits until its transaction is through (a write is stored then) and closes the database again. */
async function withStore<T>(factory: IDBFactory | undefined, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  if (!factory) throw new Error('IndexedDB unavailable');
  const database = await open(factory);
  try {
    const transaction = database.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
    const [result] = await Promise.all([settle(work(transaction.objectStore(STORE))), done]);
    return result;
  } finally {
    database.close();
  }
}

const browserDatabases = () => (typeof indexedDB === 'undefined' ? undefined : indexedDB);

/** Keeps the pressing in place of the one kept before; false when the browser keeps nothing. */
export async function keepPressing(pressing: Pressing, factory = browserDatabases()): Promise<boolean> {
  try {
    await withStore(factory, 'readwrite', (store) => store.put({ title: pressing.title, wav: pressing.wav }, LAST));
    return true;
  } catch (error) {
    console.warn('The pressing is not kept', error);
    return false;
  }
}

/** The pressing kept, or null when there is none or it cannot be read. */
export async function keptPressing(factory = browserDatabases()): Promise<Pressing | null> {
  try {
    const record: unknown = await withStore(factory, 'readonly', (store) => store.get(LAST));
    if (typeof record !== 'object' || record === null) return null;
    const { title, wav } = record as Record<string, unknown>;
    return typeof title === 'string' && title && wav instanceof Blob && wav.size > 0 ? { title, wav } : null;
  } catch (error) {
    console.warn('The kept pressing cannot be read', error);
    return null;
  }
}
