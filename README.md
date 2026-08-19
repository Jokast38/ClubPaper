# ClubPaper (ClubManager)

Application de gestion de club sportif — adhérents, cotisations, planning, communication et page publique — le tout **sans paperasse**.

Stack : **FastAPI (Python) + MongoDB** côté backend, **React 19 (CRA/Craco) + Tailwind + Radix UI** côté frontend.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration (variables d'environnement)](#configuration-variables-denvironnement)
- [Lancer le projet en local](#lancer-le-projet-en-local)
- [Structure du projet](#structure-du-projet)
- [Intégrations tierces](#intégrations-tierces)
- [Modèle de données](#modèle-de-données)
- [Notes de sécurité](#notes-de-sécurité)

---

## Fonctionnalités

### Gestion du club
- Onboarding : création du club (nom, sport, ville, équipes, cotisation par défaut) après inscription.
- Personnalisation : logo, couleurs (extraites automatiquement du logo), signature du bureau (upload ou dessin à la souris), images de la page publique (hero + section "Où nous trouver").
- Page publique du club (`/c/<slug>`) : présentation, actualités (blog), formulaire de contact/prospect, informations pratiques.

### Adhérents
- CRUD complet, import en masse (CSV / Excel).
- Recherche et autocomplétion en direct depuis la base de données, pagination serveur (20/page).
- Sélection multiple, suppression groupée, et suppression totale des adhérents (avec confirmation explicite).
- Suivi de la licence et du certificat médical par adhérent.
- Documents par adhérent (upload, téléchargement, suppression logique) + import direct depuis Google Drive.
- Génération PDF : fiche adhérent, reçu de cotisation, attestation de licence — tous trois incluent la signature du bureau si configurée.

### Cotisations
- Suivi des paiements (en attente / payé / en retard), relances automatiques (email + SMS).
- Paiement en ligne via Stripe (checkout, webhook, page de succès/annulation).

### Planning
- Créneaux (entraînements / matchs) avec équipe, lieu, horaires.
- Autocomplétion du lieu via **Google Places** (gymnases, stades, adresses réelles).
- Notification automatique des adhérents concernés en cas de création/modification/annulation.
- Synchronisation bidirectionnelle avec **Google Agenda** (création/mise à jour/suppression d'événements) une fois le compte Google connecté.

### Communication
- Annonces (email + SMS) ciblées par équipe ou pour tout le club, éditeur de texte riche.
- Blog du club (articles publiés sur la page publique).
- Prospects : formulaire de contact public → liste de prospects côté admin.

### Comptes & connexion
- Authentification email/mot de passe (JWT en cookie httpOnly).
- Connexion via **Google Sign-In** (création de compte automatique au premier login).
- Compte administrateur "seedé" automatiquement au démarrage depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Intégrations Google
- **Google Drive** : import de documents adhérents, export automatique des reçus PDF vers un dossier dédié `ClubPaper - <Nom du club>`.
- **Google Agenda** : sync des créneaux du planning.
- **Google Places** : autocomplétion des lieux.
- **Google Sign-In** : connexion sans mot de passe.

---

## Architecture

```
ClubManager/
├── backend/            FastAPI (API REST sous /api)
│   ├── server.py        Point d'entrée, middlewares, startup (index Mongo, seed admin, Stripe, scheduler)
│   ├── models.py         Modèles Pydantic (Club, Member, Fee, Session, ...)
│   ├── auth_utils.py      JWT, hashing bcrypt
│   ├── deps.py            Dépendances FastAPI partagées (current_user, get_user_club, ...)
│   ├── database.py        Connexion MongoDB (Motor)
│   ├── pdf_utils.py       Génération des PDF (ReportLab)
│   ├── storage.py         Stockage des documents (S3-compatible via boto3)
│   ├── scheduler_jobs.py  Tâches planifiées (APScheduler) : relances cotisations/saison
│   └── routers/
│       ├── auth.py         Connexion email/mdp + Google
│       ├── clubs.py        Club, thème, prospects
│       ├── members.py      Adhérents, documents, PDF
│       ├── fees.py         Cotisations, paiements Stripe
│       ├── activity.py     Créneaux (planning) + annonces
│       ├── content.py      Blog, paramètres de saison
│       ├── public.py       Endpoints publics (page club, blog, prospects)
│       ├── notifications.py Journal des notifications envoyées
│       ├── drive.py        Intégration Google Drive
│       └── gcal.py         Intégration Google Agenda
│
└── frontend/            React 19 + Craco + Tailwind + Radix UI
    └── src/
        ├── pages/          Une page par route (Dashboard, Members, Calendar, Settings, PublicClub, ...)
        ├── components/     Composants réutilisables (DrivePanel, CalendarSyncPanel, SignaturePad, ...)
        └── lib/            AuthContext, client API axios, helpers
```

L'API backend est exposée sous le préfixe `/api` (ex. `http://localhost:8000/api/...`), consommée par le frontend via `REACT_APP_BACKEND_URL`.

---

## Prérequis

- **Python** 3.12+
- **Node.js** 18+ et **Yarn**
- Une base **MongoDB** (Atlas ou locale)
- Un compte **Stripe** (mode test suffit) pour les paiements
- Un projet **Google Cloud** (OAuth 2.0 + API activées) pour Drive / Agenda / Sign-In / Places — voir [Intégrations tierces](#intégrations-tierces)

---

## Installation

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Frontend
cd ../frontend
yarn install
```

---

## Configuration (variables d'environnement)

### `backend/.env`

| Variable | Description |
|---|---|
| `MONGO_URL` | URI de connexion MongoDB |
| `DB_NAME` | Nom de la base |
| `CORS_ORIGINS` | Origine(s) autorisée(s) pour le frontend (ex. `http://localhost:3000`). **Ne pas mettre `*`** si le frontend envoie des cookies — voir [Notes de sécurité](#notes-de-sécurité) |
| `JWT_SECRET` | Secret de signature des tokens JWT |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Identifiants du compte admin créé automatiquement au démarrage |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_ACCOUNT_ID` / `STRIPE_MODE` | Configuration Stripe |
| `RESEND_API_KEY` / `SENDER_EMAIL` | Envoi d'emails (Resend) |
| `FRONTEND_URL` | URL du frontend (redirections OAuth, liens dans les emails) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Client OAuth Google (Drive, Agenda, Sign-In) |
| `GOOGLE_DRIVE_REDIRECT_URI` | Callback OAuth Drive — doit pointer vers le **backend** (`http://localhost:8000/api/drive/callback`) |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Callback OAuth Agenda (`http://localhost:8000/api/calendar/callback`) |

### `frontend/.env`

| Variable | Description |
|---|---|
| `REACT_APP_BACKEND_URL` | URL du backend (ex. `http://localhost:8000`) |
| `REACT_APP_GOOGLE_CLIENT_ID` | Même Client ID Google que côté backend, pour le bouton Google Sign-In |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Clé API Google Maps/Places, pour l'autocomplétion des lieux |

> Les fichiers `.env` sont ignorés par Git (voir `.gitignore`). Ne jamais committer de secrets.

---

## Lancer le projet en local

```bash
# Terminal 1 — backend (http://localhost:8000)
cd backend
uvicorn server:app --reload --port 8000

# Terminal 2 — frontend (http://localhost:3000)
cd frontend
yarn start
```

Au premier démarrage, le backend crée les index MongoDB nécessaires et seed le compte admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) s'il n'existe pas encore.

---

## Structure du projet

### Pages frontend (`frontend/src/pages`)

| Page | Route | Description |
|---|---|---|
| `Landing.js` | `/` | Page marketing publique |
| `Login.js` / `Register.js` | `/login`, `/inscription` | Authentification (email/mdp + Google) |
| `Onboarding.js` | `/onboarding` | Création du club après inscription |
| `Dashboard.js` | `/app` | Tableau de bord (cotisations, prochains créneaux, prospects) |
| `Members.js` | `/app/adherents` | Gestion des adhérents |
| `Payments.js` | `/app/cotisations` | Suivi des cotisations |
| `Calendar.js` | `/app/planning` | Planning des créneaux |
| `Announcements.js` | `/app/annonces` | Annonces email/SMS |
| `Blog.js` / `BlogPost.js` | `/app/blog` | Gestion du blog du club |
| `Prospects.js` | `/app/prospects` | Demandes reçues via la page publique |
| `Settings.js` | `/app/parametres` | Paramètres club, intégrations, apparence |
| `PublicClub.js` | `/c/:slug` | Page publique du club |
| `PayFee.js`, `PaymentSuccess.js`, `PaymentCancel.js` | — | Parcours de paiement Stripe côté adhérent |
| `Pricing.js`, `Help.js` | — | Pages support/tarifs |

### Routers backend (`backend/routers`)

| Router | Préfixe | Rôle |
|---|---|---|
| `auth.py` | `/api/auth` | Login, register, Google Sign-In, session |
| `clubs.py` | `/api/clubs` | Club courant, prospects |
| `members.py` | `/api/members` | Adhérents, documents, PDF |
| `fees.py` | `/api/fees` | Cotisations, paiements Stripe |
| `activity.py` | `/api/sessions`, `/api/announcements` | Planning, annonces |
| `content.py` | `/api/blog`, `/api/season` | Blog, paramètres de saison |
| `public.py` | `/api/public` | Endpoints sans authentification |
| `notifications.py` | `/api/notifications` | Historique des envois |
| `drive.py` | `/api/drive` | OAuth + sync Google Drive |
| `gcal.py` | `/api/calendar` | OAuth + sync Google Agenda |

---

## Intégrations tierces

### Google Cloud (Drive, Agenda, Sign-In)

1. Créer un projet dans la [Google Cloud Console](https://console.cloud.google.com/).
2. Activer les API : **Google Drive API**, **Google Calendar API**.
3. Créer un identifiant **OAuth 2.0 Client ID** (type "Application Web").
4. Ajouter comme **URI de redirection autorisés** :
   - `http://localhost:8000/api/drive/callback`
   - `http://localhost:8000/api/calendar/callback`
5. Ajouter comme **origine JavaScript autorisée** : `http://localhost:3000` (nécessaire pour le bouton Google Sign-In).
6. Renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (backend) et `REACT_APP_GOOGLE_CLIENT_ID` (frontend).

### Google Places (autocomplétion des lieux)

1. Activer **Maps JavaScript API** et **Places API** dans le même projet Google Cloud.
2. Créer une clé API (idéalement restreinte par référent HTTP à `localhost:3000` en dev, au domaine de prod en production).
3. Renseigner `REACT_APP_GOOGLE_MAPS_API_KEY`.

### Stripe

Mode test recommandé pour le développement. Le webhook (`STRIPE_WEBHOOK_SECRET`) doit pointer vers `POST /api/fees/webhook` (voir `routers/fees.py`).

### Resend (email) / Twilio (SMS)

Optionnels — sans clé configurée, les fonctionnalités de relance/notification par email ou SMS sont simplement désactivées silencieusement.

---

## Modèle de données

Collections MongoDB principales (voir `backend/models.py`) :

- `users` — comptes (email, hash bcrypt ou vide si Google, rôle, club associé)
- `clubs` — infos club, thème, logo/signature/images publiques, statut d'abonnement
- `members` — adhérents (licence, certificat médical, équipe, contact parent)
- `fees` — cotisations (montant, statut, échéance, lien Stripe)
- `sessions` — créneaux du planning (+ `google_event_id` si synchronisé)
- `announcements` — annonces diffusées
- `prospects` — demandes de contact reçues via la page publique
- `documents` — fichiers liés à un adhérent
- `blog_posts` — articles publiés
- `drive_credentials` / `calendar_credentials` — jetons OAuth Google par club

---

## Notes de sécurité

- Les cookies de session sont `httpOnly`, `secure`, `SameSite=None` — un `CORS_ORIGINS` explicite (pas de wildcard `*`) est **obligatoire** pour que l'authentification par cookie fonctionne en local comme en production.
- Les mots de passe sont hashés avec bcrypt ; les comptes créés via Google Sign-In n'ont pas de mot de passe (login par mot de passe désactivé pour ces comptes).
- Ne jamais committer `backend/.env` ni `frontend/.env` (déjà exclus via `.gitignore`).
