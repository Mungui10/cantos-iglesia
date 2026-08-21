(function () {
  "use strict";

  const DB_NAME = "himnario-presentations";
  const DB_VERSION = 5;
  const PRESENTATIONS_STORE = "presentations";
  const METADATA_STORE = "metadata";
  const FILE_HANDLES_STORE = "fileHandles";
  const WORSHIP_PRESENTATIONS_STORE = "worshipPresentations";
  const SONGS_STORE = "songs";
  const PRESENTATION_FILES_STORE = "presentationFiles";
  const MIGRATION_KEY = "localStorage-v1-migrated";
  const WORSHIP_MIGRATION_KEY = "worship-localStorage-v1-migrated";
  const SONGS_MIGRATION_KEY = "songs-localStorage-v1-migrated";
  const ACTIVE_KEY = "activePresentationId";
  const ACTIVE_WORSHIP_KEY = "active";

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    });
  }

  function validLegacyPresentation(value) {
    return value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && value.id && Array.isArray(value.slides);
  }

  class PresentationRepository {
    constructor() {
      this.database = null;
      this.readyPromise = null;
    }

    initialize(legacyKey) {
      if (!this.readyPromise) this.readyPromise = this.open().then(() => this.migrateLegacy(legacyKey));
      return this.readyPromise;
    }

    open() {
      if (!window.indexedDB) return Promise.reject(new Error("IndexedDB no está disponible"));
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(PRESENTATIONS_STORE)) database.createObjectStore(PRESENTATIONS_STORE, { keyPath: "id" });
          if (!database.objectStoreNames.contains(METADATA_STORE)) database.createObjectStore(METADATA_STORE, { keyPath: "key" });
          if (!database.objectStoreNames.contains(FILE_HANDLES_STORE)) database.createObjectStore(FILE_HANDLES_STORE, { keyPath: "presentationId" });
          if (!database.objectStoreNames.contains(WORSHIP_PRESENTATIONS_STORE)) database.createObjectStore(WORSHIP_PRESENTATIONS_STORE, { keyPath: "key" });
          if (!database.objectStoreNames.contains(SONGS_STORE)) database.createObjectStore(SONGS_STORE, { keyPath: "id" });
          if (!database.objectStoreNames.contains(PRESENTATION_FILES_STORE)) database.createObjectStore(PRESENTATION_FILES_STORE, { keyPath: "presentationId" });
        };
        request.onsuccess = () => { this.database = request.result; this.database.onversionchange = () => this.database.close(); resolve(this.database); };
        request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
        request.onblocked = () => console.warn("LIBRARY LOAD IndexedDB bloqueada por otra pestaña");
      });
    }

    async migrateLegacy(legacyKey) {
      const check = this.database.transaction(METADATA_STORE, "readonly").objectStore(METADATA_STORE);
      if (await requestResult(check.get(MIGRATION_KEY))) { console.info("LIBRARY MIGRATION already-complete"); return; }

      let legacy = null;
      let legacyRaw = "";
      try { legacyRaw = localStorage.getItem(legacyKey) || ""; legacy = JSON.parse(legacyRaw || "null"); }
      catch (error) { console.error("LIBRARY MIGRATION legacy-parse-error", error); }
      const presentations = Array.isArray(legacy?.presentations) ? legacy.presentations.filter(validLegacyPresentation) : [];
      const readTransaction = this.database.transaction(PRESENTATIONS_STORE, "readonly"); const readDone = transactionDone(readTransaction);
      const existingIds = new Set((await requestResult(readTransaction.objectStore(PRESENTATIONS_STORE).getAllKeys())).map(String));
      await readDone;
      const transaction = this.database.transaction([PRESENTATIONS_STORE, METADATA_STORE], "readwrite");
      const presentationStore = transaction.objectStore(PRESENTATIONS_STORE);
      for (const presentation of presentations) if (!existingIds.has(String(presentation.id))) presentationStore.put(structuredClone(presentation));
      const metadata = transaction.objectStore(METADATA_STORE);
      if (legacy?.activePresentationId) metadata.put({ key: ACTIVE_KEY, value: legacy.activePresentationId });
      metadata.put({ key: MIGRATION_KEY, value: true, completedAt: new Date().toISOString(), count: presentations.length });
      await transactionDone(transaction);
      console.info("LIBRARY MIGRATION complete", { presentations: presentations.length, legacyCharacters: legacyRaw.length, approximateUtf16Bytes: legacyRaw.length * 2, legacyRetained: true });
    }

    async list() {
      await this.readyPromise;
      const transaction = this.database.transaction(PRESENTATIONS_STORE, "readonly"); const done = transactionDone(transaction);
      const values = await requestResult(transaction.objectStore(PRESENTATIONS_STORE).getAll());
      await done;
      console.info("LIBRARY LOAD list", { presentations: values.length });
      return values;
    }

    async get(id) {
      await this.readyPromise;
      const transaction = this.database.transaction(PRESENTATIONS_STORE, "readonly"); const done = transactionDone(transaction);
      const value = await requestResult(transaction.objectStore(PRESENTATIONS_STORE).get(id));
      await done; return value || null;
    }

    async has(id) { return Boolean(await this.get(id)); }

    async put(presentation, activePresentationId) {
      await this.readyPromise;
      const transaction = this.database.transaction([PRESENTATIONS_STORE, METADATA_STORE], "readwrite");
      transaction.objectStore(PRESENTATIONS_STORE).put(structuredClone(presentation));
      transaction.objectStore(METADATA_STORE).put({ key: ACTIVE_KEY, value: activePresentationId || null });
      await transactionDone(transaction);
      console.info("LIBRARY SAVE put", { id: presentation.id, slides: presentation.slides?.length || 0 });
      return true;
    }

    async putPptxPresentation(presentation, blob, activePresentationId) {
      await this.readyPromise;
      if (!(blob instanceof Blob)) throw new TypeError("El archivo PowerPoint no es un Blob válido");
      const transaction = this.database.transaction([PRESENTATIONS_STORE, METADATA_STORE, PRESENTATION_FILES_STORE], "readwrite");
      transaction.objectStore(PRESENTATIONS_STORE).put(structuredClone(presentation));
      transaction.objectStore(METADATA_STORE).put({ key: ACTIVE_KEY, value: activePresentationId || null });
      transaction.objectStore(PRESENTATION_FILES_STORE).put({
        presentationId: presentation.id,
        blob,
        fileName: String(presentation.pptx?.fileName || presentation.name || "presentacion.pptx"),
        mimeType: String(blob.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        size: Number(blob.size || 0),
        updatedAt: new Date().toISOString()
      });
      await transactionDone(transaction);
      console.info("PPTX SAVE put", { id: presentation.id, slides: presentation.slides?.length || 0, bytes: blob.size });
      return true;
    }

    async getPresentationFile(presentationId) {
      await this.readyPromise;
      const transaction = this.database.transaction(PRESENTATION_FILES_STORE, "readonly"); const done = transactionDone(transaction);
      const value = await requestResult(transaction.objectStore(PRESENTATION_FILES_STORE).get(presentationId));
      await done;
      return value || null;
    }

    async delete(id, activePresentationId) {
      await this.readyPromise;
      const transaction = this.database.transaction([PRESENTATIONS_STORE, METADATA_STORE, FILE_HANDLES_STORE, PRESENTATION_FILES_STORE], "readwrite");
      transaction.objectStore(PRESENTATIONS_STORE).delete(id);
      transaction.objectStore(METADATA_STORE).put({ key: ACTIVE_KEY, value: activePresentationId || null });
      transaction.objectStore(FILE_HANDLES_STORE).delete(id);
      transaction.objectStore(PRESENTATION_FILES_STORE).delete(id);
      await transactionDone(transaction);
      console.info("LIBRARY SAVE delete", { id });
    }

    async putFileHandle(presentationId, handle, fileName = "") {
      await this.readyPromise;
      if (!presentationId || !handle) throw new Error("La asociación de archivo no es válida");
      const transaction = this.database.transaction(FILE_HANDLES_STORE, "readwrite");
      transaction.objectStore(FILE_HANDLES_STORE).put({ presentationId, handle, fileName: String(fileName || handle.name || "") });
      await transactionDone(transaction);
      console.info("FILE HANDLE SAVE put", { presentationId, fileName: String(fileName || handle.name || "") });
      return true;
    }

    async getFileHandle(presentationId) {
      await this.readyPromise;
      const transaction = this.database.transaction(FILE_HANDLES_STORE, "readonly"); const done = transactionDone(transaction);
      const value = await requestResult(transaction.objectStore(FILE_HANDLES_STORE).get(presentationId));
      await done;
      return value || null;
    }

    async deleteFileHandle(presentationId) {
      await this.readyPromise;
      const transaction = this.database.transaction(FILE_HANDLES_STORE, "readwrite");
      transaction.objectStore(FILE_HANDLES_STORE).delete(presentationId);
      await transactionDone(transaction);
      console.info("FILE HANDLE SAVE delete", { presentationId });
    }

    async activePresentationId() {
      await this.readyPromise;
      const transaction = this.database.transaction(METADATA_STORE, "readonly"); const done = transactionDone(transaction);
      const entry = await requestResult(transaction.objectStore(METADATA_STORE).get(ACTIVE_KEY));
      await done; return entry?.value || null;
    }

    async getWorshipPresentation() {
      await this.readyPromise;
      const transaction = this.database.transaction(WORSHIP_PRESENTATIONS_STORE, "readonly"); const done = transactionDone(transaction);
      const entry = await requestResult(transaction.objectStore(WORSHIP_PRESENTATIONS_STORE).get(ACTIVE_WORSHIP_KEY));
      await done;
      return entry?.value || null;
    }

    async putWorshipPresentation(value) {
      await this.readyPromise;
      const transaction = this.database.transaction(WORSHIP_PRESENTATIONS_STORE, "readwrite");
      transaction.objectStore(WORSHIP_PRESENTATIONS_STORE).put({ key: ACTIVE_WORSHIP_KEY, value: structuredClone(value), updatedAt: new Date().toISOString() });
      await transactionDone(transaction);
      return true;
    }

    async markWorshipMigration(details = {}) {
      await this.readyPromise;
      const transaction = this.database.transaction(METADATA_STORE, "readwrite");
      transaction.objectStore(METADATA_STORE).put({ key: WORSHIP_MIGRATION_KEY, value: true, completedAt: new Date().toISOString(), ...details });
      await transactionDone(transaction);
    }

    async listSongs() {
      await this.readyPromise;
      const transaction = this.database.transaction(SONGS_STORE, "readonly"); const done = transactionDone(transaction);
      const records = await requestResult(transaction.objectStore(SONGS_STORE).getAll());
      await done;
      return records.sort((a, b) => Number(a.order) - Number(b.order)).map(record => structuredClone(record.song));
    }

    async replaceSongs(songs) {
      await this.readyPromise;
      if (!Array.isArray(songs)) throw new TypeError("La colección de cantos no es válida");
      const records = songs.map((song, order) => {
        if (!song || typeof song !== "object" || Array.isArray(song) || !song.id) throw new TypeError("Un canto no contiene un identificador válido");
        return { id: String(song.id), order, song: structuredClone(song) };
      });
      const transaction = this.database.transaction(SONGS_STORE, "readwrite");
      const store = transaction.objectStore(SONGS_STORE);
      store.clear();
      records.forEach(record => store.put(record));
      await transactionDone(transaction);
      return true;
    }

    async songsMigrationStatus() {
      await this.readyPromise;
      const transaction = this.database.transaction(METADATA_STORE, "readonly"); const done = transactionDone(transaction);
      const entry = await requestResult(transaction.objectStore(METADATA_STORE).get(SONGS_MIGRATION_KEY));
      await done;
      return entry || null;
    }

    async markSongsMigration(details = {}) {
      await this.readyPromise;
      const transaction = this.database.transaction(METADATA_STORE, "readwrite");
      transaction.objectStore(METADATA_STORE).put({ key: SONGS_MIGRATION_KEY, value: true, completedAt: new Date().toISOString(), ...details });
      await transactionDone(transaction);
    }
  }

  window.HimnarioPresentationRepository = Object.freeze({
    DB_NAME,
    DB_VERSION,
    PRESENTATIONS_STORE,
    METADATA_STORE,
    FILE_HANDLES_STORE,
    WORSHIP_PRESENTATIONS_STORE,
    SONGS_STORE,
    PRESENTATION_FILES_STORE,
    create: () => new PresentationRepository()
  });
})();
