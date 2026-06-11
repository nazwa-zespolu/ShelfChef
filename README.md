# ShelfChef

**A smart pantry in your pocket** — track products, plan shopping, and discover recipes based on what you already have at home.

<!-- Hero: replace the file below with your own main-screen screenshot -->
<p align="center">
  <img src="docs/assets/readme/hero.png" alt="ShelfChef — main app screen" width="320" />
</p>

<p align="center">
  <em>Place a screenshot at <code>docs/assets/readme/hero.png</code></em>
</p>

---

## About the app

ShelfChef is a React Native mobile app that combines kitchen inventory management with shopping planning and meal inspiration. All product data is stored locally in SQLite — no account required, no cloud dependency out of the box.

The app UI is in **Polish**; this README is in English for broader readability.

Four tabs in the bottom navigation:

| Tab | What it does |
|-----|--------------|
| **Pantry** | Browse products with expiry dates and opened status |
| **Add product** | Scan an EAN barcode or add items manually with an optional photo |
| **Shopping lists** | Multiple lists, replenishment suggestions, product catalog |
| **AI recipes** | Meal ideas from a local on-device language model |

---

## Features

### Pantry

- Product list with thumbnails, brand, and expiry date
- Search and sort (name, expiry date, brand)
- **Swipe right** — mark a product as opened (or undo)
- **Swipe left** — remove from inventory
- Gesture hint after adding the first product
- Visual highlight for opened products

<!-- Screenshot: docs/assets/readme/pantry.png -->
<p align="center">
  <img src="docs/assets/readme/pantry.png" alt="Pantry — product list" width="280" />
  &nbsp;&nbsp;
  <img src="docs/assets/readme/pantry-swipe.png" alt="Pantry — swipe gesture" width="280" />
</p>

<p align="center"><em><code>pantry.png</code> · <code>pantry-swipe.png</code></em></p>

---

### Adding products

- Barcode scanning with the device camera (Vision Camera)
- Auto-fill from **Open Food Facts** (name, brand, category, image)
- Manual entry with optional EAN, photo from camera or gallery
- Expiry date picker (wheel UI) or add without a date
- Add multiple units at once

<!-- Screenshot: docs/assets/readme/scan.png -->
<p align="center">
  <img src="docs/assets/readme/scan.png" alt="EAN barcode scanner" width="280" />
  &nbsp;&nbsp;
  <img src="docs/assets/readme/scan-form.png" alt="Manual add form" width="280" />
</p>

<p align="center"><em><code>scan.png</code> · <code>scan-form.png</code></em></p>

---

### Shopping lists

- Multiple lists with custom icon and color
- Manual items and items linked to the product catalog
- Auto lists with replenishment suggestions based on pantry contents
- Edit, drag to reorder, mark as purchased
- Catalog product images on list items

<!-- Screenshot: docs/assets/readme/shopping.png -->
<p align="center">
  <img src="docs/assets/readme/shopping.png" alt="Shopping lists" width="280" />
  &nbsp;&nbsp;
  <img src="docs/assets/readme/shopping-suggestions.png" alt="Replenishment suggestions" width="280" />
</p>

<p align="center"><em><code>shopping.png</code> · <code>shopping-suggestions.png</code></em></p>

---

### AI recipes

- Generate meal ideas from pantry contents
- **Qwen 2.5 3B** model running locally via ExecuTorch (no data sent to the cloud)
- Choose meal type (breakfast, dinner, dessert…) and dietary preferences
- Ingredient categorization for diets (vegan, gluten-free, etc.)
- Optional dish photos from Pixabay (requires an API key)

<!-- Screenshot: docs/assets/readme/recipes.png -->
<p align="center">
  <img src="docs/assets/readme/recipes-preferences.png" alt="Recipe preferences" width="280" />
  &nbsp;&nbsp;
  <img src="docs/assets/readme/recipes-results.png" alt="Recipe generation results" width="280" />
</p>

<p align="center"><em><code>recipes-preferences.png</code> · <code>recipes-results.png</code></em></p>

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│  React Native UI                                        │
│  HomeView · ProductScannerView · ShoppingListView ·     │
│  RecipeGeneratorView                                    │
├─────────────────────────────────────────────────────────┤
│  Application layer                                      │
│  ScanToAdd · ShoppingList · RecipeGenerationPipeline    │
├─────────────────────────────────────────────────────────┤
│  Infrastructure                                         │
│  ProductRepository · ShoppingListRepository · SQLite    │
│  OpenFoodFactsClient · ExecuTorch LLM · Pixabay         │
└─────────────────────────────────────────────────────────┘
```

| Layer | Technologies |
|-------|----------------|
| UI | React Native 0.85, TypeScript, lucide-react-native |
| Database | react-native-quick-sqlite (on-device) |
| Scanner | react-native-vision-camera |
| Product photos | react-native-image-picker, react-native-fs |
| AI recipes | react-native-executorch (Qwen 2.5 3B quantized) |
| Dish images | Pixabay API (optional) |
| Product data | Open Food Facts API |

Database schema: [`docs/db/schema.md`](docs/db/schema.md)

---

## Screenshots and assets

Keep all README graphics in:

```
docs/assets/readme/
├── hero.png                  # banner / main screen
├── pantry.png                # pantry
├── pantry-swipe.png          # swipe gesture
├── scan.png                  # scanner
├── scan-form.png             # add form
├── shopping.png              # shopping lists
├── shopping-suggestions.png  # replenishment suggestions
├── recipes-preferences.png   # recipe preferences
└── recipes-results.png       # AI results
```

Recommended format: PNG or WebP, width ~1080 px (phone) or ~720 px (single screen). Remove the italic captions under images once files are added.

---

## Getting started

Application code lives in [`src/`](src/).

### Requirements

- Node.js ≥ 22.11
- Android Studio with a configured emulator (AVD) or a connected device
- [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment)

### First build

```bash
# From the repository root
npm install

cd src
npm install

# Start the emulator in Android Studio, then:
npx react-native run-android
```

### Day-to-day development

```bash
cd src
npx react-native start
```

Then open the ShelfChef app on the emulator. Code changes reload automatically (Fast Refresh).

> **"Unable to load script" error?** Make sure Metro Bundler is running (`npx react-native start`).

> **New native library or changes in `/android`?** Run `npx react-native run-android` again.

### Optional configuration

Copy the env file and add your Pixabay key (dish images in the recipes module):

```bash
cp src/.env.example src/.env
```

```
PIXABAY_API_KEY=your_key_here
```

Without a key the app works normally — recipes are generated without dish thumbnails.

---

## Tests

Run unit and integration tests from the repository root:

```bash
npm test
```

```bash
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

---

## Repository structure

```
ShelfChef/
├── src/                    # React Native app
│   ├── App.tsx             # navigation and tabs
│   ├── HomeView.tsx        # pantry
│   ├── ProductScannerView.tsx
│   ├── ShoppingListView.tsx
│   ├── RecipeGeneratorView.tsx
│   ├── features/           # AI recipes module
│   ├── shopping-lists/     # shopping lists module
│   └── infrastructure/     # repositories, database, APIs
├── tests/                  # Jest tests (repository root)
├── docs/                   # project documentation
│   ├── assets/readme/      # graphics for this README
│   └── db/                 # database schema
└── README.md
```

---

## License

Academic / team project. See the repository and documentation in `docs/` for details.
