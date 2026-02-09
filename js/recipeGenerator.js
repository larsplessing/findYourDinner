/**
 * Recipe Generator - Lädt und verarbeitet Excel-Rezepte
 * Jetzt mit Bild-Extraktion aus Excel!
 */

class RecipeGenerator {
    constructor() {
        this.recipes = [];
        this.workbook = null;
        this.imageStore = typeof imageStore !== 'undefined' ? imageStore : null;
        this.hasImages = false;
    }

    /**
     * Lädt eine Excel-Datei und extrahiert alle Rezepte + Bilder + Kategorien
     * @param {File|Blob} file - Die Excel-Datei
     * @param {Function} progressCallback - Optional: Fortschritts-Callback
     * @returns {Promise<Array>} Array mit allen Rezepten
     */
    async loadExcelFile(file, progressCallback = null) {
        try {
            // Phase 1: Lade Excel-Daten mit SheetJS
            if (progressCallback) progressCallback({ phase: 'data', progress: 0, message: 'Lade Excel-Daten...' });
            
            const arrayBuffer = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            this.workbook = XLSX.read(data, { type: 'array' });
            
            this.recipes = [];
            
            // Extrahiere Kategorien aus Inhaltsverzeichnis
            const { categoryMap, allRecipeNames } = this.extractCategories();
            
            // Set für vorhandene Sheets
            const existingSheets = new Set();
            
            // Extrahiere Rezept-Details für vorhandene Sheets
            this.workbook.SheetNames.forEach((sheetName, index) => {
                if (sheetName !== 'Inhaltsverzeichnis' && sheetName !== 'Vorlage') {
                    existingSheets.add(sheetName);
                    const recipeDetails = this.extractRecipeDetails(sheetName);
                    this.recipes.push({
                        id: index,
                        name: sheetName,
                        sheetName: sheetName,
                        hasImage: false, // Wird später aktualisiert
                        category: categoryMap[sheetName] || 'Ohne Kategorie',
                        isPlaceholder: false,
                        ...recipeDetails
                    });
                }
            });

            // Erstelle Placeholder-Rezepte für Rezepte die nur im Inhaltsverzeichnis stehen
            let placeholderId = this.recipes.length;
            for (const recipeName of allRecipeNames) {
                if (!existingSheets.has(recipeName)) {
                    // Rezept steht im Inhaltsverzeichnis, hat aber kein Sheet
                    this.recipes.push({
                        id: placeholderId++,
                        name: recipeName,
                        sheetName: null,
                        hasImage: false,
                        category: categoryMap[recipeName] || 'Ohne Kategorie',
                        isPlaceholder: true,
                        servings: null,
                        ingredients: [],
                        instructions: [{
                            step: 1,
                            text: 'Dieses Rezept ist noch nicht verfügbar. Es steht im Inhaltsverzeichnis, hat aber noch kein detailliertes Sheet.'
                        }],
                        createdDate: null,
                        modifiedDate: null
                    });
                    console.log(`Placeholder erstellt für: ${recipeName}`);
                }
            }

            // Alphabetisch sortieren
            this.recipes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
            
            if (progressCallback) progressCallback({ phase: 'data', progress: 50, message: 'Rezept-Daten geladen' });
            
            // Phase 2: Extrahiere Bilder
            if (typeof JSZip !== 'undefined' && this.imageStore) {
                try {
                    if (progressCallback) progressCallback({ phase: 'images', progress: 0, message: 'Extrahiere Bilder...' });
                    
                    await this.extractAndSaveImages(file, progressCallback);
                    this.hasImages = true;
                    
                    if (progressCallback) progressCallback({ phase: 'complete', progress: 100, message: 'Fertig!' });
                } catch (error) {
                    console.warn('Bilder konnten nicht extrahiert werden:', error);
                    this.hasImages = false;
                }
            } else {
                console.warn('JSZip oder ImageStore nicht verfügbar - keine Bild-Extraktion');
            }
            
            return this.recipes;
        } catch (error) {
            throw new Error(`Fehler beim Laden der Datei: ${error.message}`);
        }
    }

