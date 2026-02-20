# BMS - Navigateur et Validateur

Extension pour la visionneuse 3D de **Trimble Connect for Browser**.

## Fonctionnalités

| Onglet | Description |
|--------|-------------|
| **Validateur IDS** | Validation de modèles IFC contre des fichiers buildingSMART IDS. Export PDF/CSV. |
| **Fiche technique** | Affichage des propriétés IFC et documents attachés (PDF inline, Google Drive). |
| **Statistiques** | Dashboard interactif avec tuiles modulaires et drag-and-drop. |
| **Explorateur** | Navigation hiérarchique du modèle avec filtres dynamiques et contrôle de visibilité. |

## Stack technique

- **React 19** + TypeScript 5
- **Vite 6** (build + dev server)
- **Tailwind CSS 4** + design tokens Modus 2.0
- **recharts** (graphiques)
- **jsPDF** + html2canvas (export PDF)
- **shadcn/ui** (composants avancés)

## Démarrage rapide

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Build de production
npm run build

# Prévisualisation du build
npm run preview
```

## Configuration

Copier `.env.example` vers `.env` et ajuster les valeurs :

```bash
cp .env.example .env
```

| Variable | Description | Défaut |
|----------|-------------|--------|
| `VITE_TC_API_BASE` | URL de base de l'API Trimble Connect | `https://app.connect.trimble.com/tc/api/2.0` |
| `VITE_TC_REGION` | Région Trimble Connect | `europe` |
| `VITE_EXT_BASE_URL` | URL de base de l'extension déployée | — |
| `VITE_DEBUG` | Active les données mock en fallback | `false` |

## Déploiement dans Trimble Connect

### 1. Build

```bash
npm run build
```

Le dossier `dist/` contient tous les fichiers statiques à déployer.

### 2. Hébergement

Héberger le contenu de `dist/` sur un serveur HTTPS accessible publiquement.

**Important** : Configurer les headers CORS pour autoriser les requêtes depuis `*.connect.trimble.com`.

### 3. Mise à jour du manifest

Éditer `dist/manifest.json` et remplacer les URLs relatives par les URLs absolues de votre hébergement :

```json
{
  "extensions": [{
    "url": "https://votre-domaine.com/trb-ids-validation/index.html",
    "icon": "https://votre-domaine.com/trb-ids-validation/icon-48.png"
  }]
}
```

### 4. Enregistrement

1. Ouvrir un projet dans Trimble Connect
2. Aller dans **Paramètres** > **Extensions**
3. Cliquer **Ajouter une extension personnalisée**
4. Coller l'URL du manifest : `https://votre-domaine.com/trb-ids-validation/manifest.json`
5. Activer l'extension via le toggle

### 5. Utilisation

L'extension apparaît dans le panneau latéral de la visionneuse 3D.

## Structure du projet

```
src/
├── components/
│   ├── tabs/          # Composants des 4 onglets
│   └── ui/            # Composants shadcn/ui réutilisables
├── config/
│   └── env.ts         # Configuration typée des variables d'environnement
├── data/
│   ├── idsLibrary.ts  # Index de la bibliothèque IDS
│   └── mockData.ts    # Données mock pour le prototypage
├── hooks/
│   └── useTrimbleConnect.ts  # Hook + Context pour l'API Trimble
├── services/
│   ├── exportCSV.ts   # Export CSV des résultats
│   ├── exportPDF.ts   # Export PDF via html2canvas + jsPDF
│   ├── idsParser.ts   # Parsing XML des fichiers IDS
│   ├── idsValidator.ts # Moteur de validation IDS
│   └── viewerBridge.ts # Abstraction API viewer + fallback mock
├── types/
│   └── index.ts       # Interfaces TypeScript
├── lib/
│   └── utils.ts       # Utilitaires (cn)
├── App.tsx            # Shell principal + Error Boundary
├── main.tsx           # Point d'entrée React
└── index.css          # Styles globaux + tokens Modus 2.0
public/
├── manifest.json      # Manifest d'extension Trimble Connect
├── ids-library/       # Fichiers IDS prédéfinis
└── docs/              # Documents PDF de test
```

## Bibliothèque IDS

Les fichiers `.ids` prédéfinis sont dans `public/ids-library/`. Pour ajouter un fichier IDS :

1. Placer le fichier `.ids` dans `public/ids-library/`
2. Ajouter l'entrée correspondante dans `src/data/idsLibrary.ts`

Les utilisateurs peuvent également importer leurs propres fichiers IDS via l'interface (drag-and-drop ou sélection de fichier).
