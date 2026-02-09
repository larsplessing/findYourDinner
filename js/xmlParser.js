/**
 * XMLParser - Helper für XML-Parsing in Excel-Dateien
 */

class XMLParser {
    /**
     * Parst XML-String zu DOM
     * @param {string} xmlString - XML als String
     * @returns {Document} XML Document
     */
    static parseXML(xmlString) {
        const parser = new DOMParser();
        return parser.parseFromString(xmlString, 'text/xml');
    }

    /**
     * Extrahiert Sheet-Namen und IDs aus workbook.xml
     * @param {string} workbookXML - Inhalt von xl/workbook.xml
     * @returns {Array<{name: string, sheetId: string, index: number}>}
     */
    static extractSheetInfo(workbookXML) {
        const doc = this.parseXML(workbookXML);
        const sheets = doc.getElementsByTagName('sheet');
        const sheetInfo = [];

        for (let i = 0; i < sheets.length; i++) {
            const sheet = sheets[i];
            sheetInfo.push({
                name: sheet.getAttribute('name'),
                sheetId: sheet.getAttribute('sheetId'),
                rId: sheet.getAttribute('r:id'),
                index: i + 1
            });
        }

        return sheetInfo;
    }

    /**
     * Extrahiert Drawing-Referenz aus Sheet-Relationships
     * @param {string} relsXML - Inhalt von xl/worksheets/_rels/sheet*.xml.rels
     * @returns {string|null} Drawing-Pfad oder null
     */
    static extractDrawingPath(relsXML) {
        const doc = this.parseXML(relsXML);
        const relationships = doc.getElementsByTagName('Relationship');

        for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            const target = rel.getAttribute('Target');
            
            if (target && target.includes('drawing')) {
                // Konvertiere relativen Pfad zu absolutem
                return 'xl/' + target.replace('../', '');
            }
        }

        return null;
    }

    /**
     * Extrahiert Bild-Referenzen aus Drawing-Relationships
     * @param {string} drawingRelsXML - Inhalt von xl/drawings/_rels/drawing*.xml.rels
     * @returns {Array<string>} Array von Bild-Pfaden
     */
    static extractImagePaths(drawingRelsXML) {
        const doc = this.parseXML(drawingRelsXML);
        const relationships = doc.getElementsByTagName('Relationship');
        const imagePaths = [];

        for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            const target = rel.getAttribute('Target');
            const type = rel.getAttribute('Type');

            if (target && (target.includes('image') || type && type.includes('image'))) {
                // Konvertiere relativen Pfad zu absolutem
                const imagePath = 'xl/' + target.replace('../', '');
                imagePaths.push(imagePath);
            }
        }

        return imagePaths;
    }

    /**
     * Erstellt vollständiges Sheet → Image Mapping
     * @param {JSZip} zip - JSZip Instanz der Excel-Datei
     * @returns {Promise<Object>} Map von SheetName → ImagePath[] (Array von Pfaden)
     */
    static async createSheetImageMapping(zip) {
        const mapping = {};

        try {
            // 1. Lese workbook.xml für Sheet-Namen
            const workbookXML = await zip.file('xl/workbook.xml').async('text');
            const sheets = this.extractSheetInfo(workbookXML);

            // 2. Für jedes Sheet: Finde zugehöriges Bild
            for (const sheet of sheets) {
                const sheetIndex = sheet.index;
                const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;

                // Prüfe ob Relationships existieren
                const relsFile = zip.file(relsPath);
                if (!relsFile) continue;

                // 3. Lese Sheet-Relationships
                const relsXML = await relsFile.async('text');
                const drawingPath = this.extractDrawingPath(relsXML);
                
                if (!drawingPath) continue;

                // 4. Lese Drawing-Relationships
                const drawingRelsPath = drawingPath.replace('/drawings/', '/drawings/_rels/') + '.rels';
                const drawingRelsFile = zip.file(drawingRelsPath);
                
                if (!drawingRelsFile) continue;

                const drawingRelsXML = await drawingRelsFile.async('text');
                const imagePaths = this.extractImagePaths(drawingRelsXML);

                // 5. Speichere ALLE Bilder (nicht nur das erste!)
                if (imagePaths.length > 0) {
                    mapping[sheet.name] = imagePaths; // Jetzt Array statt einzelner Pfad
                }
            }

        } catch (error) {
            console.error('Fehler beim Erstellen des Sheet-Image-Mappings:', error);
        }

        return mapping;
    }

    /**
     * Hilfsfunktion: Gibt alle verfügbaren Bilder im ZIP zurück
     * @param {JSZip} zip - JSZip Instanz
     * @returns {Array<string>} Liste aller Bildpfade
     */
    static getAllImagePaths(zip) {
        const imagePaths = [];
        
        zip.folder('xl/media').forEach((relativePath, file) => {
            if (!file.dir) {
                imagePaths.push('xl/media/' + relativePath);
            }
        });

        return imagePaths;
    }

    /**
     * Extrahiert Dateiendung aus Pfad
     * @param {string} path - Dateipfad
     * @returns {string} Dateiendung (z.B. 'png', 'jpeg')
     */
    static getFileExtension(path) {
        const parts = path.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    /**
     * Bestimmt MIME-Type basierend auf Dateiendung
     * @param {string} extension - Dateiendung
     * @returns {string} MIME-Type
     */
    static getMimeType(extension) {
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };

        return mimeTypes[extension.toLowerCase()] || 'image/png';
    }
}

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XMLParser;
}
