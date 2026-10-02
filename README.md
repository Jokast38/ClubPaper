# ClubPaper (ClubManager)

Application de gestion de club sportif — adhérents, cotisations, planning, communication et page publique — le tout **sans paperasse**.

Stack : **FastAPI (Python) + MongoDB** côté backend, **React 19 (CRA/Craco) + Tailwind + Radix UI** côté frontend.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Administration de la plateforme](#administration-de-la-plateforme)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration (variables d'environnement)](#configuration-variables-denvironnement)
- [Lancer le projet en local](#lancer-le-projet-en-local)
- [Structure du projet](#structure-du-projet)
- [Intégrations tierces](#intégrations-tierces)
- [Modèle de données](#modèle-de-données)
- [Notes de sécurité](#notes-de-sécurité)
- [Autres scripts (`leads/`)](#autres-scripts-leads)

---

## Fonctionnalités

### Gestion du club
- Onboarding : création du club (nom, sport, ville, équipes, cotisation par défaut) après inscription.
- Personnalisation : logo, couleurs (extraites automatiquement du logo), signature du bureau (upload ou dessin à la souris), images de la page publique (hero + section "Où nous trouver"), site officiel du club.
- Page publique du club (`/c/<slug>`) : présentation, actualités (blog), formulaire de contact/prospect, informations pratiques, lien vers le site officiel.
- Suppression de compte en libre-service (« zone dangereuse » dans Paramètres) : supprime définitivement le club et toutes ses données, avec confirmation explicite.

### Adhérents
- CRUD complet, import en masse (CSV / Excel).
- Recherche et autocomplétion en direct depuis la base de données, pagination serveur (20/page).
- Sélection multiple, suppression groupée, et suppression totale des adhérents (avec confirmation explicite).
- Suivi de la licence et du certificat médical par adhérent.
- Documents par adhérent (upload, téléchargement, suppression logique) ; chaque upload est aussi dupliqué automatiquement dans un sous-dossier dédié du Drive du club si celui-ci est connecté (`ClubPaper - <club>/Adhérents/<nom>`).
- Génération PDF : fiche adhérent, reçu de cotisation, attestation de licence — tous trois incluent la signature du bureau si configurée.

### Cotisations
- Suivi des paiements (en attente / payé / en retard), relances automatiques (email + SMS).
- Paiement en ligne via Stripe (checkout, webhook, page de succès/annulation). Abonnement plateforme : 29,99 €/mois par club.

### Planning
- Créneaux (entraînements / matchs) avec équipe, lieu, horaires.
- Autocomplétion du lieu via **Google Places** (gymnases, stades, adresses réelles).
- Notification automatique des adhérents concernés en cas de création/modification/annulation.
- Synchronisation bidirectionnelle avec **Google Agenda** (création/mise à jour/suppression d'événements) une fois le compte Google connecté, avec bouton de resynchronisation manuelle pour rattraper les créneaux créés avant la connexion.

### Communication
- Annonces (email + SMS) ciblées par équipe ou pour tout le club, éditeur de texte riche.
- Blog du club (articles publiés sur la page publique).
- Prospects : formulaire de contact public → liste de prospects côté admin, avec email de notification automatique au club.

### Comptes & connexion
- Authentification email/mot de passe (JWT en cookie httpOnly + support Bearer token pour les déploiements multi-origines).
- Connexion via **Google Sign-In** (création de compte automatique au premier login).
- Compte administrateur "seedé" automatiquement au démarrage depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD` (et promu en administrateur de plateforme — voir plus bas).
- Email de bienvenue à l'inscription, email « Bravo, votre club est prêt » à la création du club (logo, infos, lien vers la page publique).

### Tutoriel guidé
- Tour interactif multi-pages (Dashboard → Adhérents → Cotisations → Planning → Annonces → Paramètres) au premier login, basé sur `react-joyride` v3.
- Statut persisté côté compte (pas dans le navigateur) : ne réapparaît pas après changement d'appareil ou de navigateur.
- Activable/désactivable et relançable à tout moment depuis la page **Aide**.

### Aide & support
- Centre d'aide avec recherche, captures d'écran cliquables (zoom), FAQ.
- Bouton « Signaler un problème » : envoie un ticket de support, visible et traitable (avec réponse par email) depuis le tableau de bord de l'administrateur de la plateforme.

### Pages légales & marketing
- Mentions légales, CGU/CGV, politique de confidentialité RGPD/CNIL (`/legal/mentions`, `/legal/cgu`, `/legal/confidentialite`) — contiennent des placeholders à personnaliser avec les informations réelles de la structure.
- Landing page : bandeau d'offre, section bénéfices, captures d'écran produit, FAQ, footer avec liens légaux.

### Intégrations Google
- **Google Drive** (scope restreint `drive.file`, pas d'audit de sécurité Google requis) : export automatique des reçus PDF et des documents adhérents vers un dossier dédié `ClubPaper - <Nom du club>`.
- **Google Agenda** : sync bidirectionnelle des créneaux du planning.
- **Google Places** : autocomplétion des lieux.
- **Google Sign-In** : connexion sans mot de passe.

---

## Administration de la plateforme

Un rôle **`is_platform_admin`** (distinct du rôle `admin` d'un club, qui désigne le bureau) donne accès à `/app/admin`, un tableau de bord réservé à l'opérateur de ClubPaper :

- **Vue d'ensemble** : nombre de clubs inscrits, comptes utilisateurs, clubs actifs/en essai/en retard, chiffre d'affaires mensuel **estimé** (clubs actifs × prix de l'abonnement), graphique d'évolution des inscriptions et du CA sur 12 mois.
- **Clubs & abonnements** : liste de tous les clubs avec propriétaire et nombre d'adhérents, changement manuel du statut d'abonnement, suppression définitive d'un club (avec confirmation).
- **Emails / SMS** : journal de toutes les notifications envoyées, tous clubs confondus, filtrable par statut — pour diagnostiquer les échecs d'envoi.
- **Réclamations** : tickets soumis via « Signaler un problème » dans l'Aide, avec fil de réponse par email et marquage résolu.

Le compte défini par `ADMIN_EMAIL` est automatiquement promu `is_platform_admin` à chaque démarrage du backend (y compris s'il existait déjà avant l'introduction de ce rôle).

---

## Architecture

```
ClubManager/
├── backend/            FastAPI (API REST sous /api)
│   ├── server.py        Point d'entrée, middlewares, startup (index Mongo, seed admin, Stripe, scheduler)
│   ├── models.py         Modèles Pydantic (Club, Member, Fee, Session, SupportTicket, ...)
│   ├── auth_utils.py      JWT, hashing bcrypt
│   ├── deps.py            Dépendances FastAPI partagées (current_user, platform_admin_user, delete_club_cascade, ...)
│   ├── database.py        Connexion MongoDB (Motor)
│   ├── email_utils.py     Envoi d'emails (SMTP natif ou Resend) + templates HTML
│   ├── pdf_utils.py       Génération des PDF (ReportLab)
│   ├── storage.py         Stockage des documents (S3-compatible via boto3)
│   ├── scheduler_jobs.py  Tâches planifiées (APScheduler) : relances cotisations/saison
│   └── routers/
│       ├── auth.py         Connexion email/mdp + Google, suppression de compte
│       ├── clubs.py        Club, thème, prospects
│       ├── members.py      Adhérents, documents, PDF
│       ├── fees.py         Cotisations, paiements Stripe
│       ├── activity.py     Créneaux (planning) + annonces
│       ├── content.py      Blog, paramètres de saison
│       ├── public.py       Endpoints publics (page club, blog, prospects)
│       ├── notifications.py Journal des notifications envoyées (vue club)
│       ├── drive.py        Intégration Google Drive
│       ├── gcal.py         Intégration Google Agenda
│       └── admin.py        Tableau de bord de l'administrateur de plateforme
│
└── frontend/            React 19 + Craco + Tailwind + Radix UI
    └── src/
        ├── pages/          Une page par route (Dashboard, Members, Calendar, Settings, PublicClub, AdminDashboard, LegalPage, ...)
        ├── components/     Composants réutilisables (DrivePanel, CalendarSyncPanel, SignaturePad, OnboardingTour, PlaceAutocompleteInput, ...)
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
- Un compte SMTP (optionnel — sinon repli automatique sur Resend, puis sur une simulation loguée) pour l'envoi d'emails transactionnels

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
| `CORS_ORIGINS` | Origine(s) autorisée(s) pour le frontend (ex. `http://localhost:3000`, ou `*` si l'authentification se fait uniquement par Bearer token — voir [Notes de sécurité](#notes-de-sécurité)) |
| `JWT_SECRET` | Secret de signature des tokens JWT |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Identifiants du compte admin créé automatiquement au démarrage, promu administrateur de plateforme |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_ACCOUNT_ID` / `STRIPE_MODE` | Configuration Stripe |
| `SENDER_EMAIL` | Adresse d'expédition des emails transactionnels |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Envoi d'emails via SMTP natif (ex. Hostinger, port 465 en SSL implicite). Prioritaire sur Resend si renseigné |
| `RESEND_API_KEY` | Envoi d'emails via Resend — utilisé seulement si aucun SMTP n'est configuré |
| `FRONTEND_URL` | URL du frontend (redirections OAuth, liens dans les emails). Doit être une URL unique et propre (pas de liste séparée par virgules) |
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

Au premier démarrage, le backend crée les index MongoDB nécessaires, seed le compte admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) s'il n'existe pas encore (et le promeut administrateur de plateforme s'il existait déjà), puis synchronise le catalogue de prix Stripe.

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
| `Settings.js` | `/app/parametres` | Paramètres club, intégrations, apparence, suppression de compte |
| `Help.js` | `/app/aide` | Centre d'aide, tutoriel guidé, signalement de problème |
| `AdminDashboard.js` | `/app/admin` | Tableau de bord de l'administrateur de plateforme (réservé) |
| `PublicClub.js` | `/c/:slug` | Page publique du club |
| `LegalPage.js` | `/legal/:doc` | Mentions légales, CGU/CGV, politique de confidentialité |
| `PayFee.js`, `PaymentSuccess.js`, `PaymentCancel.js` | — | Parcours de paiement Stripe côté adhérent |
| `Pricing.js` | `/tarifs` | Page tarifs |

### Routers backend (`backend/routers`)

| Router | Préfixe | Rôle |
|---|---|---|
| `auth.py` | `/api/auth` | Login, register, Google Sign-In, session, suppression de compte |
| `clubs.py` | `/api/clubs` | Club courant, prospects |
| `members.py` | `/api/members` | Adhérents, documents, PDF |
| `fees.py` | `/api/fees` | Cotisations, paiements Stripe |
| `activity.py` | `/api/sessions`, `/api/announcements` | Planning, annonces |
| `content.py` | `/api/blog`, `/api/season` | Blog, paramètres de saison |
| `public.py` | `/api/public` | Endpoints sans authentification |
| `notifications.py` | `/api/notifications` | Historique des envois (vue club) |
| `drive.py` | `/api/drive` | OAuth + sync Google Drive |
| `gcal.py` | `/api/calendar` | OAuth + sync Google Agenda |
| `admin.py` | `/api/admin` | Stats plateforme, gestion clubs/abonnements, logs tous clubs, support |

---

## Intégrations tierces

### Google Cloud (Drive, Agenda, Sign-In)

1. Créer un projet dans la [Google Cloud Console](https://console.cloud.google.com/).
2. Activer les API : **Google Drive API**, **Google Calendar API** (vérifier que c'est bien fait sur le projet qui possède le Client ID utilisé — un projet Google Cloud différent de celui attendu est une source d'erreur fréquente).
3. Créer un identifiant **OAuth 2.0 Client ID** (type "Application Web").
4. Ajouter comme **URI de redirection autorisés** :
   - `http://localhost:8000/api/drive/callback`
   - `http://localhost:8000/api/calendar/callback`
5. Ajouter comme **origine JavaScript autorisée** : `http://localhost:3000` (nécessaire pour le bouton Google Sign-In) — et l'équivalent en production pour chaque domaine utilisé (`https://...` et sa variante `www.` le cas échéant).
6. Renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (backend) et `REACT_APP_GOOGLE_CLIENT_ID` (frontend).
7. Le scope Drive demandé est `drive.file` (accès restreint aux fichiers créés par l'app) plutôt que `drive` complet, pour rester dans la catégorie « scope sensible » de Google et éviter l'audit de sécurité payant requis pour les scopes « restreints » à plus grande échelle.
8. Tant que l'app Google OAuth est en mode « Test », seuls les comptes ajoutés comme testeurs peuvent se connecter — passer en production nécessite la validation Google (voir la documentation Google sur la vérification OAuth).

### Google Places (autocomplétion des lieux)

1. Activer **Maps JavaScript API** et **Places API** dans le même projet Google Cloud.
2. Créer une clé API (idéalement restreinte par référent HTTP à `localhost:3000` en dev, au domaine de prod en production).
3. Renseigner `REACT_APP_GOOGLE_MAPS_API_KEY`.

### Stripe

Mode test recommandé pour le développement. Le catalogue (produit + prix `clubmanager_monthly`, 29,99 €/mois) est créé/mis à jour automatiquement au démarrage par `setup_stripe.py` si `STRIPE_SECRET_KEY` est configuré.

### Email (SMTP / Resend)

L'envoi d'emails (bienvenue, club prêt, relances, annonces, nouvelles demandes, réponses de support) passe par `email_utils.send_email()`, qui choisit automatiquement le premier canal disponible : **SMTP natif** (si `SMTP_HOST` est renseigné) → **Resend** (si `RESEND_API_KEY` est renseigné) → simulation loguée (aucun email réel, utile en dev).

### SMS (Twilio)

Optionnel — sans clé configurée, les notifications SMS sont simplement désactivées silencieusement.

---

## Modèle de données

Collections MongoDB principales (voir `backend/models.py`) :

- `users` — comptes (email, hash bcrypt ou vide si Google, rôle, club associé, `is_platform_admin`, préférences du tutoriel guidé)
- `clubs` — infos club, thème, logo/signature/images publiques, site officiel, statut d'abonnement
- `members` — adhérents (licence, certificat médical, équipe, contact parent)
- `fees` — cotisations (montant, statut, échéance, lien Stripe)
- `sessions` — créneaux du planning (+ `google_event_id` si synchronisé)
- `announcements` — annonces diffusées
- `prospects` — demandes de contact reçues via la page publique
- `documents` — fichiers liés à un adhérent
- `blog_posts` — articles publiés
- `support_tickets` — signalements soumis depuis l'Aide (sujet, message, fil de réponses, statut)
- `notification_logs` — historique de tous les envois email/SMS (consultable par club ou, pour l'admin plateforme, tous clubs confondus)
- `drive_credentials` / `calendar_credentials` — jetons OAuth Google par club

---

## Notes de sécurité

- L'authentification repose sur un token JWT, porté soit par un cookie `httpOnly`/`secure`/`SameSite=None`, soit par un header `Authorization: Bearer` (stocké côté frontend en `localStorage`). Le second mode permet d'utiliser `CORS_ORIGINS=*` sans violer la règle du navigateur qui interdit `*` combiné à des requêtes avec cookies (`credentials`) — voir `frontend/src/lib/api.js` (`withCredentials: false`) et `backend/server.py` (`_parse_cors_origins`).
- Les mots de passe sont hashés avec bcrypt ; les comptes créés via Google Sign-In n'ont pas de mot de passe (login par mot de passe désactivé pour ces comptes).
- La suppression de compte (libre-service ou via l'admin plateforme) est irréversible et en cascade (`deps.delete_club_cascade`) : adhérents, cotisations, planning, annonces, blog, documents, prospects, transactions, identifiants Drive/Agenda et comptes utilisateurs liés sont tous supprimés.
- Ne jamais committer `backend/.env` ni `frontend/.env` (déjà exclus via `.gitignore`).

---

## Autres scripts (`leads/`)

Le dossier `leads/` contient un script indépendant de l'application (`extract_clubs_sportifs_rna.py`), utilisé pour de la prospection commerciale : il interroge l'API open data du **Répertoire National des Associations (RNA) d'Île-de-France** pour extraire une liste de clubs sportifs (nom, adresse, ville, site web) à des fins de démarchage. Il partitionne automatiquement les requêtes par département pour rester sous la limite de pagination de l'API (10 000 résultats). Voir le docstring en tête de fichier pour l'usage et les limites (le RNA ne contient ni téléphone ni email).
