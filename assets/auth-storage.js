(function initializeHimnarioAuthStorage(global) {
  "use strict";

  const DB_NAME = "himnario-auth";
  const DB_VERSION = 1;
  const STORE_NAME = "auth";
  let databasePromise = null;

  function storageError(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.name = "AuthStorageError";
    return error;
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!global.indexedDB) {
      return Promise.reject(storageError("IndexedDB no está disponible para guardar la sesión administrativa."));
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(storageError("No se pudo abrir el almacenamiento de la sesión administrativa.", request.error));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(storageError("El almacenamiento de la sesión administrativa está bloqueado por otra pestaña."));
      };
    });
    return databasePromise;
  }

  async function execute(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let request;
      let settled = false;
      const transaction = database.transaction(STORE_NAME, mode);
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(storageError("No se pudo acceder al almacenamiento de la sesión administrativa.", error));
      };

      try {
        request = operation(transaction.objectStore(STORE_NAME));
      } catch (error) {
        fail(error);
        return;
      }

      request.onerror = () => fail(request.error);
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(request.result);
      };
    });
  }

  const storage = Object.freeze({
    async getItem(key) {
      const value = await execute("readonly", store => store.get(String(key)));
      return value === undefined ? null : String(value);
    },

    async setItem(key, value) {
      await execute("readwrite", store => store.put(String(value), String(key)));
    },

    async removeItem(key) {
      await execute("readwrite", store => store.delete(String(key)));
    }
  });

  async function copyLegacySupabaseSessions() {
    const legacyKeys = [];
    try {
      for (let index = 0; index < global.localStorage.length; index += 1) {
        const key = global.localStorage.key(index);
        if (/^sb-[a-z0-9-]+-auth-token$/i.test(String(key || ""))) legacyKeys.push(key);
      }
    } catch (error) {
      console.warn("AUTH STORAGE legacy-read", JSON.stringify({
        name: error?.name || "Error",
        message: error?.message || "No se pudo leer una sesión anterior."
      }));
      return { found: 0, copied: 0, verified: 0 };
    }

    let copied = 0;
    let verified = 0;
    for (const key of legacyKeys) {
      if (await storage.getItem(key) !== null) continue;
      const legacyValue = global.localStorage.getItem(key);
      if (legacyValue === null) continue;
      await storage.setItem(key, legacyValue);
      copied += 1;
      if (await storage.getItem(key) !== legacyValue) {
        throw storageError("No se pudo verificar la copia de una sesión administrativa anterior.");
      }
      verified += 1;
    }

    console.info("AUTH STORAGE ready", JSON.stringify({
      database: DB_NAME,
      store: STORE_NAME,
      legacyFound: legacyKeys.length,
      legacyCopied: copied,
      legacyVerified: verified
    }));
    return { found: legacyKeys.length, copied, verified };
  }

  global.HimnarioAuthStorage = Object.freeze({
    databaseName: DB_NAME,
    storeName: STORE_NAME,
    storage,
    copyLegacySupabaseSessions
  });
})(window);
