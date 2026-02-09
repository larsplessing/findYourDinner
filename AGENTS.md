# AGENTS.md - Developer Guide for findYourDinner

This guide provides coding standards and commands for AI agents working in this repository.

## Project Overview

**findYourDinner** is a Pinterest-style recipe finder app that:
- Extracts recipes and images from Excel files (`Rezepte.xlsx`)
- Displays them in a responsive masonry grid layout
- Stores data offline using LocalStorage and IndexedDB
- Works as a Progressive Web App (PWA) with iOS optimization

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, IndexedDB, SheetJS, JSZip

## Build/Lint/Test Commands

### No Build System
This project uses vanilla JavaScript with no build tools or package.json:
- **Run locally:** Open `index.html` in a browser or use a local server
- **Local server:** `python3 -m http.server 8000` or `npx serve`
- **No tests:** Currently no automated test framework
- **No linter:** No ESLint or Prettier configured

### Git Workflow
- **Check status:** `git status`
- **View diff:** `git diff`
- **Commit changes:** `git add . && git commit -m "message"`
- **View history:** `git log --oneline -10`

### Git Safety Rules
**CRITICAL:** Never push directly to main or any branch:
- ❌ **DO NOT** run `git push` or `git push origin main` directly
- ❌ **DO NOT** push without creating a pull request first
- ✅ **DO:** Create a feature branch, commit changes, and create a PR
- ✅ **DO:** Wait for review/approval before merging
- All changes must go through pull request workflow

### Testing Approach
Since there are no automated tests:
1. Test manually by opening `index.html` in browsers (Chrome, Firefox, Safari)
2. Test mobile by opening in Chrome DevTools device simulator or real iPhone
3. Test Excel import by uploading `Rezepte.xlsx`
4. Verify IndexedDB storage in browser DevTools > Application > IndexedDB

## Code Style Guidelines

### File Organization
```
findYourDinner/
├── index.html              # Main Pinterest-style homepage
├── pages/
│   └── recipe-detail.html  # Recipe detail page
├── js/
│   ├── recipeGenerator.js  # Main recipe loader/manager
│   ├── imageStore.js       # IndexedDB image manager
│   ├── xmlParser.js        # Excel XML parser for images
│   └── lib/
│       └── jszip.min.js    # JSZip library (vendored)
├── css/
│   ├── main.css            # Base styles
│   ├── pinterest.css       # Masonry grid layout
│   ├── detail.css          # Recipe detail page styles
│   ├── mobile.css          # Mobile responsive styles
│   └── chrome-ios.css      # iOS-specific optimizations
└── images/                 # Icons and static images
```

### JavaScript Standards

#### Naming Conventions
- **Classes:** PascalCase (`RecipeGenerator`, `ImageStore`, `XMLParser`)
- **Functions:** camelCase (`loadExcelFile`, `getRecipeByName`, `extractCategories`)
- **Variables:** camelCase (`allRecipes`, `filteredRecipes`, `imageStore`)
- **Constants:** UPPER_SNAKE_CASE for true constants (currently rare in codebase)
- **Private methods:** No special prefix (no true private methods, use conventions)

#### Code Structure
- **ES6 Classes:** Use class syntax for all major components
- **Async/Await:** Prefer async/await over raw Promises
- **Arrow functions:** Use for callbacks and short functions
- **Template literals:** Use backticks for string interpolation

#### Documentation
- **JSDoc comments:** All public methods should have JSDoc blocks:
  ```javascript
  /**
   * Lädt eine Excel-Datei und extrahiert alle Rezepte + Bilder
   * @param {File|Blob} file - Die Excel-Datei
   * @param {Function} progressCallback - Optional: Fortschritts-Callback
   * @returns {Promise<Array>} Array mit allen Rezepten
   */
  async loadExcelFile(file, progressCallback = null) { }
  ```
- **German comments:** Code comments are in German (match existing style)
- **Method descriptions:** Explain what, not how (the code shows how)

#### Error Handling
- **Try-catch:** Wrap async operations in try-catch blocks
- **Console warnings:** Use `console.warn()` for non-critical issues
- **Console errors:** Use `console.error()` for errors (with context)
- **User-facing errors:** Show friendly German messages to users
  ```javascript
  throw new Error(`Fehler beim Laden der Datei: ${error.message}`);
  ```

#### Imports and Dependencies
- **No modules:** Uses global scope (no ES6 imports/exports in HTML context)
- **Script order matters:** Load in order in HTML:
  1. External libraries (SheetJS CDN, JSZip)
  2. Utilities (xmlParser.js)
  3. Core classes (imageStore.js, recipeGenerator.js)
  4. Page-specific logic (inline scripts)
- **Export pattern:** Include CommonJS export for potential Node.js use:
  ```javascript
  if (typeof module !== 'undefined' && module.exports) {
      module.exports = RecipeGenerator;
  }
  ```

### CSS Standards

#### Organization
- **Mobile-first:** Base styles, then add desktop enhancements
- **Responsive breakpoints:** Standard sizes (768px, 1024px, 1400px)
- **CSS Grid:** Use for masonry layout (pinterest.css)
- **Gradients:** 8 predefined gradient backgrounds for recipe cards

