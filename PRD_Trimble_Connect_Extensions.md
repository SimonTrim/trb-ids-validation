# PRD — Création d'Extensions pour Trimble Connect

> **Document de référence technique complet** pour la création d'extensions Trimble Connect.
> Ce document contient toutes les informations nécessaires pour qu'un agent IA ou un développeur puisse créer n'importe quel type d'extension pour Trimble Connect.

---

## Table des matières

1. [Vue d'ensemble de la plateforme](#1-vue-densemble-de-la-plateforme)
2. [Types d'extensions](#2-types-dextensions)
3. [Architecture technique recommandée](#3-architecture-technique-recommandée)
4. [Authentification et Autorisations](#4-authentification-et-autorisations)
5. [Workspace API — Référence complète](#5-workspace-api--référence-complète)
6. [API REST Trimble Connect (Core v2.0)](#6-api-rest-trimble-connect-core-v20)
7. [API BCF Topics (BIM Collaboration Format)](#7-api-bcf-topics-bim-collaboration-format)
8. [API Viewer 3D — Référence complète](#8-api-viewer-3d--référence-complète)
9. [Composants embarqués (Embedded)](#9-composants-embarqués-embedded)
10. [Manifestes d'extension](#10-manifestes-dextension)
11. [Régions et URLs de base](#11-régions-et-urls-de-base)
12. [Backend Proxy — Architecture](#12-backend-proxy--architecture)
13. [Déploiement](#13-déploiement)
14. [Structure de projet recommandée](#14-structure-de-projet-recommandée)
15. [Système de conception — Modus 2.0 & shadcn/ui](#15-système-de-conception--modus-20--shadcnui)
16. [Workflow Agent IA — Guide de développement interactif](#16-workflow-agent-ia--guide-de-développement-interactif)
17. [Gestion des erreurs et bonnes pratiques](#17-gestion-des-erreurs-et-bonnes-pratiques)
18. [Exemples de code](#18-exemples-de-code)
19. [Ressources et documentation officielle](#19-ressources-et-documentation-officielle)
20. [Retour d'expérience — Patterns validés pour Extension Viewer 3D (React + Vite)](#20-retour-dexpérience--patterns-validés-pour-extension-viewer-3d-react--vite)

---

## 1. Vue d'ensemble de la plateforme

Trimble Connect est une plateforme collaborative BIM (Building Information Modeling) permettant de gérer des projets de construction. Elle offre un écosystème d'extensions via son **Workspace API**.

### Principes fondamentaux

- Les extensions sont des **applications web** chargées dans des `<iframe>` à l'intérieur de Trimble Connect for Browser
- La communication se fait via `window.postMessage()` encapsulé par le **Workspace API**
- L'authentification est gérée par **Trimble Identity (OAuth 2.0)**
- L'API REST utilise des **serveurs régionaux** (US, EU, APAC, AU)
- Le **BCF API** utilise des serveurs dédiés **différents** du Core API

### Deux modes de fonctionnement

| Mode | Contexte | Auth | Description |
|------|----------|------|-------------|
| **Intégré** | Extension dans Trimble Connect | `extension.requestPermission('accesstoken')` | L'extension tourne dans l'iframe TC |
| **Standalone** | Application web indépendante | OAuth 2.0 Authorization Code | L'app gère sa propre auth |

---

## 2. Types d'extensions

### 2.1 Extension Projet (Project Extension)

L'extension s'affiche dans le **panneau latéral gauche** de Trimble Connect, à côté des menus natifs (Navigateur, Vues, Activités, etc.).

- **Emplacement** : panneau central + droit de la page Projet
- **Menu** : apparaît dans la navigation gauche (configurable par l'extension)
- **Cas d'usage** : Dashboards, gestion documentaire, rapports, formulaires, workflows

**Manifest minimal :**
```json
{
  "icon": "https://monapp.com/icon.png",
  "title": "Mon Extension",
  "url": "https://monapp.com/index.html",
  "description": "Description de l'extension",
  "enabled": true
}
```

### 2.2 Extension 3D Viewer

L'extension s'affiche dans un **panneau latéral du Viewer 3D**.

- **Emplacement** : panneau dans le Viewer 3D
- **Accès** : toutes les API Viewer (caméra, sélection, objets, section planes, etc.)
- **Cas d'usage** : Analyse de modèle, annotations, clash detection, QA/QC, mesures

**Manifest minimal :**
```json
{
  "url": "https://monapp.com/viewer-extension/index.html",
  "title": "Mon Extension 3D",
  "icon": "https://monapp.com/icon.png",
  "infoUrl": "https://monapp.com/help.html"
}
```

### 2.3 Composants embarqués (Embedded Components)

Intégrer les composants Trimble Connect **dans votre propre application web**.

| Composant | Méthode d'init | Description |
|-----------|----------------|-------------|
| **3D Viewer** | `embed.init3DViewer()` | Viewer 3D embarqué |
| **File Explorer** | `embed.initFileExplorer()` | Explorateur de fichiers embarqué |
| **Project List** | `embed.initProjectList()` | Liste des projets embarquée |

**URL d'embed** : `https://web.connect.trimble.com/?isEmbedded=true`

---

## 3. Architecture technique recommandée

### Stack technique

```
┌────────────────────────────────────────────────────┐
│           TRIMBLE CONNECT (for Browser)            │
│  ┌──────────────────────────────────────────────┐  │
│  │  <iframe> — VOTRE EXTENSION                  │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │  Frontend (HTML/CSS/JS ou framework)   │  │  │
│  │  │  + Workspace API SDK                   │  │  │
│  │  └────────────┬───────────────────────────┘  │  │
│  └───────────────┼──────────────────────────────┘  │
└──────────────────┼─────────────────────────────────┘
                   │ HTTPS (fetch)
        ┌──────────▼──────────┐
        │  BACKEND PROXY      │
        │  (Vercel / Node.js) │
        │  - Auth proxy       │
        │  - CORS             │
        └──────────┬──────────┘
                   │ HTTPS + Bearer Token
        ┌──────────▼──────────┐
        │  TRIMBLE CONNECT    │
        │  REST API (v2.0)    │
        │  + BCF API          │
        └─────────────────────┘
```

### Pourquoi un backend proxy ?

1. **CORS** : Les API Trimble ne permettent pas les appels directs depuis un iframe
2. **Sécurité** : Ne pas exposer le `client_secret` dans le frontend
3. **Fallback OAuth** : Permettre le mode standalone avec OAuth complet
4. **Transformation** : Adapter les réponses API au format attendu par le frontend

### Technologies recommandées

| Couche | Technologies | Notes |
|--------|-------------|-------|
| **Frontend** | TypeScript, Webpack/Vite, React/Vue/Vanilla | Doit être léger (chargé dans un iframe) |
| **Design System** | **Modus 2.0** (`@trimble-oss/moduswebcomponents`) | **Obligatoire** — Design system officiel Trimble ([modus.trimble.com](https://modus.trimble.com/)) |
| **UI Complémentaire** | **shadcn/ui** (composants + blocks) | Blocks et composants avancés ([ui.shadcn.com](https://ui.shadcn.com/)) — complète Modus pour layouts/dashboards |
| **Backend** | Node.js + Express | Proxy simple vers les API Trimble |
| **Déploiement frontend** | GitHub Pages, Vercel, Netlify | URL publique HTTPS |
| **Déploiement backend** | Vercel Serverless, AWS Lambda, Heroku | Serverless recommandé |
| **Workspace API** | `trimble-connect-workspace-api` (npm) | SDK officiel |

---

## 4. Authentification et Autorisations

### 4.1 Mode intégré (dans Trimble Connect)

L'extension reçoit le token d'accès directement de Trimble Connect :

```typescript
// Connexion au Workspace API
const API = await WorkspaceAPI.connect(window.parent, onEvent);

// Demande du token
const token = await API.extension.requestPermission('accesstoken');
// Retourne: 'pending' | 'denied' | '<access_token>'

// Le token est rafraîchi automatiquement via l'événement:
function onEvent(event: string, data: any) {
  if (event === 'extension.accessToken') {
    const newToken = data; // nouveau token
  }
}
```

**Flux :**
1. L'extension appelle `requestPermission('accesstoken')`
2. Trimble Connect affiche une boîte de consentement à l'utilisateur
3. Si accepté : retourne le token + émet `extension.accessToken` à chaque refresh
4. Si refusé : retourne `'denied'`

### 4.2 Mode standalone (OAuth 2.0 Authorization Code)

Pour les applications autonomes en dehors de Trimble Connect.

**URLs OAuth :**

| Environnement | Authorize | Token |
|---------------|-----------|-------|
| **Production** | `https://id.trimble.com/oauth/authorize` | `https://id.trimble.com/oauth/token` |
| **Staging** | `https://stage.id.trimble.com/oauth/authorize` | `https://stage.id.trimble.com/oauth/token` |

**Paramètres d'autorisation :**

```
GET https://id.trimble.com/oauth/authorize
  ?response_type=code
  &client_id={TRIMBLE_CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=openid {SCOPE}
  &state={STATE}
```

**Échange du code :**

```
POST https://id.trimble.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={AUTH_CODE}
&redirect_uri={REDIRECT_URI}
&client_id={TRIMBLE_CLIENT_ID}
&client_secret={TRIMBLE_CLIENT_SECRET}
```

**Réponse :**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Refresh du token :**

```
POST https://id.trimble.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={REFRESH_TOKEN}
&client_id={TRIMBLE_CLIENT_ID}
&client_secret={TRIMBLE_CLIENT_SECRET}
```

### 4.3 Scopes disponibles

- `openid` — Obligatoire
- Scope spécifique à l'application (ex: `SMA-tc-monapp`)

### 4.4 Utilisation du token

Toutes les requêtes API utilisent le header :
```
Authorization: Bearer {access_token}
```

---

## 5. Workspace API — Référence complète

### 5.1 Installation

**NPM :**
```bash
npm install trimble-connect-workspace-api --save
```

**CDN (pour les extensions sans bundler) :**
```html
<script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>
```

**Script additionnel (extension dans TC) :**
```html
<script src="https://app.connect.trimble.com/tc/static/5.0.0/tcw-extension-api.js"></script>
```

### 5.2 Connexion

```typescript
import * as WorkspaceAPI from 'trimble-connect-workspace-api';

// Mode extension (dans Trimble Connect)
const API = await WorkspaceAPI.connect(
  window.parent,
  (event: string, data: any) => {
    // Gestionnaire d'événements
  },
  30000 // timeout en ms
);

// Mode embarqué (votre app embarque TC)
const iframe = document.getElementById('viewer-iframe');
const API = await WorkspaceAPI.connect(iframe, onEvent);
```

### 5.3 Namespaces API

L'objet `API` retourné contient les namespaces suivants :

| Namespace | Interface | Description |
|-----------|-----------|-------------|
| `API.project` | `ProjectAPI` | Infos projet (id, name, location) |
| `API.user` | `UserAPI` | Infos utilisateur (settings, langue) |
| `API.extension` | `ExtensionAPI` | Gestion extension (token, permissions, status) |
| `API.ui` | `UIAPI` | Interface utilisateur (menus, thème) |
| `API.viewer` | `ViewerAPI` | **Viewer 3D** (caméra, sélection, objets) |
| `API.view` | `ViewAPI` | Gestion des vues sauvegardées |
| `API.embed` | `EmbedAPI` | Composants embarqués (init, tokens) |
| `API.markup` | `MarkupAPI` | Annotations/markups dans le viewer |
| `API.modelsPanel` | `ModelsPanelAPI` | Panneau de modèles |
| `API.propertyPanel` | `PropertyPanelAPI` | Panneau de propriétés |
| `API.dataTable` | `DataTableAPI` | Tableau de données |

### 5.4 ProjectAPI

```typescript
// Obtenir les infos du projet courant
const project = await API.project.getCurrentProject();
// Retourne: { id: string, name: string, location: string, rootId: string }
// location = 'europe' | 'northAmerica' | 'asia' | 'australia'

// Obtenir le projet (alias)
const project = await API.project.getProject();
```

### 5.5 UserAPI

```typescript
// Paramètres utilisateur
const settings = await API.user.getUserSettings();
// Retourne: { language: string, ... }
```

### 5.6 ExtensionAPI

```typescript
// Demander le token d'accès
const token = await API.extension.requestPermission('accesstoken');
// 'pending' → en attente de consentement
// 'denied' → refusé par l'utilisateur
// '<token>' → token JWT valide

// Définir un message de statut
API.extension.setStatusMessage('Chargement en cours...');
```

### 5.7 UIAPI (Menus)

```typescript
// Définir le menu latéral de l'extension
API.ui.setMenu({
  title: 'Mon Extension',
  icon: 'https://monapp.com/icon.png',
  command: 'main_menu',
  subMenus: [
    {
      title: 'Sous-menu 1',
      icon: 'https://monapp.com/icon1.png',
      command: 'submenu_1',
    },
    {
      title: 'Sous-menu 2',
      icon: 'https://monapp.com/icon2.png',
      command: 'submenu_2',
    },
  ],
});

// Définir le menu actif
API.ui.setActiveMenuItem('submenu_1');

// Avec query params dynamiques
API.ui.setActiveMenuItem('submenu_1?id=123');
```

### 5.8 Événements

```typescript
function onEvent(event: string, data: any) {
  switch (event) {
    case 'extension.command':
      // Menu cliqué — data = command string (ex: 'submenu_1')
      break;
    case 'extension.accessToken':
      // Nouveau token — data = access token string
      break;
    case 'extension.userSettingsChanged':
      // Paramètres utilisateur modifiés
      break;
    case 'extension.sessionInvalid':
      // Session expirée (mode embedded)
      break;
    // Événements Viewer 3D:
    case 'viewer.selectionChanged':
      // Sélection changée dans le viewer
      break;
    case 'viewer.cameraChanged':
      // Caméra modifiée
      break;
    case 'viewer.modelLoaded':
      // Modèle chargé
      break;
    case 'viewer.modelRemoved':
      // Modèle déchargé
      break;
  }
}
```

---

## 6. API REST Trimble Connect (Core v2.0)

### 6.1 URL de base par région

| Région | Code | Host Production | URL de base |
|--------|------|-----------------|-------------|
| Amérique du Nord | `us` | `app.connect.trimble.com` | `https://app.connect.trimble.com/tc/api/2.0` |
| Europe | `eu` | `app21.connect.trimble.com` | `https://app21.connect.trimble.com/tc/api/2.0` |
| Asie-Pacifique | `ap` | `app31.connect.trimble.com` | `https://app31.connect.trimble.com/tc/api/2.0` |
| Australie | `ap-au` | `app32.connect.trimble.com` | `https://app32.connect.trimble.com/tc/api/2.0` |

**Staging :**

| Région | Host Staging |
|--------|-------------|
| US | `app.stage.connect.trimble.com` |
| EU | `app21.stage.connect.trimble.com` |
| AP | `app31.stage.connect.trimble.com` |
| AU | `app32.stage.connect.trimble.com` |

### 6.2 Mapping location → region

La propriété `project.location` retournée par le Workspace API doit être convertie :

```typescript
function getRegionCode(location: string): string {
  const loc = location.toLowerCase();
  if (loc === 'northamerica' || loc === 'us') return 'us';
  if (loc === 'europe' || loc === 'eu') return 'eu';
  if (loc === 'asia' || loc === 'ap') return 'ap';
  if (loc === 'australia' || loc === 'ap-au') return 'ap-au';
  return 'us'; // défaut
}
```

### 6.3 Headers requis

```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### 6.4 Endpoints disponibles

#### Projets

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/projects` | Lister les projets de l'utilisateur |
| GET | `/projects/{projectId}` | Détails d'un projet |
| GET | `/projects/{projectId}/users` | Membres du projet |
| POST | `/projects` | Créer un projet |
| PUT | `/projects/{projectId}` | Modifier un projet |
| DELETE | `/projects/{projectId}` | Supprimer un projet |

#### Fichiers / Documents

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/search?query=*&projectId={id}&type=FILE` | **Rechercher des fichiers** (méthode recommandée) |
| GET | `/sync/{projectId}?excludeVersion=true` | Sync complète du projet (fallback) |
| GET | `/folders/{folderId}/items` | Contenu d'un dossier |
| GET | `/folders/{folderId}` | Détails d'un dossier (nom, parentId) |
| GET | `/files/{fileId}` | Détails d'un fichier |
| GET | `/files/{fileId}/versions` | Versions d'un fichier |
| GET | `/files/{fileId}/downloadurl` | URL de téléchargement |
| POST | `/files` | Upload un fichier |
| PATCH | `/files/{fileId}` | **Modifier un fichier** (ex: déplacer via `{ parentId }`) |
| DELETE | `/files/{fileId}` | Supprimer un fichier |

> **Important** : L'endpoint `search` est le plus fiable pour récupérer les fichiers. Le `sync` et `folders` sont des fallbacks.

#### Déplacer un fichier entre dossiers (VÉRIFIÉ ✅)

La méthode officielle TC pour déplacer un fichier est de modifier son `parentId` via PATCH :

```http
PATCH /tc/api/2.0/files/{fileId}
Authorization: Bearer {token}
Content-Type: application/json

{ "parentId": "{targetFolderId}" }
```

**Stratégies implémentées (en cascade) :**
1. `PATCH /files/{fileId}` avec `{ parentId }` — API native TC (recommandée)
2. `PATCH /projects/{projectId}/files/{fileId}` avec `{ parentId }` — Variante project-scoped
3. Copie + suppression : `POST /folders/{targetId}/files` puis `DELETE /folders/{sourceId}/files/{fileId}`

> **Note** : Les endpoints `/files/{fileId}/content` et `/files/{fileId}/download` sont **retirés** (status 400 `RETIRED_URL_OR_METHOD`). Ne pas les utiliser.

#### Ouvrir un document dans la visionneuse TC (VÉRIFIÉ ✅)

**Visionneuse 2D** (PDF, DOC, DWG, images) — URL testée et fonctionnelle :
```
https://web.connect.trimble.com/projects/{projectId}/viewer/2D?id={versionId}&version={versionId}&type=revisions&etag={versionId}
```

**Visionneuse 3D** (IFC, RVT, SKP, NWD) — URL testée et fonctionnelle :
```
https://web.connect.trimble.com/projects/{projectId}/viewer/3d/?modelId={fileId}&l=&origin={tcHost}
```

Où `tcHost` dépend de la région :
| Région | tcHost |
|--------|--------|
| US | `app.connect.trimble.com` |
| EU | `app21.connect.trimble.com` |
| AP | `app31.connect.trimble.com` |
| AP-AU | `app32.connect.trimble.com` |

**Résolution du versionId :** Le `versionId` nécessaire pour la visionneuse 2D peut être identique au `fileId` (dans la majorité des cas). Il est récupéré via `GET /files/{fileId}` (champ `versionId` dans la réponse).

> **URLs qui ne fonctionnent PAS :**
> - `https://web.connect.trimble.com/tc/app#/project/{projectId}/file/{fileId}` → redirige vers la page projet
> - `https://web.connect.trimble.com/tc/app#/project/{projectId}/file/{fileId}/view` → même résultat
> - `https://web.connect.trimble.com/projects/{projectId}/data#item={fileId}` → page projet sans fichier
> - `https://web.connect.trimble.com/projects/{projectId}/models?fileId={fileId}` → page modèles vide
> - `https://web.connect.trimble.com/projects/{projectId}/viewer/3D?id={fileId}&version=...` → visionneuse 3D vide (ne charge pas le modèle)

#### Normalisation du champ `path` de l'API TC (VÉRIFIÉ ✅)

Le champ `path` retourné par l'API TC pour les fichiers peut être :
- Une **string** simple : `"Dossier/SousDossier"`
- Un **array d'objets** : `[{ name: "Dossier" }, { name: "SousDossier" }]`
- Un **array de strings** : `["Dossier", "SousDossier"]`

Il faut normaliser ce champ pour l'afficher. Exemple de fonction backend :
```javascript
function normalizeTcPath(rawPath) {
  if (!rawPath) return '';
  if (typeof rawPath === 'string') return rawPath;
  if (Array.isArray(rawPath)) {
    return rawPath
      .map(segment => {
        if (typeof segment === 'string') return segment;
        if (segment && typeof segment === 'object') return segment.name || '';
        return '';
      })
      .filter(Boolean)
      .join(' / ');
  }
  return '';
}
```

#### Notes / Todos

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/todos?projectId={id}` | Lister les todos du projet |
| GET | `/todos/{todoId}` | Détails d'un todo |
| POST | `/todos` | Créer un todo |
| PUT | `/todos/{todoId}` | Modifier un todo |
| DELETE | `/todos/{todoId}` | Supprimer un todo |

**Structure d'un Todo :**
```json
{
  "id": "...",
  "label": "Titre de la note",
  "description": "Contenu",
  "createdBy": "user@email.com",
  "createdOn": "2025-01-01T00:00:00Z",
  "modifiedOn": "2025-01-02T00:00:00Z",
  "done": false,
  "projectId": "..."
}
```

#### Vues 3D

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/views?projectId={id}` | Lister les vues sauvegardées |
| GET | `/views/{viewId}` | Détails d'une vue |
| GET | `/views/{viewId}/thumbnail` | **Vignette** d'une vue (image, nécessite auth) |
| POST | `/views` | Créer une vue |
| DELETE | `/views/{viewId}` | Supprimer une vue |

> **Attention** : L'endpoint `views` utilise un **query parameter** `projectId` et non un path parameter.

#### Régions

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/regions` | Lister les régions disponibles |

#### Clash Sets

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/clashsets?projectId={id}` | Lister les clash sets |
| GET | `/clashsets/{clashSetId}` | Détails d'un clash set |
| GET | `/clashsets/{clashSetId}/results` | Résultats du clash |

---

## 7. API BCF Topics (BIM Collaboration Format)

### 7.1 URLs de base BCF (DIFFÉRENTES du Core API)

> **CRITIQUE** : Le BCF API utilise des serveurs `openXX` différents des serveurs `appXX` du Core API.

| Région | Host BCF | URL de base |
|--------|----------|-------------|
| US | `open11.connect.trimble.com` | `https://open11.connect.trimble.com` |
| EU | `open21.connect.trimble.com` | `https://open21.connect.trimble.com` |
| AP | `open31.connect.trimble.com` | `https://open31.connect.trimble.com` |
| AU | `open32.connect.trimble.com` | `https://open32.connect.trimble.com` |

### 7.2 Versions BCF supportées

Essayer dans l'ordre :
1. **BCF 3.0** : `/bcf/3.0/projects/{projectId}/topics`
2. **BCF 2.1** : `/bcf/2.1/projects/{projectId}/topics`
3. **Sans version** : `/projects/{projectId}/topics`

### 7.3 Endpoints BCF

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/bcf/{version}/projects/{id}/topics` | Lister les topics BCF |
| GET | `/bcf/{version}/projects/{id}/topics/{topicId}` | Détails d'un topic |
| POST | `/bcf/{version}/projects/{id}/topics` | Créer un topic |
| PUT | `/bcf/{version}/projects/{id}/topics/{topicId}` | Modifier un topic |
| DELETE | `/bcf/{version}/projects/{id}/topics/{topicId}` | Supprimer un topic |
| GET | `/bcf/{version}/projects/{id}/topics/{topicId}/comments` | Commentaires d'un topic |
| POST | `/bcf/{version}/projects/{id}/topics/{topicId}/comments` | Ajouter un commentaire |
| GET | `/bcf/{version}/projects/{id}/topics/{topicId}/viewpoints` | Viewpoints d'un topic |
| POST | `/bcf/{version}/projects/{id}/topics/{topicId}/viewpoints` | Créer un viewpoint |

**Structure d'un Topic BCF :**
```json
{
  "guid": "...",
  "title": "Clash entre mur et gaine",
  "description": "Description détaillée",
  "creation_date": "2025-01-01T00:00:00Z",
  "modified_date": "2025-01-02T00:00:00Z",
  "creation_author": "user@email.com",
  "assigned_to": "other@email.com",
  "topic_status": "Open",
  "topic_type": "Issue",
  "priority": "High",
  "due_date": "2025-02-01T00:00:00Z",
  "labels": ["Architecture", "MEP"]
}
```

**Swagger officiel** : https://app.swaggerhub.com/apis/Trimble-Connect/topic/v2

---

## 8. API Viewer 3D — Référence complète

L'API Viewer est accessible via `API.viewer` pour les extensions 3D.

### 8.1 Gestion de la caméra

```typescript
// Obtenir la caméra
const camera = await API.viewer.getCamera();
// { position: {x,y,z}, target: {x,y,z}, up: {x,y,z}, ... }

// Définir la caméra
await API.viewer.setCamera({
  position: { x: 10, y: 20, z: 30 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 }
}, { animationTime: 500 });

// Réinitialiser
await API.viewer.setCamera('reset');

// Cadrer sur des objets
await API.viewer.setCamera({ modelId: 'xxx', objectRuntimeIds: [1, 2, 3] });

// Mode caméra (orbit, walk, fly)
await API.viewer.setCameraMode('walk', spawnPoint);
const mode = await API.viewer.getCameraMode();
```

### 8.2 Sélection d'objets

```typescript
// Obtenir la sélection courante
const selection = await API.viewer.getSelection();

// Sélectionner des objets
await API.viewer.setSelection(
  { modelId: 'xxx', objectRuntimeIds: [1, 2, 3] },
  'set' // 'set' | 'add' | 'remove'
);

// Obtenir les propriétés d'objets
const props = await API.viewer.getObjectProperties('modelId', [1, 2, 3]);
// [{ runtimeId, name, type, properties: [...] }]

// Isoler des objets (masquer tout le reste)
await API.viewer.isolateEntities([
  { modelId: 'xxx', objectRuntimeIds: [1, 2, 3] }
]);
```

### 8.3 État des objets (visibilité, couleur)

```typescript
// Changer l'état des objets
await API.viewer.setObjectState(
  { modelId: 'xxx', objectRuntimeIds: [1, 2] },  // selector
  { visible: true, color: '#FF0000' }              // state
);

// Appliquer à tous les objets
await API.viewer.setObjectState(undefined, { visible: true });

// Obtenir les objets colorés
const colored = await API.viewer.getColoredObjects();
```

### 8.4 Modèles

```typescript
// Lister les modèles
const models = await API.viewer.getModels(); // tous les modèles
const loaded = await API.viewer.getModels('loaded'); // chargés seulement

// Charger/décharger un modèle
await API.viewer.toggleModel('modelId', true);  // charger
await API.viewer.toggleModel('modelId', false); // décharger

// Charger une version spécifique
await API.viewer.toggleModelVersion(
  { modelId: 'xxx', versionId: 'yyy' }, true
);

// Supprimer un modèle du viewer
await API.viewer.removeModel('modelId');

// Obtenir les infos d'un modèle chargé
const file = await API.viewer.getLoadedModel('modelId');
```

### 8.5 Plans de coupe (Section Planes & Boxes)

```typescript
// Ajouter un plan de coupe
const planes = await API.viewer.addSectionPlane({
  position: { x: 0, y: 0, z: 5 },
  normal: { x: 0, y: 0, z: 1 }
});

// Obtenir les plans de coupe
const allPlanes = await API.viewer.getSectionPlanes();

// Supprimer des plans de coupe
await API.viewer.removeSectionPlanes([planeId]);
await API.viewer.removeSectionPlanes(); // tous

// Boîte de section
await API.viewer.addSectionBox({
  min: { x: -10, y: -10, z: 0 },
  max: { x: 10, y: 10, z: 5 }
});
await API.viewer.removeSectionBox();
```

### 8.6 Captures et présentations

```typescript
// Capture d'écran du viewer (base64)
const snapshot = await API.viewer.getSnapshot();
// "data:image/png;base64,..."

// Présentation courante
const presentation = await API.viewer.getPresentation();
```

### 8.7 Bounding boxes et positions

```typescript
// Bounding box d'objets
const boxes = await API.viewer.getObjectBoundingBoxes('modelId', [runtimeId1, runtimeId2]);
// [{ runtimeId, min: {x,y,z}, max: {x,y,z} }]
```

### 8.8 Couches (Layers)

```typescript
// Obtenir les couches d'un modèle
const layers = await API.viewer.getLayers('modelId');

// Changer la visibilité des couches
await API.viewer.setLayersVisibility('modelId', [
  { name: 'Architecture', visible: true },
  { name: 'MEP', visible: false }
]);
```

### 8.9 Icônes et annotations

```typescript
// Ajouter une icône dans l'espace 3D
await API.viewer.addIcon({
  position: { x: 10, y: 20, z: 5 },
  icon: 'https://monapp.com/marker.png',
  id: 'marker-1'
});

// Supprimer une icône
await API.viewer.removeIcon({ id: 'marker-1' });
```

### 8.10 Outils du viewer

```typescript
// Activer un outil
await API.viewer.activateTool('measure');
await API.viewer.activateTool('markup');
await API.viewer.activateTool('reset'); // outil par défaut

// Réinitialiser le viewer
await API.viewer.reset();
```

### 8.11 Point Clouds et Panoramas

```typescript
// Ajouter un nuage de points
await API.viewer.addPointCloud({
  modelId: 'pc-1',
  url: 'https://monapp.com/pointcloud',
  position: { x: 0, y: 0, z: 0 }
});

// Ajouter un panorama
await API.viewer.addPanorama({
  // PanoramaMetadata configuration
});

// Configurer les paramètres du nuage de points
await API.viewer.setPointCloudSettings({
  pointSize: 2,
  pointBudget: 1000000
});
```

### 8.12 Trimble BIM Models (.trb)

```typescript
// Ajouter un modèle Trimbim
await API.viewer.addTrimbimModel({
  id: 'trb-1',
  visible: true,
  // blob: ... (optionnel, max 10MB)
});

// Supprimer
await API.viewer.removeTrimbimModel('trb-1');
```

### 8.13 Conversion d'identifiants

```typescript
// Runtime IDs → External IDs (ex: IFC GUIDs)
const externalIds = await API.viewer.convertToObjectIds('modelId', [1, 2, 3]);

// External IDs → Runtime IDs
const runtimeIds = await API.viewer.convertToObjectRuntimeIds('modelId', ['guid1', 'guid2']);
```

### 8.14 Hiérarchie du modèle

```typescript
// Enfants d'un élément
const children = await API.viewer.getHierarchyChildren('modelId', [entityId], 'spatial', true);

// Parents d'un élément
const parents = await API.viewer.getHierarchyParents('modelId', [entityId], 'spatial', true);
```

---

## 9. Composants embarqués (Embedded)

### 9.1 Viewer 3D embarqué

```html
<iframe id="viewer" src="https://web.connect.trimble.com/?isEmbedded=true"></iframe>
<script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>
<script>
  const viewer = document.getElementById('viewer');
  const API = await TrimbleConnectWorkspace.connect(viewer, onEvent);
  
  await API.embed.setTokens({ accessToken: 'xxx' });
  await API.embed.init3DViewer({
    projectId: 'xxx',
    modelId: 'yyy',        // optionnel
    viewId: 'zzz',         // optionnel
  });
</script>
```

### 9.2 File Explorer embarqué

```javascript
const API = await TrimbleConnectWorkspace.connect(iframe, onEvent);
await API.embed.setTokens({ accessToken: 'xxx' });
await API.embed.initFileExplorer({
  projectId: 'xxx',
  folderId: 'yyy', // optionnel
});
```

### 9.3 Project List embarquée

```javascript
const API = await TrimbleConnectWorkspace.connect(iframe, onEvent);
await API.embed.setTokens({ accessToken: 'xxx' });
await API.embed.initProjectList({
  enableRegion: 'na',
  enableNewProject: true,
  enableCloneProject: true,
  enableLeaveProject: true,
  enableThumbnail: true,
  embedViewMode: 'list', // 'list' | 'grid'
});
```

### 9.4 Gestion des tokens (mode embarqué)

```javascript
// Définir les tokens (OBLIGATOIRE avant init)
await API.embed.setTokens({ accessToken: 'xxx' });

// Rafraîchir les tokens AVANT expiration
// Écouter l'événement 'extension.sessionInvalid' pour refresh
```

---

## 10. Manifestes d'extension

### 10.1 Manifest pour Extension Projet

```json
{
  "icon": "https://monapp.com/icon-48.png",
  "title": "Nom de l'Extension",
  "url": "https://monapp.com/index.html",
  "description": "Description visible dans les paramètres du projet",
  "configCommand": "open_settings",
  "enabled": true
}
```

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `title` | Oui | Titre affiché dans Paramètres > Extensions |
| `url` | Oui | URL de l'application web de l'extension |
| `icon` | Non | URL de l'icône (recommandé : 48x48 PNG, fond transparent) |
| `description` | Non | Description courte |
| `configCommand` | Non | Commande envoyée quand l'icône ⚙️ est cliquée |
| `enabled` | Non | `true` = visible immédiatement. Défaut: `false` |

### 10.2 Manifest pour Extension 3D Viewer

```json
{
  "url": "https://monapp.com/viewer-ext/index.html",
  "title": "Extension Viewer 3D",
  "icon": "https://monapp.com/icon.png",
  "infoUrl": "https://monapp.com/help.html"
}
```

### 10.3 Manifest avancé (multi-extensions)

```json
{
  "name": "Mon Pack d'Extensions",
  "version": "1.0.0",
  "api": "1.0",
  "extensions": [
    {
      "type": "projectModule",
      "id": "mon-dashboard",
      "title": "Dashboard",
      "icon": "https://monapp.com/icon.png",
      "url": "https://monapp.com/dashboard/index.html"
    },
    {
      "type": "viewerModule",
      "id": "mon-viewer-tool",
      "title": "Outil 3D",
      "icon": "https://monapp.com/icon-3d.png",
      "url": "https://monapp.com/viewer-tool/index.html"
    }
  ],
  "permissions": ["project.read", "files.read", "bcf.read", "views.read"],
  "dependencies": {
    "@trimble/connect-workspace-api": "^2.0.0"
  }
}
```

### 10.4 Installation d'une extension

1. Ouvrir un projet Trimble Connect
2. Aller dans **Paramètres** > **Extensions**
3. Cliquer **Ajouter une extension personnalisée**
4. Coller l'URL du manifest (ex: `https://monapp.com/manifest.json`)
5. L'extension apparaît — activer/désactiver via le toggle

> **CORS** : L'URL du manifest doit être accessible en CORS depuis `*.connect.trimble.com`

---

## 11. Régions et URLs de base

### Tableau récapitulatif complet

| Région | Location API | Core API Host (appXX) | BCF API Host (openXX) |
|--------|--------------|-----------------------|-----------------------|
| **US** | `northAmerica` / `us` | `app.connect.trimble.com` | `open11.connect.trimble.com` |
| **EU** | `europe` / `eu` | `app21.connect.trimble.com` | `open21.connect.trimble.com` |
| **APAC** | `asia` / `ap` | `app31.connect.trimble.com` | `open31.connect.trimble.com` |
| **AU** | `australia` / `ap-au` | `app32.connect.trimble.com` | `open32.connect.trimble.com` |

### Construction des URLs

```typescript
// Core API
const baseUrl = `https://${coreHost}/tc/api/2.0`;

// BCF API
const bcfUrl = `https://${bcfHost}/bcf/2.1/projects/${projectId}/topics`;
```

---

## 12. Backend Proxy — Architecture

### 12.1 Pourquoi un proxy ?

1. Les appels API depuis un iframe Trimble Connect sont bloqués par CORS
2. Le `client_secret` OAuth ne doit pas être exposé côté client
3. Permet de transformer/agréger les réponses API

### 12.2 Routes proxy recommandées

```javascript
// Express.js backend
const express = require('express');
const app = express();

// Middleware d'authentification
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  req.accessToken = token;
  req.region = req.headers['x-project-region'] || 'eu';
  next();
}

// Routes proxy
app.get('/api/projects/:projectId/todos', requireAuth, async (req, res) => {
  const url = `${getBaseUrl(req.region)}/todos?projectId=${req.params.projectId}`;
  const data = await fetch(url, { headers: { Authorization: `Bearer ${req.accessToken}` } });
  res.json(await data.json());
});

app.get('/api/projects/:projectId/views', requireAuth, /* ... */);
app.get('/api/projects/:projectId/files', requireAuth, /* ... */);
```

### 12.3 Routes proxy avancées — Patterns testés et fonctionnels (VÉRIFIÉ ✅)

```javascript
// ── Proxy fetch vers TC API ──
async function tcFetch(req, endpoint, options = {}) {
  const baseUrl = getCoreApiUrl(req.region); // ex: https://app21.connect.trimble.com/tc/api/2.0
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw { status: response.status, message: await response.text() };
  if (response.status === 204) return null;
  return response.json();
}

// ── Détails d'un fichier ──
app.get('/api/files/:fileId', requireAuth, async (req, res) => {
  const data = await tcFetch(req, `/files/${req.params.fileId}`);
  res.json(data);
});

// ── Nom d'un dossier ──
app.get('/api/folders/:folderId/name', requireAuth, async (req, res) => {
  const data = await tcFetch(req, `/folders/${req.params.folderId}`);
  res.json({ id: data.id, name: data.name });
});

// ── Déplacer un fichier (PATCH parentId) ──
app.post('/api/files/move', requireAuth, async (req, res) => {
  const { fileId, targetFolderId } = req.body;
  const result = await tcFetch(req, `/files/${fileId}`, {
    method: 'PATCH',
    body: { parentId: targetFolderId },
  });
  res.json(result);
});

// ── Résoudre versionId pour viewer URL ──
app.get('/api/files/:fileId/viewer-info', requireAuth, async (req, res) => {
  const { fileId } = req.params;
  const projectId = req.query.projectId;
  const data = await tcFetch(req, `/files/${fileId}`);
  const versionId = data.versionId || fileId;
  res.json({
    fileId, versionId, name: data.name,
    viewerUrl: `https://web.connect.trimble.com/projects/${projectId}/viewer/2D?id=${versionId}&version=${versionId}&type=revisions&etag=${versionId}`,
    source: 'file-metadata',
  });
});
app.get('/api/projects/:projectId/bcf/topics', requireAuth, /* ... */);
app.get('/api/projects/:projectId/views/:viewId/thumbnail', requireAuth, /* ... */);
```

### 12.3 CORS Configuration

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:8080',      // dev local
    'http://localhost:3000',      // dev local
    'https://monapp.github.io',  // GitHub Pages
    // Ajouter les origines autorisées
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Region'],
}));
```

### 12.4 Variables d'environnement

```env
# .env
ENVIRONMENT=production            # 'production' ou 'staging'
TRIMBLE_CLIENT_ID=votre_client_id
TRIMBLE_CLIENT_SECRET=votre_client_secret
TRIMBLE_REDIRECT_URI=https://votre-backend.vercel.app/callback
PORT=3000
FRONTEND_URL=https://votre-frontend.github.io
```

---

## 12.4 Patterns fonctionnels validés en production (VÉRIFIÉ ✅)

### Surveillance de dossier (FolderWatcher)

Le FolderWatcher surveille un dossier source TC via polling et détecte les nouveaux fichiers.

**Comportement recommandé :**
- `autoStartOnUpload = false` par défaut : les fichiers détectés sont ajoutés comme documents "En attente" sans démarrer automatiquement de workflow. L'utilisateur choisit manuellement quel workflow lancer depuis l'onglet Documents.
- `autoStartOnUpload = true` (optionnel) : le workflow démarre automatiquement dès qu'un fichier est détecté.

**Anti-doublons :**
- Le scan initial doit pré-charger les `fileId` des documents déjà dans le store pour ne pas les recréer.
- Avant de créer un document, vérifier si un document avec le même `fileId` existe déjà.

```typescript
// FolderWatcher - handleNewFile
const existingDoc = useDocumentStore.getState().documents.find(d => d.fileId === file.id);
if (existingDoc) return; // déjà suivi
```

### Persistance des suppressions

La suppression de documents doit appeler le backend (Turso) en plus de la mise à jour en mémoire :
```typescript
removeDocuments(ids); // store en mémoire
for (const id of ids) {
  deleteValidationDocument(id).catch(console.warn); // persist backend
}
```

### Mise à jour de l'emplacement après déplacement

Quand un fichier est déplacé (action `move_file` dans un workflow), le `filePath` du document doit être mis à jour avec le nouveau path retourné par l'API TC :
```typescript
if (action.type === 'move_file' && result.success && result.data) {
  const movedFile = result.data as { path?: string; parentId?: string };
  if (movedFile.path) {
    useDocumentStore.getState().updateDocument(documentId, { filePath: movedFile.path });
  }
}
```

### Panel Visas — UX recommandée

- **Visas en attente** : tuiles complètes avec formulaire de décision, bordure gauche ambre, badge statut avec effet de clignotement pour attirer l'attention.
- **Visas traités** : tuiles compactes (une ligne) avec bordure gauche colorée selon la décision, sans formulaire. Affiche le nom du fichier, la date du visa et la décision.

---

## 13. Déploiement

### 13.1 Frontend — GitHub Pages

```bash
# Structure public/
public/
  index.html          # Page principale (chargée par TC)
  manifest.json       # Manifest d'extension
  dist/
    index.js          # Bundle webpack
  icon-48.png         # Icône de l'extension

# Push sur GitHub
git add -A && git commit -m "deploy" && git push origin main

# Activer GitHub Pages : Settings > Pages > Source: main / root ou /public
```

### 13.2 Backend — Vercel Serverless

```json
// vercel.json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "api/index.js" }
  ]
}
```

```bash
# Déployer
npx vercel --prod --yes
```

### 13.3 Frontend — `index.html` type

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mon Extension TC</title>
  <!-- Workspace API SDK -->
  <script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>
  <!-- Extension API (legacy, encore nécessaire pour certaines fonctions) -->
  <script src="https://app.connect.trimble.com/tc/static/5.0.0/tcw-extension-api.js"></script>
</head>
<body>
  <div id="app"></div>
  <script>
    window.BACKEND_URL = 'https://votre-backend.vercel.app';
  </script>
  <script src="dist/index.js"></script>
</body>
</html>
```

---

## 14. Structure de projet recommandée

```
mon-extension-tc/
├── api/
│   └── index.js              # Backend proxy (Vercel serverless)
├── public/
│   ├── index.html             # Page chargée par TC (CDN scripts)
│   ├── index-local.html       # Page de test local
│   ├── manifest.json          # Manifest d'extension
│   ├── icon-48.png            # Icône extension (48x48, fond transparent)
│   ├── icon-white-48.png      # Icône blanche (pour sidebar sombre)
│   └── dist/
│       └── index.js           # Bundle copié pour GitHub Pages
├── src/
│   ├── index.ts               # Point d'entrée frontend
│   ├── api/
│   │   ├── workspaceAPIAdapter.ts  # Adaptateur Workspace API → backend
│   │   ├── authService.ts          # Service d'authentification
│   │   └── [service]Service.ts     # Services par domaine (files, views, etc.)
│   ├── models/
│   │   └── types.ts           # Interfaces TypeScript
│   ├── ui/
│   │   ├── styles.css         # Styles
│   │   └── [components].ts    # Composants UI
│   └── utils/
│       ├── logger.ts          # Logging
│       └── errorHandler.ts    # Gestion d'erreurs
├── dist/                      # Build output (webpack)
├── .env.example               # Variables d'environnement template
├── package.json
├── tsconfig.json
├── webpack.config.js          # ou vite.config.ts
├── vercel.json                # Config Vercel
└── README.md
```

### Webpack config type

```javascript
// webpack.config.js
module.exports = {
  entry: './src/index.ts',
  output: { filename: 'index.js', path: path.resolve(__dirname, 'dist') },
  resolve: { extensions: ['.ts', '.js'] },
  externals: { 'trimble-connect-workspace-api': 'TrimbleConnectWorkspace' },
  module: {
    rules: [
      { test: /\.ts$/, use: 'ts-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
};
```

> **Important** : Le Workspace API est chargé via CDN dans `index.html` et déclaré comme `external` dans webpack. Ne PAS le bundler.

---

## 15. Système de conception — Modus 2.0 & shadcn/ui

> **OBLIGATOIRE** : Toutes les extensions Trimble Connect doivent utiliser une combinaison de **Modus 2.0** (design system officiel Trimble) et **shadcn/ui** (blocks et composants avancés) pour construire leurs interfaces utilisateur. L'agent IA doit systématiquement proposer les composants et blocks disponibles à l'utilisateur avant de les implémenter.

### 15.1 Stratégie UI : Modus 2.0 + shadcn/ui

Les deux bibliothèques se complètent et doivent être utilisées ensemble :

| Bibliothèque | Rôle | Quand l'utiliser |
|--------------|------|------------------|
| **Modus 2.0** | Design system Trimble officiel — identité visuelle, tokens, composants de base | Composants standards (boutons, inputs, navbar, tables, modals, toasts...), respect de la charte graphique Trimble |
| **shadcn/ui** | Blocks et composants avancés — layouts, dashboards, pages complexes | Structures de pages (sidebars, dashboards, login pages...), composants riches (data tables avancées, charts, command palette, combobox...) |

**Règle de priorité :**
1. Si le composant existe dans **Modus 2.0** → l'utiliser en priorité (cohérence Trimble)
2. Si le composant n'existe pas dans Modus ou si un **block/layout shadcn** est plus adapté → utiliser **shadcn/ui**
3. Pour les **layouts de pages et dashboards** → utiliser les **blocks shadcn/ui** comme base structurelle, habillés avec les composants Modus
4. Ne **JAMAIS** coder un composant from scratch si une version existe dans Modus 2.0 ou shadcn/ui

---

### 15.2 Modus 2.0 — Design System Trimble

**Modus 2.0** est le design system unifié de Trimble, disponible sur : https://modus.trimble.com/

Il comprend :
- **12 Fondations** : Design tokens, typographie, couleurs, espacements, effets, breakpoints responsifs
- **66 Composants** : Composants UI accessibles avec documentation complète (styling, accessibilité, cas d'usage)
- **31 Patterns** : Patterns de conception éprouvés et bonnes pratiques pour les challenges UI courants
- **7 Templates** : Layouts de pages pré-construits pour accélérer le développement

Chaque composant inclut une documentation détaillée sur :
- **Styling** : Guidelines de personnalisation et intégration Tailwind CSS
- **Accessibilité** : Conformité WCAG 2.1 AA, navigation clavier, support lecteurs d'écran
- **Cas d'usage** : Exemples concrets et bonnes pratiques d'implémentation

#### Bibliothèques de composants Modus (npm)

| Framework | Package npm | Installation |
|-----------|-------------|-------------|
| **React** | `@trimble-oss/moduswebcomponents-react` | `npm install @trimble-oss/moduswebcomponents-react` |
| **Angular** | `@trimble-oss/moduswebcomponents-angular` | `npm install @trimble-oss/moduswebcomponents-angular` |
| **Vue** | `@trimble-oss/moduswebcomponents-vue` | `npm install @trimble-oss/moduswebcomponents-vue` |
| **Web Components** (vanilla, Svelte, SolidJS) | `@trimble-oss/moduswebcomponents` | `npm install @trimble-oss/moduswebcomponents` |

#### Exemple — Web Components (vanilla TypeScript)

```bash
npm install @trimble-oss/moduswebcomponents
```

```typescript
import '@trimble-oss/moduswebcomponents';

document.getElementById('app')!.innerHTML = `
  <modus-navbar show-search="true" product-name="Mon Extension"></modus-navbar>
  <div class="content">
    <modus-card>
      <modus-text-input label="Recherche" placeholder="Chercher..."></modus-text-input>
      <modus-button color="primary">Valider</modus-button>
    </modus-card>
    <modus-data-table
      columns='[{"header":"Nom","accessorKey":"name"},{"header":"Statut","accessorKey":"status"}]'
      data='[{"name":"Item 1","status":"Actif"}]'>
    </modus-data-table>
  </div>
`;
```

#### Exemple — React

```bash
npm install @trimble-oss/moduswebcomponents-react
```

```tsx
import {
  ModusNavbar, ModusButton, ModusCard, ModusDataTable,
  ModusTextInput, ModusToast, ModusModal, ModusSideNavigation,
  ModusBadge, ModusChip, ModusAlert
} from '@trimble-oss/moduswebcomponents-react';

function MyExtension() {
  return (
    <>
      <ModusNavbar productName="Mon Extension" showSearch />
      <ModusCard>
        <ModusTextInput label="Recherche" placeholder="Chercher..." />
        <ModusButton color="primary" onClick={handleClick}>Valider</ModusButton>
      </ModusCard>
      <ModusDataTable columns={columns} data={data} />
    </>
  );
}
```

#### Catalogue des composants Modus utiles pour extensions TC

| Composant | Utilisation |
|-----------|------------|
| `modus-navbar` | Barre de navigation de l'extension |
| `modus-side-navigation` | Navigation latérale (menus, sous-menus) |
| `modus-card` | Conteneur de contenu (tuiles, fiches) |
| `modus-data-table` | Tableaux de données (fichiers, BCF topics, notes) |
| `modus-button` | Boutons d'action |
| `modus-text-input` | Champs de saisie |
| `modus-select` | Listes déroulantes |
| `modus-modal` | Fenêtres modales |
| `modus-toast` | Notifications toast |
| `modus-alert` | Alertes contextuelles |
| `modus-badge` | Badges de statut |
| `modus-chip` | Tags et labels |
| `modus-tabs` | Navigation par onglets |
| `modus-accordion` | Sections dépliables |
| `modus-progress-bar` | Indicateurs de progression |
| `modus-spinner` | Indicateurs de chargement |
| `modus-tooltip` | Infobulles |
| `modus-switch` | Toggles on/off |
| `modus-checkbox` | Cases à cocher |
| `modus-date-picker` | Sélecteur de dates |
| `modus-pagination` | Navigation paginée |
| `modus-breadcrumb` | Fil d'Ariane |
| `modus-tree-view` | Arborescence (fichiers, hiérarchie IFC) |

#### Design Tokens Trimble

```css
/* Couleurs principales Trimble */
--modus-primary: #0063a3;        /* Trimble Blue */
--modus-secondary: #6a6e79;
--modus-success: #1e8a44;
--modus-danger: #da212c;
--modus-warning: #e49325;
/* Typographie */
--modus-font-family: 'Open Sans', sans-serif;
```

Les composants Modus supportent le **mode sombre** et le **mode clair** nativement.

---

### 15.3 shadcn/ui — Blocks & Composants avancés

**shadcn/ui** est une bibliothèque de composants et de **blocks** (pages pré-construites) open source pour React, disponible sur : https://ui.shadcn.com/

> **shadcn/ui n'est PAS un package npm classique** — c'est un système de copier/coller de composants dans votre projet. On installe via CLI `npx shadcn add <composant>` et le code source est ajouté directement dans `components/ui/`.

#### Installation

```bash
# Initialiser shadcn/ui dans un projet React
npx shadcn@latest init

# Ajouter des composants individuels
npx shadcn add button
npx shadcn add card
npx shadcn add data-table
npx shadcn add sidebar
npx shadcn add dialog

# Ajouter un block complet (page pré-construite)
npx shadcn add dashboard-01
npx shadcn add sidebar-07
npx shadcn add login-03
```

#### Blocks shadcn/ui — Pages pré-construites

Les **blocks** sont des pages/layouts complets prêts à l'emploi. L'agent IA doit **systématiquement proposer les blocks pertinents** à l'utilisateur avant de construire une page.

**URL de référence : https://ui.shadcn.com/blocks**

| Block | Commande | Description |
|-------|----------|-------------|
| `dashboard-01` | `npx shadcn add dashboard-01` | Dashboard avec sidebar, charts et data table |
| `dashboard-02` à `dashboard-07` | `npx shadcn add dashboard-0X` | Variantes de dashboards |
| `sidebar-01` à `sidebar-15` | `npx shadcn add sidebar-0X` | Sidebars (collapsible, icons, submenus, floating...) |
| `login-01` à `login-05` | `npx shadcn add login-0X` | Pages de connexion (simple, avec image, split...) |
| `authentication-01` à `authentication-04` | `npx shadcn add authentication-0X` | Pages d'authentification |

> **L'agent doit consulter** https://ui.shadcn.com/blocks **et proposer les options visuelles à l'utilisateur** avant d'implémenter.

#### Composants shadcn/ui — Catalogue complet

**URL de référence : https://ui.shadcn.com/docs/components**

| Catégorie | Composants disponibles |
|-----------|----------------------|
| **Layout** | Card, Separator, Resizable, Scroll Area, Collapsible, Sidebar, Sheet, Drawer |
| **Navigation** | Breadcrumb, Navigation Menu, Menubar, Tabs, Pagination, Command (palette) |
| **Formulaires** | Button, Button Group, Input, Input Group, Input OTP, Textarea, Select, Native Select, Checkbox, Radio Group, Switch, Slider, Date Picker, Combobox, Field |
| **Data Display** | Table, Data Table, Badge, Avatar, Aspect Ratio, Calendar, Chart, Carousel, Typography, Empty, Kbd |
| **Feedback** | Alert, Alert Dialog, Dialog, Toast (Sonner), Progress, Spinner, Skeleton, Tooltip |
| **Overlay** | Popover, Hover Card, Dropdown Menu, Context Menu, Toggle, Toggle Group |

> **L'agent doit consulter** https://ui.shadcn.com/docs/components **et lister les composants pertinents à l'utilisateur** en lui demandant ses préférences.

#### shadcn/ui avec MCP Server (pour Cursor / Agent IA)

shadcn/ui fournit un endpoint `llms.txt` et un MCP server pour que les agents IA accèdent à la documentation :

```json
{
  "mcpServers": {
    "shadcn-ui": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-shadcn"]
    }
  }
}
```

> **Note** : Si ce MCP server n'est pas disponible, l'agent IA doit consulter directement https://ui.shadcn.com/docs/components et https://ui.shadcn.com/blocks via web fetch.

---

### 15.4 Combinaison Modus 2.0 + shadcn/ui — Guide pratique

#### Comment combiner les deux systèmes

```
┌─────────────────────────────────────────────────────────────┐
│  STRUCTURE DE PAGE ← shadcn/ui blocks (layout, sidebar)     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NAVBAR ← Modus 2.0 (modus-navbar)                   │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  SIDEBAR        │  CONTENU PRINCIPAL                  │  │
│  │  ← shadcn/ui    │  ┌─────────┐ ┌─────────┐          │  │
│  │  (sidebar-07)   │  │ CARD    │ │ CARD    │          │  │
│  │                 │  │ ←Modus  │ │ ←Modus  │          │  │
│  │  Navigation     │  └─────────┘ └─────────┘          │  │
│  │  items ← Modus  │  ┌───────────────────────┐         │  │
│  │  (modus-side-   │  │ DATA TABLE            │         │  │
│  │  navigation)    │  │ ← shadcn/ui OU Modus  │         │  │
│  │                 │  └───────────────────────┘         │  │
│  │  Badges/chips   │  CHARTS ← shadcn/ui (Chart)       │  │
│  │  ← Modus        │  TOASTS ← Modus (modus-toast)     │  │
│  └─────────────────┴────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### Tableau de décision : Modus vs shadcn/ui

| Besoin | Utiliser | Pourquoi |
|--------|----------|----------|
| Bouton, input, select | **Modus 2.0** | Charte Trimble, tokens intégrés |
| Navbar, barre de navigation | **Modus 2.0** | Cohérence avec les autres apps Trimble |
| Toast, alert, modal | **Modus 2.0** | Comportement standardisé Trimble |
| Badge, chip, tag | **Modus 2.0** | Design tokens Trimble |
| Data table simple | **Modus 2.0** | `modus-data-table` suffit |
| Data table avancée (tri, filtre, pagination, colonnes) | **shadcn/ui** | Data Table shadcn est plus puissant |
| Layout dashboard complet | **shadcn/ui block** | `dashboard-01` à `dashboard-07` |
| Sidebar collapsible | **shadcn/ui block** | `sidebar-07` (collapse to icons) |
| Page de login | **shadcn/ui block** | `login-03` ou `login-04` |
| Charts / graphiques | **shadcn/ui** | Composant Chart intégré (Recharts) |
| Command palette (Ctrl+K) | **shadcn/ui** | `Command` — pas d'équivalent Modus |
| Combobox / autocomplete | **shadcn/ui** | `Combobox` — plus avancé que le select Modus |
| Arborescence fichiers | **Modus 2.0** | `modus-tree-view` spécialisé |
| Drag & drop, resizable panels | **shadcn/ui** | `Resizable` — pas d'équivalent Modus |
| Date picker avancé | **shadcn/ui** | `Date Picker` + `Calendar` plus complets |
| Skeleton loading | **shadcn/ui** | `Skeleton` — animations de chargement |

---

### 15.5 Ressources Design System

#### Modus 2.0

| Ressource | URL |
|-----------|-----|
| **Modus 2.0 Blueprint** | https://modus.trimble.com/ |
| **Storybook (démo interactive)** | https://trimble-oss.github.io/modus-wc-2.0/main/ |
| **GitHub Repository** | https://github.com/trimble-oss/modus-wc-2.0 |
| **npm — Web Components** | https://www.npmjs.com/package/@trimble-oss/moduswebcomponents |
| **npm — React** | https://www.npmjs.com/package/@trimble-oss/moduswebcomponents-react |
| **npm — Angular** | https://www.npmjs.com/package/@trimble-oss/moduswebcomponents-angular |
| **npm — Vue** | https://www.npmjs.com/package/@trimble-oss/moduswebcomponents-vue |
| **Figma — Components** | https://www.figma.com/design/y9H5ucQKBjzI8JLuVrGcb3/Modus-2.0---Atomic-Design-System |
| **Figma — Icons** | https://www.figma.com/design/HwQ5WZ4ym120kyG7ZbIpRI/Modus-2.0---Icons |
| **Figma — Palette** | https://www.figma.com/design/8cC4pBV66t4yBou2FUNGxN/Modus-2.0---Palette |
| **Modus 1.0 (legacy)** | https://modus-v1.trimble.com |

#### shadcn/ui

| Ressource | URL |
|-----------|-----|
| **Documentation** | https://ui.shadcn.com/docs |
| **Composants** | https://ui.shadcn.com/docs/components |
| **Blocks (pages pré-construites)** | https://ui.shadcn.com/blocks |
| **Charts** | https://ui.shadcn.com/charts |
| **Themes** | https://ui.shadcn.com/themes |
| **GitHub Repository** | https://github.com/shadcn-ui/ui |
| **Figma** | https://ui.shadcn.com/docs/figma |

### 15.6 MCP Servers pour Agent IA (Cursor)

Pour permettre à l'agent IA de consulter la documentation de ces design systems en temps réel, configurer les MCP servers suivants dans Cursor :

```json
{
  "mcpServers": {
    "modus-docs": {
      "command": "npx",
      "args": ["-y", "@julianoczkowski/mcp-modus"]
    }
  }
}
```

Ces serveurs MCP permettent à l'agent IA de :
- Consulter la documentation des composants Modus 2.0 et shadcn/ui en temps réel
- Obtenir les exemples de code, les props et les propriétés de chaque composant
- Vérifier les guidelines d'accessibilité et de styling
- Accéder aux patterns, templates et blocks recommandés
- **Proposer les choix visuels à l'utilisateur** avant implémentation

---

## 16. Workflow Agent IA — Guide de développement interactif

> **SECTION CRITIQUE** : Cette section définit le comportement attendu de l'agent IA lors du développement d'extensions Trimble Connect. L'agent DOIT suivre ce workflow pour garantir la meilleure expérience de développement.

### 16.1 Principe fondamental

L'agent IA ne doit **JAMAIS** implémenter un composant UI sans avoir d'abord :
1. **Identifié** les composants Modus 2.0 et/ou shadcn/ui pertinents
2. **Proposé** les options visuelles à l'utilisateur (avec liens vers la documentation)
3. **Attendu** la validation de l'utilisateur sur les choix de composants

### 16.2 Workflow de création d'un composant UI

```
┌──────────────────────────────────────────────────────┐
│  1. ANALYSE — L'utilisateur demande une fonctionnalité UI  │
│     → L'agent identifie les éléments UI nécessaires         │
├──────────────────────────────────────────────────────┤
│  2. RECHERCHE — L'agent consulte :                          │
│     → Modus 2.0 (Storybook + MCP server)                   │
│     → shadcn/ui (composants + blocks)                       │
│     → Identifie les composants pertinents dans CHAQUE lib   │
├──────────────────────────────────────────────────────┤
│  3. PROPOSITION — L'agent présente à l'utilisateur :        │
│     → "Pour cette fonctionnalité, voici les options :"      │
│     → Option A : composant Modus (lien Storybook)           │
│     → Option B : composant shadcn (lien docs)               │
│     → Option C : block shadcn (lien preview)                │
│     → Recommandation de l'agent + justification             │
├──────────────────────────────────────────────────────┤
│  4. VALIDATION — L'utilisateur choisit                      │
│     → L'agent procède à l'implémentation                    │
├──────────────────────────────────────────────────────┤
│  5. IMPLÉMENTATION — L'agent code le composant              │
│     → Avec le design system choisi                          │
│     → En respectant les patterns et bonnes pratiques        │
└──────────────────────────────────────────────────────┘
```

### 16.3 Exemples de propositions que l'agent doit faire

#### Exemple 1 : L'utilisateur demande "Crée un tableau de données pour les fichiers"

L'agent doit répondre :

> **Pour le tableau de données des fichiers, voici les options :**
>
> | Option | Bibliothèque | Composant | Caractéristiques |
> |--------|-------------|-----------|-----------------|
> | **A** | Modus 2.0 | `modus-data-table` | Simple, conforme Trimble, tri basique |
> | **B** | shadcn/ui | `Data Table` | Avancé (tri multi-colonnes, filtres, pagination, colonnes resizables, sélection de lignes) |
>
> **Ma recommandation** : Option B (shadcn Data Table) car vous aurez besoin de filtrage et pagination pour une liste de fichiers potentiellement longue.
>
> Quel option préférez-vous ?

#### Exemple 2 : L'utilisateur demande "Crée une page dashboard"

L'agent doit répondre :

> **Pour le layout du dashboard, voici les blocks shadcn/ui disponibles :**
>
> | Block | Description | Aperçu |
> |-------|-------------|--------|
> | `dashboard-01` | Dashboard avec sidebar, charts et data table | https://ui.shadcn.com/blocks#dashboard-01 |
> | `dashboard-02` | Dashboard avec cards métriques et graphiques | https://ui.shadcn.com/blocks#dashboard-02 |
> | `dashboard-03` | Dashboard compact avec sidebar | https://ui.shadcn.com/blocks#dashboard-03 |
>
> **Pour les composants individuels du dashboard :**
>
> | Élément | Modus 2.0 | shadcn/ui | Recommandation |
> |---------|-----------|-----------|----------------|
> | Cards métriques | `modus-card` | `Card` | Modus (identité Trimble) |
> | Graphiques | — | `Chart` (Recharts) | shadcn (seule option) |
> | Tableau de données | `modus-data-table` | `Data Table` | shadcn (si filtrage nécessaire) |
> | Boutons d'action | `modus-button` | `Button` | Modus (identité Trimble) |
> | Notifications | `modus-toast` | `Sonner` | Modus (identité Trimble) |
>
> Quel block de base souhaitez-vous ? Et pour chaque composant, préférez-vous Modus ou shadcn ?

#### Exemple 3 : L'utilisateur demande "Ajoute une sidebar de navigation"

L'agent doit répondre :

> **Pour la sidebar, voici les options :**
>
> | Option | Bibliothèque | Composant | Caractéristiques |
> |--------|-------------|-----------|-----------------|
> | **A** | Modus 2.0 | `modus-side-navigation` | Navigation Trimble standard, items avec icônes |
> | **B** | shadcn/ui | `sidebar-07` (block) | Sidebar collapsible vers icônes, responsive, avec user menu |
> | **C** | shadcn/ui | `sidebar-03` (block) | Sidebar avec sous-menus imbriqués |
> | **D** | shadcn/ui | `sidebar-10` (block) | Sidebar flottante |
>
> **Aperçu des blocks** : https://ui.shadcn.com/blocks (section Sidebar)
>
> **Ma recommandation** : Option B (sidebar-07) car elle offre le collapse vers icônes qui est plus adapté pour les extensions dans l'iframe Trimble Connect (espace limité).
>
> Quel option préférez-vous ?

### 16.4 Checklist de l'agent IA avant chaque implémentation UI

Avant de coder, l'agent IA doit vérifier :

- [ ] **Composants identifiés** — J'ai listé tous les composants UI nécessaires pour cette fonctionnalité
- [ ] **Modus consulté** — J'ai vérifié quels composants existent dans Modus 2.0 (via MCP server ou Storybook)
- [ ] **shadcn consulté** — J'ai vérifié quels composants et blocks existent dans shadcn/ui
- [ ] **Options présentées** — J'ai présenté les options avec liens vers la documentation
- [ ] **Recommandation faite** — J'ai donné ma recommandation avec justification
- [ ] **Validation obtenue** — L'utilisateur a validé ses choix
- [ ] **Accessibilité vérifiée** — Les composants choisis respectent WCAG 2.1 AA
- [ ] **Mode sombre/clair** — Les composants fonctionnent dans les deux modes

### 16.5 Règles de comportement de l'agent IA

1. **TOUJOURS proposer avant d'implémenter** — Ne jamais choisir un composant à la place de l'utilisateur sans lui présenter les options
2. **TOUJOURS fournir des liens** — Chaque proposition doit inclure un lien vers la doc/preview du composant
3. **TOUJOURS justifier la recommandation** — Expliquer pourquoi un composant est recommandé plutôt qu'un autre
4. **Regrouper les décisions** — Quand plusieurs composants sont nécessaires, les présenter tous dans un seul message structuré
5. **Consulter le MCP Modus** — Utiliser le MCP server pour obtenir les détails des composants en temps réel
6. **Consulter shadcn/ui docs** — Accéder à https://ui.shadcn.com/docs/components pour les détails shadcn
7. **Garder un historique** — Mémoriser les choix de l'utilisateur pour les réutiliser dans le même projet (ex: si l'utilisateur a choisi Modus pour les boutons, ne pas redemander)
8. **Proposer des améliorations** — Si l'agent identifie un composant ou pattern qui améliorerait l'UX, le proposer proactivement
9. **Respecter la taille du bundle** — Privilégier les imports sélectifs et le tree-shaking
10. **Tester visuellement** — Après implémentation, proposer de vérifier le rendu dans le navigateur

### 16.6 Workflow complet de développement d'extension

```
 PHASE 1 — CADRAGE
 ─────────────────
 1. Lire ce PRD en entier
 2. Comprendre le type d'extension demandée (Projet / Viewer 3D / Embedded)
 3. Identifier les API Trimble nécessaires (Core, BCF, Viewer)
 4. Créer le squelette du projet (section 14)

 PHASE 2 — ARCHITECTURE
 ──────────────────────
 5. Configurer l'authentification (section 4)
 6. Mettre en place le backend proxy (section 12)
 7. Configurer le Workspace API (section 5)
 8. Installer Modus 2.0 + shadcn/ui (section 15)

 PHASE 3 — UI/UX (INTERACTIF)
 ────────────────────────────
 9.  Pour CHAQUE page/vue de l'extension :
     a. Identifier les composants UI nécessaires
     b. Consulter Modus 2.0 (MCP/Storybook) et shadcn/ui (docs/blocks)
     c. PROPOSER les options à l'utilisateur (voir exemples 16.3)
     d. ATTENDRE la validation
     e. Implémenter les composants choisis
     f. Vérifier le rendu visuel

 PHASE 4 — INTÉGRATION
 ────────────────────
 10. Connecter le frontend aux API via le backend proxy
 11. Implémenter la logique métier
 12. Tester dans Trimble Connect (manifest, iframe)

 PHASE 5 — FINALISATION
 ─────────────────────
 13. Optimiser le bundle (taille < 500KB)
 14. Tester en mode sombre et clair
 15. Vérifier l'accessibilité
 16. Déployer (section 13)
```

---

## 17. Gestion des erreurs et bonnes pratiques

### Pattern de retry avec fallback

```typescript
async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // backoff
    }
  }
  throw new Error('Max retries reached');
}
```

### Gestion du token refresh

```typescript
// Le token expire typiquement après 1h
// Mode intégré : le refresh est automatique via l'événement
// Mode standalone : implémenter le refresh dans le backend proxy

function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - 5 * 60 * 1000; // 5 min avant expiration
}
```

### Bonnes pratiques

1. **Design System Modus 2.0 + shadcn/ui** : **Obligatoire** — utiliser les composants Modus et/ou shadcn/ui, toujours proposer les options à l'utilisateur (voir [Section 15](#15-système-de-conception--modus-20--shadcnui) et [Section 16](#16-workflow-agent-ia--guide-de-développement-interactif))
2. **Taille du bundle** : Garder le JS < 500KB (chargé dans un iframe)
3. **Pas de localStorage sensible** : L'iframe peut être dans un contexte tiers
4. **Graceful degradation** : Gérer le cas où le Workspace API ne se connecte pas
5. **Timeout de connexion** : Utiliser le 3ème paramètre de `connect()` (30000ms recommandé)
6. **Icône** : PNG 48x48 avec fond transparent, version blanche pour le sidebar sombre
7. **CORS manifest** : Le fichier manifest doit être accessible en CORS
8. **Régions** : Toujours utiliser la bonne URL de base selon la région du projet
9. **BCF** : Les URLs BCF (`openXX`) sont DIFFÉRENTES des URLs Core API (`appXX`)

---

## 18. Exemples de code

### 18.1 Squelette d'extension projet

```typescript
import * as WorkspaceAPI from 'trimble-connect-workspace-api';

class MyExtension {
  private api: any;
  private accessToken: string | null = null;
  private projectId: string | null = null;
  private projectRegion: string = 'eu';

  async initialize() {
    // Connexion au Workspace API
    this.api = await WorkspaceAPI.connect(window.parent, this.onEvent.bind(this), 30000);

    // Récupérer les infos du projet
    const project = await this.api.project.getCurrentProject();
    this.projectId = project.id;
    this.projectRegion = project.location;

    // Demander le token
    const token = await this.api.extension.requestPermission('accesstoken');
    if (token !== 'pending' && token !== 'denied') {
      this.accessToken = token;
      this.start();
    }

    // Définir le menu
    this.api.ui.setMenu({
      title: 'Mon Extension',
      icon: 'https://monapp.com/icon.png',
      command: 'main',
      subMenus: [
        { title: 'Vue 1', command: 'view_1' },
        { title: 'Vue 2', command: 'view_2' },
      ],
    });
  }

  private onEvent(event: string, data: any) {
    switch (event) {
      case 'extension.accessToken':
        this.accessToken = data;
        if (!this.projectId) return;
        this.start();
        break;
      case 'extension.command':
        this.handleCommand(data);
        break;
    }
  }

  private handleCommand(command: string) {
    switch (command) {
      case 'view_1': /* afficher vue 1 */ break;
      case 'view_2': /* afficher vue 2 */ break;
    }
  }

  private async start() {
    // L'extension est prête — charger les données
    const response = await fetch(`${BACKEND_URL}/api/projects/${this.projectId}/data`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'X-Project-Region': this.projectRegion,
      },
    });
    const data = await response.json();
    this.render(data);
  }

  private render(data: any) {
    document.getElementById('app')!.innerHTML = `<h1>Mon Extension</h1>`;
  }
}

new MyExtension().initialize();
```

### 18.2 Squelette d'extension 3D Viewer

```typescript
import * as WorkspaceAPI from 'trimble-connect-workspace-api';

class My3DExtension {
  private api: any;

  async initialize() {
    this.api = await WorkspaceAPI.connect(window.parent, this.onEvent.bind(this), 30000);

    const project = await this.api.project.getCurrentProject();
    const token = await this.api.extension.requestPermission('accesstoken');
    
    if (token !== 'pending' && token !== 'denied') {
      this.start();
    }
  }

  private onEvent(event: string, data: any) {
    switch (event) {
      case 'extension.accessToken':
        this.start();
        break;
      case 'viewer.selectionChanged':
        this.onSelectionChanged(data);
        break;
      case 'viewer.modelLoaded':
        this.onModelLoaded(data);
        break;
    }
  }

  private async start() {
    // Lister les modèles chargés
    const models = await this.api.viewer.getModels('loaded');
    console.log('Modèles chargés:', models);

    // Ajouter un marqueur 3D
    await this.api.viewer.addIcon({
      position: { x: 0, y: 0, z: 10 },
      icon: 'https://monapp.com/marker.png',
      id: 'marker-1',
    });
  }

  private async onSelectionChanged(selection: any) {
    if (!selection || !selection.length) return;
    
    const { modelId, objectRuntimeIds } = selection[0];
    const props = await this.api.viewer.getObjectProperties(modelId, objectRuntimeIds);
    
    // Afficher les propriétés dans le panneau de l'extension
    this.renderProperties(props);
  }

  private async onModelLoaded(model: any) {
    console.log('Modèle chargé:', model);
  }

  private renderProperties(props: any[]) {
    const html = props.map(p => `<div>${p.name}: ${JSON.stringify(p.properties)}</div>`).join('');
    document.getElementById('app')!.innerHTML = html;
  }
}

new My3DExtension().initialize();
```

---

## 19. Ressources et documentation officielle

### Documentation

| Ressource | URL |
|-----------|-----|
| **Workspace API — Docs** | https://components.connect.trimble.com/trimble-connect-workspace-api/index.html |
| **Workspace API — Référence** | https://components.connect.trimble.com/trimble-connect-workspace-api/interfaces/WorkspaceAPI.html |
| **Workspace API — Exemples** | https://components.connect.trimble.com/trimble-connect-workspace-api/examples/index.html |
| **Workspace API — npm** | https://www.npmjs.com/package/trimble-connect-workspace-api |
| **Core API — Docs** | https://developer.trimble.com/docs/connect/core |
| **BCF Topics — Swagger** | https://app.swaggerhub.com/apis/Trimble-Connect/topic/v2 |
| **Authentification** | https://developer.trimble.com/docs/authentication |
| **Modus 2.0 — Design System** | https://modus.trimble.com/ |
| **Modus 2.0 — Storybook** | https://trimble-oss.github.io/modus-wc-2.0/main/ |
| **Modus 2.0 — GitHub** | https://github.com/trimble-oss/modus-wc-2.0 |
| **shadcn/ui — Composants** | https://ui.shadcn.com/docs/components |
| **shadcn/ui — Blocks** | https://ui.shadcn.com/blocks |
| **shadcn/ui — Charts** | https://ui.shadcn.com/charts |
| **Developer Portal** | https://developer.trimble.com/ |
| **Trimble Connect App** | https://app.connect.trimble.com/ |
| **Régions API** | https://app.connect.trimble.com/tc/api/2.0/regions |

### Scripts CDN

```html
<!-- Workspace API SDK (OBLIGATOIRE) -->
<script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>

<!-- Extension API legacy (recommandé pour compatibilité) -->
<script src="https://app.connect.trimble.com/tc/static/5.0.0/tcw-extension-api.js"></script>

<!-- URL d'embed pour composants embarqués -->
<!-- https://web.connect.trimble.com/?isEmbedded=true -->
```

### Support

- Email : connect-support@trimble.com
- Documentation développeur : https://developer.trimble.com/

---

## Annexe A — Interfaces TypeScript de référence

```typescript
// Projet Trimble Connect
interface ConnectProject {
  id: string;
  name: string;
  location: string;   // 'europe' | 'northAmerica' | 'asia' | 'australia'
  rootId: string;      // ID du dossier racine
}

// Fichier
interface ProjectFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  lastModified: Date;
  downloadUrl?: string;
  path: string;
}

// Vue 3D
interface ProjectView {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  thumbnail?: string;
  isDefault: boolean;
}

// Topic BCF
interface BCFTopic {
  id: string;
  title: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'Low' | 'Medium' | 'High';
  assignedTo?: string;
  createdBy: string;
  createdAt: Date;
  modifiedAt: Date;
  dueDate?: Date;
  labels?: string[];
}

// Note / Todo
interface TrimbleNote {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
  projectId: string;
}

// Caméra 3D
interface Camera {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}
```

---

## 20. Retour d'expérience — Patterns validés pour Extension Viewer 3D (React + Vite)

> **Section ajoutée après le développement d'une extension Viewer 3D réelle** (Navigateur & Validateur IDS).
> Contient les patterns concrets, les pièges rencontrés et les solutions éprouvées.

### 20.1 Stack validée pour extension 3D Viewer

| Couche | Choix | Version | Justification |
|--------|-------|---------|---------------|
| Framework | React | 19.x | Écosystème riche, lazy loading natif, Error Boundary |
| Build | Vite | 6.x | Build rapide, HMR fiable, configuration simple |
| CSS | Tailwind CSS | 4.x | Utility-first, mode sombre natif, tokens Modus intégrables via CSS variables |
| Charts | recharts | 2.x | Composant Chart recommandé par shadcn/ui, bon tree-shaking |
| Export PDF | jsPDF + html2canvas | 4.x / 1.4.x | Fonctionne dans l'iframe TC, pas de dépendance serveur |
| Icônes | lucide-react | 0.4x | Tree-shakeable, cohérent avec shadcn/ui |
| Types | TypeScript | 5.7+ | Strict mode, bundler moduleResolution |

### 20.2 Configuration Vite pour extensions Trimble Connect

Le Workspace API est chargé via CDN dans `index.html` et **ne doit pas être bundlé**. Vite doit le déclarer comme `external` :

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      // CRITIQUE : ne pas bundler le SDK Workspace API
      external: ['trimble-connect-workspace-api'],
      output: {
        globals: {
          'trimble-connect-workspace-api': 'TrimbleConnectWorkspace',
        },
        // Séparer les grosses dépendances en chunks dédiés
        // → Chargés à la demande uniquement quand nécessaire
        manualChunks(id) {
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-export';
        },
      },
    },
  },
})
```

#### Code splitting — Lazy loading des onglets

Chaque onglet de l'extension doit être un composant lazy pour réduire le temps de chargement initial :

```tsx
// App.tsx
import { lazy, Suspense } from 'react';

const ExplorerTab = lazy(() =>
  import('@/components/tabs/ExplorerTab').then(m => ({ default: m.ExplorerTab }))
);
const StatistiquesTab = lazy(() =>
  import('@/components/tabs/StatistiquesTab').then(m => ({ default: m.StatistiquesTab }))
);

// Envelopper le contenu avec Suspense
<Suspense fallback={<Loader />}>
  {activeTab === 'explorer' && <ExplorerTab />}
  {activeTab === 'stats' && <StatistiquesTab />}
</Suspense>
```

**Résultat observé** (extension avec 4 onglets + recharts + jspdf) :

| Chunk | Taille | Gzip | Chargement |
|-------|--------|------|------------|
| Core app (React + Tailwind) | ~232 KB | ~73 KB | Immédiat |
| vendor-charts (recharts) | ~422 KB | ~115 KB | Onglet Statistiques uniquement |
| vendor-export (jspdf + html2canvas) | ~594 KB | ~177 KB | Export PDF uniquement |
| Chaque onglet | 15-45 KB | 5-11 KB | À la demande |

#### Scripts CDN dans `index.html`

```html
<body>
  <div id="root"></div>
  <!-- OBLIGATOIRE : Workspace API SDK -->
  <script src="https://components.connect.trimble.com/trimble-connect-workspace-api/index.js"></script>
  <!-- RECOMMANDÉ : Extension API legacy (compatibilité) -->
  <script src="https://app.connect.trimble.com/tc/static/5.0.0/tcw-extension-api.js"></script>
  <!-- App Vite -->
  <script type="module" src="/src/main.tsx"></script>
</body>
```

> **CRITIQUE** : Le `type="module"` est nécessaire pour Vite. En production (`dist/`), Vite génère automatiquement les balises `<script>` correctes.

#### Fichier `vite-env.d.ts` obligatoire

Sans ce fichier, TypeScript ne reconnaît pas `import.meta.env` :

```typescript
// src/vite-env.d.ts
/// <reference types="vite/client" />
```

### 20.3 Pattern React Hook + Context pour Workspace API

Le pattern recommandé encapsule la connexion Workspace API dans un hook React avec un Context pour diffuser l'état à toute l'application :

```typescript
// src/hooks/useTrimbleConnect.ts
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

// ── Déclaration globale du SDK chargé via CDN ──
declare global {
  interface Window {
    TrimbleConnectWorkspace: {
      connect: (
        target: Window | HTMLIFrameElement,
        onEvent: (event: string, data: unknown) => void,
        timeout?: number,
      ) => Promise<TrimbleAPI>;
    };
  }
}

// ── Interface typée de l'API ──
// Typer les méthodes que vous utilisez réellement
export interface TrimbleAPI {
  project: {
    getCurrentProject: () => Promise<{ id: string; name: string; location: string }>;
  };
  extension: {
    requestPermission: (permission: string) => Promise<string>;
    setStatusMessage: (msg: string) => void;
  };
  viewer: {
    getModels: (filter?: string) => Promise<unknown[]>;
    getSelection: () => Promise<ViewerSelection[]>;
    setSelection: (selector: unknown, mode: string) => Promise<void>;
    getObjectProperties: (modelId: string, ids: number[]) => Promise<unknown[]>;
    getHierarchyChildren: (modelId: string, ids: number[], type: string, recursive: boolean) => Promise<unknown[]>;
    setObjectState: (selector: unknown, state: unknown) => Promise<void>;
    isolateEntities: (entities: unknown[]) => Promise<void>;
    convertToObjectIds: (modelId: string, ids: number[]) => Promise<string[]>;
    convertToObjectRuntimeIds: (modelId: string, ids: string[]) => Promise<number[]>;
    getSnapshot: () => Promise<string>;
  };
}

// ── State ──
export interface TrimbleConnectState {
  isConnected: boolean;
  isEmbedded: boolean;
  project: ConnectProject | null;
  accessToken: string | null;
  selection: ViewerSelection[];
  api: TrimbleAPI | null; // null en mode dev → déclenche les fallbacks mock
}

// ── Context ──
const TrimbleContext = createContext<TrimbleConnectState>({ /* defaults */ });
export const TrimbleProvider = TrimbleContext.Provider;
export function useTrimbleContext() { return useContext(TrimbleContext); }

// ── Hook principal ──
export function useTrimbleConnect() {
  const [state, setState] = useState<TrimbleConnectState>(/* defaults */);

  const handleEvent = useCallback((event: string, data: unknown) => {
    switch (event) {
      case 'extension.accessToken':
        setState(s => ({ ...s, accessToken: data as string }));
        break;
      case 'viewer.selectionChanged':
        // data = ViewerSelection[] = [{ modelId, objectRuntimeIds: number[] }]
        setState(s => ({ ...s, selection: data as ViewerSelection[] }));
        break;
      case 'viewer.modelLoaded':
        // Déclencher un rechargement des données dépendantes
        break;
    }
  }, []);

  useEffect(() => {
    const isInIframe = window.self !== window.top;

    if (isInIframe && window.TrimbleConnectWorkspace) {
      // Mode intégré : connexion réelle
      window.TrimbleConnectWorkspace
        .connect(window.parent, handleEvent, 30000)
        .then(async (api) => {
          const project = await api.project.getCurrentProject();
          const token = await api.extension.requestPermission('accesstoken');
          setState({
            isConnected: true,
            isEmbedded: true,
            project,
            accessToken: token !== 'pending' && token !== 'denied' ? token : null,
            selection: [],
            api, // API réelle → les services utiliseront les vraies données
          });
        })
        .catch(console.error);
    } else {
      // Mode dev : api = null → les services retournent des mock
      setState({
        isConnected: true,
        isEmbedded: false,
        project: { id: 'mock', name: 'Dev local', location: 'europe' },
        accessToken: 'mock-token',
        selection: [],
        api: null, // ← Clé du pattern : null déclenche les fallbacks
      });
    }
  }, [handleEvent]);

  return state;
}
```

**Utilisation dans `App.tsx`** :

```tsx
export default function App() {
  const trimble = useTrimbleConnect();
  return (
    <TrimbleProvider value={trimble}>
      {/* Tous les composants enfants accèdent via useTrimbleContext() */}
    </TrimbleProvider>
  );
}
```

> **Pattern clé** : `api: null` en dev → `api: TrimbleAPI` en prod. Tous les services vérifient `if (!api)` et retournent des mocks. Cela permet de développer sans être connecté à Trimble Connect.

### 20.4 Pattern ViewerBridge — Abstraction API avec fallback mock

Le `viewerBridge.ts` est le **point d'entrée unique** pour tous les appels au Viewer API. Il abstrait la complexité et gère les fallbacks :

```
Composants React
     │
     ▼
viewerBridge.ts  ── api != null ──→ Trimble Viewer API (réel)
                 ── api == null ──→ Mock data (dev)
```

#### Structure des fonctions

Chaque fonction suit le même schéma :

```typescript
export async function maFonction(api: TrimbleAPI | null, ...params): Promise<ResultType> {
  // 1. Fallback mock si pas d'API
  if (!api) return MOCK_DATA;

  try {
    // 2. Appel API réel
    const result = await api.viewer.someMethod(...);

    // 3. Transformation des données API → types applicatifs
    return transformResult(result);
  } catch (err) {
    console.error('maFonction failed:', err);
    // 4. Fallback gracieux en cas d'erreur
    return MOCK_DATA;
  }
}
```

#### Patterns Viewer API concrets et testés

**Obtenir les modèles chargés :**

```typescript
const models = await api.viewer.getModels('loaded');
// Retourne: Array<{ id: string; name?: string; ... }>
```

**Obtenir la hiérarchie spatiale (arbre du modèle) :**

```typescript
const hierarchy = await api.viewer.getHierarchyChildren(
  modelId,   // ID du modèle
  [],        // [] = racine du modèle
  'spatial', // type de hiérarchie ('spatial' pour structure IFC)
  true       // recursive = true pour tout l'arbre
);
// Retourne: Array<{ runtimeId, name?, type?, ifcType?, children?, objectCount? }>
```

> **IMPORTANT** : Le paramètre `'spatial'` retourne la hiérarchie IFC (Site > Building > Storey > Space > Elements). Il existe aussi `'containment'` et d'autres types.

**Obtenir les propriétés d'objets (batch) :**

```typescript
const propsArray = await api.viewer.getObjectProperties(modelId, [runtimeId1, runtimeId2, ...]);
// Retourne: Array<{
//   runtimeId: number,
//   name?: string,
//   type?: string, // ex: "IfcWall", "IfcDoor"
//   properties?: Array<{
//     name: string, // nom du Property Set (ex: "Pset_WallCommon")
//     properties?: Array<{ name: string, value: string }> // propriétés individuelles
//   }>
// }>
```

> **Bonnes pratiques** :
> - Batcher par groupes de **50 runtimeIds max** pour éviter les timeouts
> - La structure `properties` est un **tableau de Property Sets**, chaque Property Set contenant un **tableau de paires clé/valeur**

**Sélectionner des objets dans le viewer :**

```typescript
await api.viewer.setSelection(
  {
    modelObjectIds: [
      { modelId: 'xxx', objectRuntimeIds: [1, 2, 3] }
    ]
  },
  'set' // 'set' = remplacer, 'add' = ajouter, 'remove' = retirer
);
```

> **ATTENTION** : Le `selector` utilise le format `{ modelObjectIds: [...] }` (avec un tableau d'objets `{ modelId, objectRuntimeIds }`), **pas** le format `{ modelId, objectRuntimeIds }` directement.

**Coloriser des objets :**

```typescript
// Appliquer une couleur
await api.viewer.setObjectState(
  { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
  { color: '#22C55E' } // vert pour "validé"
);

// Réinitialiser la couleur (retour à la couleur d'origine)
await api.viewer.setObjectState(
  { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
  { color: null } // null = reset
);
```

> **Format des couleurs** : Hexadécimal `#RRGGBB`. `null` pour reset.

**Contrôler la visibilité :**

```typescript
await api.viewer.setObjectState(
  { modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds }] },
  { visible: true } // ou false pour masquer
);

// Rendre TOUT visible :
await api.viewer.setObjectState(undefined, { visible: true });
```

**Isoler des objets (masquer tout le reste) :**

```typescript
await api.viewer.isolateEntities([
  { modelObjectIds: [{ modelId, objectRuntimeIds: [1, 2, 3] }] }
]);
```

> **NOTE** : `isolateEntities` prend un **tableau d'objets** qui contiennent chacun `modelObjectIds`.

**Conversion RuntimeId ↔ External ID (IFC GUID) :**

```typescript
// Runtime IDs → IFC GUIDs
const guids = await api.viewer.convertToObjectIds(modelId, [runtimeId1, runtimeId2]);
// ["2O2Fr$t4X7Zf8NOew3FLOH", "3x4Gz$u5Y8Af9POfx4GMPI"]

// IFC GUIDs → Runtime IDs
const runtimeIds = await api.viewer.convertToObjectRuntimeIds(modelId, ['2O2Fr$t4X7Zf8NOew3FLOH']);
// [42]
```

> **Utilité** : Les IDS files référencent les objets par IFC GUID, le viewer par Runtime ID. Cette conversion est indispensable pour la validation IDS.

### 20.5 Structure `ViewerSelection` (événement `viewer.selectionChanged`)

L'événement `viewer.selectionChanged` retourne un tableau de `ViewerSelection` :

```typescript
interface ViewerSelection {
  modelId: string;
  objectRuntimeIds: number[];
}

// Exemple de données reçues dans le handler d'événements :
// [
//   { modelId: "abc-123", objectRuntimeIds: [42, 57, 103] }
// ]
```

Le comptage des objets sélectionnés se fait ainsi :

```typescript
const count = selection.reduce((sum, sel) => sum + sel.objectRuntimeIds.length, 0);
```

### 20.6 Error Boundary pour stabilité iframe

Les extensions tournent dans un `<iframe>` — un crash React = écran blanc sans possibilité de récupération. Un `ErrorBoundary` est **obligatoire** :

```tsx
import { Component, type ReactNode, type ErrorInfo } from 'react';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6">
          <p>Une erreur est survenue</p>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage dans App.tsx :
<ErrorBoundary>
  <Suspense fallback={<Loader />}>
    {/* Contenu des onglets */}
  </Suspense>
</ErrorBoundary>
```

### 20.7 Mode sombre dans l'iframe TC

Trimble Connect ne fournit pas directement le thème au `<iframe>`. L'extension doit gérer son propre mode sombre :

```typescript
function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: useCallback(() => setDark(d => !d), []) };
}
```

> **Note `localStorage`** : Fonctionne dans l'iframe TC pour la préférence de thème (non sensible). Éviter d'y stocker des tokens ou données sensibles.

Les variables CSS doivent définir les deux thèmes :

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.437 0.118 254.76); /* Trimble Blue adapté */
  /* ... */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.61 0.17 254.76);
  /* ... */
}
```

### 20.8 Pièges rencontrés et solutions

| Piège | Symptôme | Solution |
|-------|----------|----------|
| **Recharts Tooltip crash** | Écran blanc au hover du graphique | Utiliser un tooltip HTML custom absolu au lieu du `<Tooltip>` Recharts intégré. Recharts rend le tooltip dans un conteneur détaché du DOM qui peut interférer avec Tailwind. |
| **HMR ne met pas à jour** | Changements non visibles après save | Vite HMR peut cacher les modules. Forcer un `page reload` plutôt que `hmr update` en modifiant les exports du fichier. |
| **`tsc` échoue sur `import.meta.env`** | `TS2339: Property 'env' does not exist` | Créer `src/vite-env.d.ts` avec `/// <reference types="vite/client" />` |
| **`tsc` échoue sur `import './index.css'`** | `TS2307: Cannot find module` | Normal avec Vite — le CSS est géré par le bundler. Le build `vite build` fonctionne. Ignorer pour `tsc --noEmit`. |
| **Bundle trop gros (>1MB)** | Chargement lent dans l'iframe | Code splitting (lazy tabs) + manualChunks (recharts, jspdf séparés). Objectif : core < 300KB gzip. |
| **`setObjectState` format incorrect** | Erreur silencieuse, rien ne change | Le selector doit être `{ modelObjectIds: [{ modelId, objectRuntimeIds }] }` et NON `{ modelId, objectRuntimeIds }` directement. |
| **`isolateEntities` format** | Erreur ou comportement inattendu | Le paramètre est `[{ modelObjectIds: [...] }]` — un tableau d'objets contenant `modelObjectIds`. |
| **Drag & Drop dans panel étroit** | Comportement erratique | Utiliser l'API HTML5 native (`draggable`, `onDragStart/Over/Drop`) plutôt qu'une librairie lourde. Adapter les zones de drop à la largeur du panel. |
| **PDF inline dans l'extension** | Nouvel onglet ouvert au lieu de l'affichage inline | Utiliser `<iframe src={pdfUrl} />` pour l'affichage inline. Les URLs relatives (`/docs/file.pdf`) fonctionnent avec Vite (fichiers dans `public/`). |

### 20.9 Variables d'environnement recommandées

```env
# .env (copier depuis .env.example)
VITE_TC_API_BASE=https://app.connect.trimble.com/tc/api/2.0
VITE_TC_REGION=europe
VITE_EXT_BASE_URL=https://your-domain.com/trb-ids-validation
VITE_DEBUG=false
```

Accès typé dans le code :

```typescript
// src/config/env.ts
export const env = {
  tcApiBase: import.meta.env.VITE_TC_API_BASE as string | undefined,
  tcRegion: (import.meta.env.VITE_TC_REGION as string) ?? 'europe',
  extBaseUrl: import.meta.env.VITE_EXT_BASE_URL as string | undefined,
  debug: import.meta.env.VITE_DEBUG === 'true',
  isDev: import.meta.env.DEV,
} as const;
```

> **Règle Vite** : Seules les variables préfixées par `VITE_` sont exposées côté client. Ne jamais mettre de secrets dans ces variables.

### 20.10 Manifest avancé pour extension Viewer 3D

```json
{
  "name": "BMS - Navigateur et Validateur",
  "version": "1.0.0",
  "api": "1.0",
  "extensions": [
    {
      "type": "viewerModule",
      "id": "trb-ids-validation",
      "title": "BMS - Gestion DOE & Maintenance",
      "icon": "./icon-48.png",
      "url": "./index.html",
      "infoUrl": "./help.html"
    }
  ],
  "permissions": ["project.read", "files.read", "views.read"],
  "dependencies": {
    "@trimble/connect-workspace-api": "^2.0.0"
  },
  "description": "Extension de validation IDS et navigation pour Trimble Connect 3D Viewer"
}
```

> **URLs relatives** : Fonctionnent si le manifest est hébergé au même endroit que les fichiers. Pour GitHub Pages ou Vercel, remplacer par des URLs absolues.

### 20.11 Checklist de déploiement

- [ ] `npm run build` réussit sans erreur
- [ ] Le dossier `dist/` contient `index.html`, `manifest.json`, les assets JS/CSS
- [ ] Les URLs dans `manifest.json` pointent vers l'hébergement final
- [ ] L'hébergement est en HTTPS
- [ ] Les headers CORS autorisent `*.connect.trimble.com`
- [ ] Le manifest est accessible depuis `https://votre-domaine.com/manifest.json`
- [ ] L'extension est enregistrée dans Trimble Connect (Paramètres > Extensions)
- [ ] La connexion `WorkspaceAPI.connect()` aboutit (vérifier la console)
- [ ] L'événement `viewer.selectionChanged` est bien reçu
- [ ] Les appels `viewer.getObjectProperties()` retournent des données

---
