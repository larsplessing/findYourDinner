/**
 * ImageStore - IndexedDB Manager für Rezeptbilder
 * Speichert und lädt Bilder offline-fähig
 */

class ImageStore {
    constructor() {
        this.dbName = 'RecipeImagesDB';
        this.dbVersion = 1;
        this.storeName = 'images';
        this.db = null;
    }

    /**
     * Initialisiert die IndexedDB
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('IndexedDB konnte nicht geöffnet werden'));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Erstelle Object Store falls nicht vorhanden
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'recipeName' });
                }
            };
        });
    }

    /**
     * Speichert ein oder mehrere Bilder für ein Rezept
     * @param {string} recipeName - Name des Rezepts
     * @param {Blob|Blob[]} imageBlob - Bild als Blob oder Array von Blobs
     * @returns {Promise<void>}
     */
    async saveImage(recipeName, imageBlob) {
        if (!this.db) {
            await this.init();
        }

        // Normalisiere zu Array
        const imageBlobs = Array.isArray(imageBlob) ? imageBlob : [imageBlob];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.put({
                recipeName: recipeName,
                imageBlobs: imageBlobs, // Jetzt Array!
                timestamp: new Date().toISOString()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Fehler beim Speichern von ${recipeName}`));
        });
    }

    /**
     * Lädt ein Bild für ein Rezept (erstes Bild)
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<Blob|null>} Erstes Bild als Blob oder null wenn nicht gefunden
     */
    async getImage(recipeName) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(recipeName);

            request.onsuccess = () => {
                const result = request.result;
                if (!result) {
                    resolve(null);
                    return;
                }
                
                // Unterstütze alte (imageBlob) und neue (imageBlobs[]) Struktur
                if (result.imageBlobs && result.imageBlobs.length > 0) {
                    resolve(result.imageBlobs[0]);
                } else if (result.imageBlob) {
                    resolve(result.imageBlob);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(new Error(`Fehler beim Laden von ${recipeName}`));
        });
    }

    /**
     * Lädt ALLE Bilder für ein Rezept
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<Blob[]>} Array von Blobs oder leeres Array
     */
    async getAllImages(recipeName) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(recipeName);

            request.onsuccess = () => {
                const result = request.result;
                if (!result) {
                    resolve([]);
                    return;
                }
                
                // Unterstütze alte (imageBlob) und neue (imageBlobs[]) Struktur
                if (result.imageBlobs && result.imageBlobs.length > 0) {
                    resolve(result.imageBlobs);
                } else if (result.imageBlob) {
                    resolve([result.imageBlob]);
                } else {
                    resolve([]);
                }
            };

            request.onerror = () => reject(new Error(`Fehler beim Laden von ${recipeName}`));
        });
    }

    /**
     * Gibt ein Bild als Data URL zurück (erstes Bild)
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<string|null>} Data URL oder null
     */
    async getImageDataURL(recipeName) {
        const blob = await this.getImage(recipeName);
        if (!blob) return null;

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Gibt ALLE Bilder als Data URLs zurück
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<string[]>} Array von Data URLs
     */
    async getAllImageDataURLs(recipeName) {
        const blobs = await this.getAllImages(recipeName);
        if (blobs.length === 0) return [];

        const dataURLPromises = blobs.map(blob => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        });

        return Promise.all(dataURLPromises);
    }

    /**
     * Prüft ob ein Bild existiert
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<boolean>}
     */
    async hasImage(recipeName) {
        const image = await this.getImage(recipeName);
        return image !== null;
    }

    /**
     * Löscht ein Bild
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<void>}
     */
    async deleteImage(recipeName) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(recipeName);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Fehler beim Löschen von ${recipeName}`));
        });
    }

    /**
     * Löscht alle Bilder
     * @returns {Promise<void>}
     */
    async clearAll() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Fehler beim Löschen aller Bilder'));
        });
    }

    /**
     * Gibt die Anzahl gespeicherter Bilder zurück
     * @returns {Promise<number>}
     */
    async getCount() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('Fehler beim Zählen der Bilder'));
        });
    }

    /**
     * Gibt alle gespeicherten Rezeptnamen zurück
     * @returns {Promise<string[]>}
     */
    async getAllRecipeNames() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('Fehler beim Abrufen der Rezeptnamen'));
        });
    }

    /**
     * Speichert mehrere Bilder auf einmal
     * @param {Object} imageMap - Map von recipeName → Blob oder Blob[]
     * @param {Function} progressCallback - Fortschritts-Callback (optional)
     * @returns {Promise<{success: number, failed: number}>}
     */
    async saveMultiple(imageMap, progressCallback = null) {
        let success = 0;
        let failed = 0;
        const total = Object.keys(imageMap).length;

        for (const [recipeName, imageBlob] of Object.entries(imageMap)) {
            try {
                await this.saveImage(recipeName, imageBlob); // unterstützt jetzt Blob oder Blob[]
                success++;
            } catch (error) {
                console.error(`Fehler beim Speichern von ${recipeName}:`, error);
                failed++;
            }

            if (progressCallback) {
                progressCallback({
                    current: success + failed,
                    total: total,
                    success: success,
                    failed: failed,
                    recipeName: recipeName
                });
            }
        }

        return { success, failed };
    }
}

// Globale Instanz erstellen
const imageStore = new ImageStore();

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageStore;
}