#### Naming Conventions
- **BEM-like:** Use descriptive class names (`masonry-grid`, `recipe-pin`, `recipe-pin-image`)
- **State classes:** `.active`, `.loading`, `.error`
- **Utility classes:** `.gradient-1` through `.gradient-8`

#### Browser Compatibility
- **Vendor prefixes:** Include `-webkit-` for iOS Safari support
- **Modern features:** Use CSS Grid, Flexbox (supported by all target browsers)
- **Progressive enhancement:** Core features work without advanced CSS

### HTML Standards

#### Structure
- **Semantic HTML:** Use `<header>`, `<nav>`, `<main>`, `<section>` where appropriate
- **Accessibility:** Include `alt` attributes, ARIA labels where needed
- **Mobile meta tags:** Viewport and iOS-specific tags required

#### Event Handling
- **Inline handlers OK:** Simple onclick handlers inline is acceptable (existing pattern)
- **Event listeners:** Use addEventListener for complex interactions
- **Keyboard shortcuts:** Document and implement (e.g., 'R' for random recipe)

### Language
- **UI text:** All German ("Was koche ich heute?", "Rezepte laden", etc.)
- **Code/variables:** Mix of German and English (existing pattern)
- **Comments:** German for explanatory comments
- **Commit messages:** English (see git history)

## Common Patterns

### Recipe Data Structure
```javascript
{
  id: 0,
  name: "Rezeptname",
  sheetName: "Rezeptname",
  category: "Mittagessen - Hauptgericht",
  hasImage: true,
  imageCount: 1,
  isPlaceholder: false,
  servings: "4 Personen",
  ingredients: [
    { amount: "200", unit: "g", product: "Mehl", note: "" }
  ],
  instructions: [
    { step: 1, text: "Mehl in eine Schüssel geben..." }
  ],
  notes: ["https://example.com/recipe"],
  createdDate: "2024-01-01",
  modifiedDate: "2024-02-09"
}
```

### IndexedDB Pattern
```javascript
// Always check and initialize
if (!this.db) {
    await this.init();
}

// Wrap in Promise for IDB operations
return new Promise((resolve, reject) => {
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('message'));
});
```

### Progress Callback Pattern
```javascript
if (progressCallback) {
    progressCallback({
        phase: 'images',
        progress: 50,
        message: 'Extrahiere Bilder...'
    });
}
```

## Architecture Notes

### Data Flow
1. User uploads `Rezepte.xlsx`
2. **recipeGenerator.js** orchestrates:
   - SheetJS extracts recipe data (ingredients, instructions)
   - JSZip opens Excel as ZIP
   - **xmlParser.js** creates Sheet→Image mapping
   - **imageStore.js** saves images to IndexedDB
3. Recipe data saved to LocalStorage
4. UI displays recipes with masonry grid
5. Images loaded asynchronously via IntersectionObserver

### Key Classes
- **RecipeGenerator:** Main controller, loads Excel, manages recipes
- **ImageStore:** IndexedDB wrapper for recipe images
- **XMLParser:** Static utility for parsing Excel XML internals

### Performance Optimizations
- **Lazy image loading:** IntersectionObserver for viewport-based loading
- **IndexedDB caching:** All images stored offline
- **LocalStorage caching:** Recipe metadata cached
- **Chrome iOS specific:** Position relative, minimal reflows

## Mobile & PWA

### iOS Optimization
- Viewport meta tag with user-scalable=yes
- Apple-specific meta tags (apple-mobile-web-app-capable)
- Touch-friendly button sizes (min 44x44px)
- Fixed background attachment disabled on mobile
- -webkit-font-smoothing for text clarity

### Manifest.json
- PWA installable on iOS/Android
- Icons: SVG format (icon-192.svg, icon-512.svg)
- Standalone display mode
- Theme color: #667eea (purple gradient)

## Common Tasks

### Adding a New Recipe Source
1. Update `recipeGenerator.js` `extractRecipeDetails()` to handle new format
2. Test with sample Excel file
3. Verify image extraction still works

### Adding a New Recipe Category
1. Add category to Excel "Inhaltsverzeichnis" sheet
2. No code changes needed (auto-detected)

### Adding Emoji for Recipe Type
Edit `getRecipeEmoji()` function in `index.html` and `pages/recipe-detail.html`:
```javascript
if (name.includes('pizza')) return '🍕';
```

### Adding a New Gradient Color
Add to `css/pinterest.css`:
```css
.gradient-9 { 
    background: linear-gradient(135deg, #color1 0%, #color2 100%); 
}
```

## Debugging Tips

### Console Commands
```javascript
// View stats
generator.getStats().then(console.log);

// View all image names
imageStore.getAllRecipeNames().then(console.log);

// Clear all data
generator.clearAllData();
```

### Browser DevTools
- **Application tab:** Check LocalStorage and IndexedDB contents
- **Network tab:** Verify JSZip and SheetJS load correctly
- **Console:** Watch for image extraction progress logs

## Important Notes for Agents

1. **No npm/package.json:** This is a vanilla JS project, don't suggest npm install
2. **German UI:** Keep all user-facing text in German
3. **Mobile-first:** Always test mobile responsive behavior
4. **Excel-dependent:** Core functionality requires specific Excel structure
5. **Offline-first:** Changes should preserve offline functionality
6. **Git history:** Check recent commits for conventions (`git log --oneline`)