    /**
     * Lädt eine Excel-Datei von einer URL
     * @param {string} url - URL zur Excel-Datei
     * @param {Function} progressCallback - Optional: Fortschritts-Callback
     * @returns {Promise<Array>} Array mit allen Rezepten
     */
    async loadFromURL(url, progressCallback = null) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            return await this.loadExcelFile(blob, progressCallback);
        } catch (error) {
            throw new Error(`Fehler beim Laden von URL: ${error.message}`);
        }
    }

    /**
     * Extrahiert Bilder aus Excel und speichert sie in IndexedDB
     * @param {File|Blob} file - Die Excel-Datei
     * @param {Function} progressCallback - Optional: Fortschritts-Callback
     * @returns {Promise<void>}
     */
    async extractAndSaveImages(file, progressCallback = null) {
        if (!this.imageStore) {
            throw new Error('ImageStore nicht initialisiert');
        }

        // Initialisiere ImageStore
        await this.imageStore.init();

        // Lade Excel als ZIP
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Erstelle Sheet → Image Mapping (jetzt mit Array von Bildern!)
        if (progressCallback) progressCallback({ phase: 'images', progress: 10, message: 'Analysiere Bilder...' });
        
        const mapping = await XMLParser.createSheetImageMapping(zip);
        const totalSheets = Object.keys(mapping).length;
        
        let totalImages = 0;
        Object.values(mapping).forEach(imagePaths => {
            totalImages += imagePaths.length;
        });
        
        console.log(`Gefunden: ${totalImages} Bilder für ${totalSheets} Rezepte`);

        // Extrahiere und speichere Bilder
        let processedSheets = 0;
        let processedImages = 0;
        
        for (const [recipeName, imagePaths] of Object.entries(mapping)) {
            try {
                const imageBlobs = [];
                
                // Lade alle Bilder für dieses Rezept
                for (const imagePath of imagePaths) {
                    const imageFile = zip.file(imagePath);
                    if (!imageFile) {
                        console.warn(`Bild nicht gefunden: ${imagePath}`);
                        continue;
                    }

                    // Konvertiere zu Blob
                    const imageData = await imageFile.async('arraybuffer');
                    const extension = XMLParser.getFileExtension(imagePath);
                    const mimeType = XMLParser.getMimeType(extension);
                    const imageBlob = new Blob([imageData], { type: mimeType });
                    
                    imageBlobs.push(imageBlob);
                    processedImages++;
                }

                // Speichere alle Bilder in IndexedDB
                if (imageBlobs.length > 0) {
                    await this.imageStore.saveImage(recipeName, imageBlobs);

                    // Aktualisiere Recipe-Objekt
                    const recipe = this.recipes.find(r => r.name === recipeName);
                    if (recipe) {
                        recipe.hasImage = true;
                        recipe.imageCount = imageBlobs.length;
                    }
                }

                processedSheets++;
                
                if (progressCallback) {
                    const progress = 10 + Math.floor((processedSheets / totalSheets) * 80);
                    progressCallback({ 
                        phase: 'images', 
                        progress: progress, 
                        message: `Bilder ${processedImages}/${totalImages} gespeichert...` 
                    });
                }
            } catch (error) {
                console.error(`Fehler beim Extrahieren von ${recipeName}:`, error);
            }
        }

        if (progressCallback) progressCallback({ phase: 'images', progress: 90, message: `${processedImages} Bilder gespeichert` });
    }

    /**
     * Extrahiert Kategorien aus dem Inhaltsverzeichnis-Sheet
     * @returns {Object} { categoryMap: Map von RecipeName → Category, allRecipeNames: Set aller Rezeptnamen }
     */
    extractCategories() {
        const categoryMap = {};
        const allRecipeNames = new Set();
        
        if (!this.workbook || !this.workbook.Sheets['Inhaltsverzeichnis']) {
            console.warn('Inhaltsverzeichnis-Sheet nicht gefunden');
            return { categoryMap, allRecipeNames };
        }
        
        const sheet = this.workbook.Sheets['Inhaltsverzeichnis'];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        if (data.length < 3) {
            console.warn('Inhaltsverzeichnis hat zu wenige Zeilen');
            return { categoryMap, allRecipeNames };
        }
        
        // Analysiere Spalten für Kategorien
        const columnCategories = {};
        
        // Row 0: Hauptkategorien (Snacks, Mittagessen, Nachtisch)
        // Row 1: Unterkategorien (Salzig, Süß)
        // Row 2+: Rezeptnamen
        
        for (let col = 0; col < data[0].length; col++) {
            const mainCategory = data[0][col];
            const subCategory = data[1][col];
            
            if (mainCategory && mainCategory.trim() !== '') {
                // Erstelle Kategorie-String
                if (subCategory && subCategory.trim() !== '') {
                    columnCategories[col] = `${mainCategory} - ${subCategory}`;
                } else {
                    columnCategories[col] = mainCategory;
                }
            }
        }
        
        // Extrahiere Rezeptnamen ab Zeile 2
        for (let row = 2; row < data.length; row++) {
            for (let col = 0; col < data[row].length; col++) {
                const recipeName = data[row][col];
                
                if (recipeName && recipeName.trim() !== '' && columnCategories[col]) {
                    const cleanName = recipeName.trim();
                    categoryMap[cleanName] = columnCategories[col];
                    allRecipeNames.add(cleanName);
                }
            }
        }
        
        console.log(`Kategorien extrahiert: ${Object.keys(categoryMap).length} Rezepte kategorisiert`);
        return { categoryMap, allRecipeNames };
    }

    /**
     * Extrahiert Details aus einem Rezept-Sheet
     * @param {string} sheetName - Name des Sheets
     * @returns {Object} Rezept-Details (Zutaten, Anleitung, etc.)
     */
    extractRecipeDetails(sheetName) {
        if (!this.workbook) return {};
        
        const sheet = this.workbook.Sheets[sheetName];
        if (!sheet) return {};
        
        // Konvertiere Sheet zu JSON
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        const details = {
            servings: null,
            ingredients: [],
            instructions: [],
            notes: [],
            createdDate: null,
            modifiedDate: null
        };
        
        // Durchsuche die Daten
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            
            // Anzahl Personen
            if (row[0] && String(row[0]).includes('Anzahl Personen')) {
                details.servings = row[3] || row[1];
            }
            
            // Erstelldatum
            if (row[3] && String(row[3]).includes('Erstelldatum')) {
                details.createdDate = row[6];
            }
            
            // Geändert am
            if (row[3] && String(row[3]).includes('Geändert am')) {
                details.modifiedDate = row[6];
            }
            
            // Zutaten (nach "Menge" Header bis "Zubereitung")
            if (row[0] === 'Menge' && row[3] === 'Produkt') {
                let j = i + 1;
                while (j < data.length && data[j][0] !== 'Zubereitung' && data[j][4] !== 'Total Warenkosten') {
                    const ingredientRow = data[j];
                    if (ingredientRow[3]) { // Produkt vorhanden
                        details.ingredients.push({
                            amount: ingredientRow[0] || '',
                            unit: ingredientRow[2] || '',
                            product: ingredientRow[3] || '',
                            note: ingredientRow[4] || ''
                        });
                    }
                    j++;
                }
            }
            
            // Bemerkungen/Notizen (eigener Bereich nach Zubereitung)
            if (row[0] && String(row[0]).includes('Bemerkung') && String(row[0]).includes('Notiz')) {
                // Gefunden! "Bemerkungen/Notizen" Header
                // Lese alle folgenden Zeilen bis zur nächsten leeren Zeile
                let j = i + 1;
                while (j < data.length) {
                    const noteRow = data[j];
                    const noteText = noteRow[0]; // Links stehen in Spalte A
                    
                    // Stoppe bei leerer Zeile oder wenn alle Spalten leer sind
                    if (!noteText || noteText.trim() === '') {
                        // Prüfe ob wirklich komplett leer
                        const hasContent = noteRow.some(cell => cell && String(cell).trim() !== '');
                        if (!hasContent) {
                            break;
                        }
                    }
                    
                    // Füge Notiz/Link hinzu wenn nicht leer
                    if (noteText && String(noteText).trim() !== '') {
                        details.notes.push(String(noteText).trim());
                    }
                    
                    j++;
                }
                break;
            }
            
            // Zubereitung/Anleitung
            if (row[0] === 'Zubereitung' || row[0] === 'Anleitung') {
                let j = i + 1;
                while (j < data.length) {
                    const stepRow = data[j];
                    const stepNum = stepRow[0];
                    const stepText = stepRow[1];
                    
                    if (stepNum && stepText && !isNaN(stepNum)) {
                        details.instructions.push({
                            step: Number(stepNum),
                            text: String(stepText)
                        });
                    } else if (!stepNum && !stepText) {
                        break; // Ende der Anleitung
                    }
                    j++;
                }
            }
        }
        
        return details;
    }

    /**
     * Gibt ein spezifisches Rezept mit allen Details zurück
     * @param {string} recipeName - Name des Rezepts
     * @returns {Object|null} Rezept mit allen Details
     */
    getRecipeByName(recipeName) {
        return this.recipes.find(r => r.name === recipeName || r.sheetName === recipeName);
    }

    /**
     * Gibt ein Bild-URL für ein Rezept zurück (aus IndexedDB) - erstes Bild
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<string|null>} Data URL des Bildes oder null
     */
    async getRecipeImageURL(recipeName) {
        if (!this.imageStore) return null;

        try {
            return await this.imageStore.getImageDataURL(recipeName);
        } catch (error) {
            console.error(`Fehler beim Laden des Bildes für ${recipeName}:`, error);
            return null;
        }
    }

    /**
     * Gibt ALLE Bild-URLs für ein Rezept zurück (aus IndexedDB)
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<string[]>} Array von Data URLs
     */
    async getAllRecipeImageURLs(recipeName) {
        if (!this.imageStore) return [];

        try {
            return await this.imageStore.getAllImageDataURLs(recipeName);
        } catch (error) {
            console.error(`Fehler beim Laden der Bilder für ${recipeName}:`, error);
            return [];
        }
    }

    /**
     * Prüft ob ein Rezept ein Bild hat
     * @param {string} recipeName - Name des Rezepts
     * @returns {Promise<boolean>}
     */
    async hasRecipeImage(recipeName) {
        if (!this.imageStore) return false;

        try {
            return await this.imageStore.hasImage(recipeName);
        } catch (error) {
            return false;
        }
    }

    /**
     * Gibt alle Rezepte zurück
     * @returns {Array} Array mit allen Rezepten
     */
    getAllRecipes() {
        return this.recipes;
    }

    /**
     * Filtert Rezepte nach Suchbegriff
     * @param {string} searchTerm - Suchbegriff
     * @returns {Array} Gefilterte Rezepte
     */
    searchRecipes(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return this.recipes;
        }
        
        const term = searchTerm.toLowerCase().trim();
        return this.recipes.filter(recipe => 
            recipe.name.toLowerCase().includes(term)
        );
    }

    /**
     * Filtert Rezepte nach Kategorie
     * @param {string} category - Kategorie-Name
     * @returns {Array} Gefilterte Rezepte
     */
    filterByCategory(category) {
        if (!category || category === 'Alle') {
            return this.recipes;
        }
        
        return this.recipes.filter(recipe => recipe.category === category);
    }

    /**
     * Gibt alle verfügbaren Kategorien zurück
     * @returns {Array<string>} Array von Kategorien (sortiert)
     */
    getAllCategories() {
        const categories = new Set();
        
        this.recipes.forEach(recipe => {
            if (recipe.category) {
                categories.add(recipe.category);
            }
        });
        
        return Array.from(categories).sort();
    }

    /**
     * Gibt ein zufälliges Rezept zurück
     * @param {Array} recipeList - Optional: Liste von Rezepten (default: alle)
     * @returns {Object|null} Zufälliges Rezept oder null
     */
    getRandomRecipe(recipeList = null) {
        const list = recipeList || this.recipes;
        if (list.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * list.length);
        return list[randomIndex];
    }

    /**
     * Gibt mehrere zufällige Rezepte zurück
     * @param {number} count - Anzahl der gewünschten Rezepte
     * @returns {Array} Array mit zufälligen Rezepten
     */
    getRandomRecipes(count) {
        if (count >= this.recipes.length) {
            return [...this.recipes].sort(() => Math.random() - 0.5);
        }
        
        const shuffled = [...this.recipes].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    /**
     * Speichert Rezepte in LocalStorage
     */
    saveToLocalStorage() {
        try {
            localStorage.setItem('recipes', JSON.stringify(this.recipes));
            localStorage.setItem('recipes_timestamp', new Date().toISOString());
            return true;
        } catch (error) {
            console.error('Fehler beim Speichern:', error);
            return false;
        }
    }

    /**
     * Lädt Rezepte aus LocalStorage
     * @returns {boolean} True wenn erfolgreich geladen
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('recipes');
            if (stored) {
                this.recipes = JSON.parse(stored);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Fehler beim Laden:', error);
            return false;
        }
    }

    /**
     * Löscht gespeicherte Rezepte und Bilder
     */
    async clearAllData() {
        // Lösche LocalStorage
        this.clearLocalStorage();
        
        // Lösche Bilder aus IndexedDB
        if (this.imageStore) {
            try {
                await this.imageStore.clearAll();
            } catch (error) {
                console.error('Fehler beim Löschen der Bilder:', error);
            }
        }
        
        this.recipes = [];
        this.hasImages = false;
    }

    /**
     * Gibt Statistiken über die Rezepte zurück
     * @returns {Promise<Object>} Statistik-Objekt
     */
    async getStats() {
        const imageCount = this.imageStore ? await this.imageStore.getCount() : 0;
        
        return {
            total: this.recipes.length,
            withImages: imageCount,
            timestamp: localStorage.getItem('recipes_timestamp'),
            hasImages: this.hasImages
        };
    }

    /**
     * Löscht gespeicherte Rezepte aus LocalStorage (Hilfsmethode)
     */
    clearLocalStorage() {
        localStorage.removeItem('recipes');
        localStorage.removeItem('recipes_timestamp');
    }
}

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecipeGenerator;
}
