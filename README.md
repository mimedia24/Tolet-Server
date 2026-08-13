# To-Let Platform Server v2.3

Production-oriented JavaScript/CommonJS server for the ToLet rental and direct-hire Work marketplace. It uses Node.js, Express.js, MongoDB/Mongoose, REST APIs, Socket.IO, phone OTP, JWT access tokens, rotating opaque refresh sessions, and bilingual API messages.

English is the default language. Send `Accept-Language: bn` or `X-Language: bn` for Bangla system messages. Property and job content accepts both English and Bangla translations.

## Included scope

- Name, phone and password registration with mandatory SMS OTP verification; phone/password login, password reset and legacy OTP migration path
- Phone OTP activates the account; the verified badge separately requires NID front/back, a live camera photo and Admin KYC approval
- Residential and shop/commercial property drafts, moderation, seven-day availability confirmation, Not Sure/Reserved/Rented states, re-listing and lifecycle history
- Bangladesh-focused Work profiles, two-sided Hire Center, hire invitations and direct messaging
- All 64 Bangladesh districts, required district data on new rental/Work posts, and district filtering
- Property-only bilingual smart search, nearest-first feeds when location is permitted, filters, GeoJSON support and Google Maps-ready latitude/longitude
- Favorites, reports, notifications, media upload, audit logs, and configurable expiry/feature flags
- Stable feed pagination and automatic rewriting of legacy private-LAN upload URLs to the current public server URL
- Admin moderation for properties, housing requests, jobs and worker profiles; user suspension; report resolution; settings; immutable audit history
- Realtime participant-authorized Socket.IO chat, blocking and property visit booking
- 360° panorama and GLB/GLTF/USDZ spatial media upload support
- English/Bangla content and system messages; English fallback
- Swagger UI at `/api/docs`
- Security headers, CORS allowlist, rate limits, upload validation, OTP hashing, secret validation, and graceful shutdown

Payments, digital rental agreements and paid boost billing remain optional infrastructure modules and are not activated by default.

## Requirements

- Node.js 20 or newer
- MongoDB 6 or newer (local MongoDB or MongoDB Atlas)
- An SMS provider endpoint for production OTP delivery

## Installation

```bash
npm install
cp .env.example .env
```

Edit `.env`, then initialize platform settings and the Super Admin account:

```bash
npm run seed
npm start
```

Development:

```bash
npm run dev
```

Docker deployment is also included:

```bash
cp .env.example .env
# Replace the example secrets and configure the production SMS provider first.
docker compose up -d --build
docker compose exec api npm run seed
```

The seed command does not store a default password. Set the Super Admin password through the normal verified password-reset flow.

## Important production configuration

- Set unique random values of at least 32 characters for `JWT_ACCESS_SECRET` and `OTP_HASH_SECRET`.
- Set `SMS_MODE=http` and configure the SMS endpoint parameters.
- Restrict `CORS_ORIGINS` to the real Website and Admin Panel domains.
- Set `PUBLIC_BASE_URL` to the public API URL.
- Use managed object storage instead of the included local upload adapter when running multiple server instances.
- Restrict Google Maps keys in the Website/Mobile clients; this server stores only location/address/coordinates.
- Back up MongoDB and test restoration before launch.

The server refuses to start in production when required secrets, SMS settings, or allowed origins are unsafe or missing.

In development only, localhost and private-LAN origins (`10.x`, `172.16-31.x`, `192.168.x`) are accepted so the Vite Network URL can be tested from a phone. Production remains restricted to `CORS_ORIGINS`.

## Language contract

- Default: English (`en`)
- Bangla: `Accept-Language: bn` or `X-Language: bn`
- Listing content example:

```json
{
  "translations": {
    "en": {
      "title": "Three bedroom apartment",
      "description": "A bright apartment in Mohammadpur."
    },
    "bn": {
      "title": "তিন বেডরুমের ফ্ল্যাট",
      "description": "মোহাম্মদপুরে আলো-বাতাসপূর্ণ ফ্ল্যাট।"
    }
  }
}
```

Public responses return localized `title` and `description`. Owners/Admins can request both translations using `?includeTranslations=true`.

## Main API groups

| Base path | Purpose |
| --- | --- |
| `/api/v1/auth` | Password registration/login, OTP verification/reset, refresh, logout |
| `/api/v1/properties` | Public property search and owner listing lifecycle |
| `/api/v1/jobs` | District/address jobs with optional daily or disclosed pay |
| `/api/v1/housing-requests` | User-posted housing needs and matching owner offers |
| `/api/v1/workers` | Work profiles and direct hire invitations |
| `/api/v1/search/smart?scope=PROPERTY` | Property-only bilingual smart search |
| `/api/v1/favorites` | Saved properties/jobs |
| `/api/v1/reports` | User reports |
| `/api/v1/notifications` | Notification inbox/read state |
| `/api/v1/chat` | Conversations/messages (feature flag) |
| `/api/v1/visits` | Property visit requests (feature flag) |
| `/api/v1/uploads` | Images, private NID, live-camera photo, 360° panorama and 3D model uploads |
| `/api/v1/meta` | Categories, amenities, feature flags and languages |
| `/api/v1/admin` | Moderation, users, reports, settings, audit logs |

Use `Authorization: Bearer <accessToken>` on protected routes. See `/api/docs` or `docs/openapi.yaml` for the endpoint contract.

## Status workflows

Property:

`DRAFT -> PENDING_REVIEW -> ACTIVE -> RESERVED -> RENTED`

Admin may set `CHANGES_REQUIRED`, `REJECTED`, or `SUSPENDED`. Approved listings receive a configurable expiry date.

Job:

`DRAFT -> PENDING_REVIEW -> ACTIVE -> FILLED/CLOSED/EXPIRED`

Application:

`APPLIED -> VIEWED -> SHORTLISTED -> HIRED` with `REJECTED` and `WITHDRAWN` alternatives.

Worker profile:

`DRAFT -> PENDING_REVIEW -> ACTIVE/PAUSED`; an employer can send a direct hire invitation which the worker accepts or declines.

## Existing database upgrade

Back up MongoDB, deploy the new code, run `npm run migrate:v2` if upgrading from v1, then run `npm run migrate:v2.2` once. Version 2.2 adds rental freshness/history fields, removes Job Urgent, infers optional pay disclosure, and resets legacy verified badges that do not have complete KYC evidence. Legacy users without a password can set one through the verified password-reset flow.

## Verification

```bash
npm run check
```

`npm run check` runs ESLint and the unit/API smoke tests. Database integration requires a configured MongoDB instance; schema validation and database-independent HTTP behavior are covered by the included test suite.

## Demo data for testing

The demo seed is isolated from real accounts by a reserved phone range. It creates or updates the same deterministic records every time, so running it again does not create duplicates.

- 100 active, phone-verified demo users
- 100 active rental posts: 50 Room Rent and 50 Shop Rent
- 100 active Work profiles spread across every approved Work category
- All 64 Bangladesh districts represented in both rental and Work data
- No image files are required; the Website displays its property placeholder

Preview without connecting to MongoDB:

```bash
npm run demo:preview
```

Insert/update the demo data in the database configured by `MONGODB_URI`:

```bash
npm run demo:seed
```

In development, the default login password is `Demo@12345`. Demo phone numbers run from `+8801999000001` through `+8801999000100`. Set a different shared password before seeding when needed:

```bash
DEMO_SEED_PASSWORD="YourDemoPassword123" npm run demo:seed
```

PowerShell:

```powershell
$env:DEMO_SEED_PASSWORD="YourDemoPassword123"
npm run demo:seed
```

Remove only this script's demo accounts and their related rental, Work, chat, favorite, invitation, notification, session and visit records:

```bash
npm run demo:clear
```

The script refuses to write to `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is explicitly set. Enable it only for a disposable staging/demo database, never for the real production database.

## বাংলা সংক্ষিপ্ত নির্দেশনা

`.env.example` কপি করে `.env` তৈরি করুন, MongoDB ও SMS API তথ্য বসান, তারপর `npm install`, `npm run seed`, এবং `npm start` চালান। API-এর ডিফল্ট ভাষা ইংরেজি। বাংলা message পেতে request header-এ `X-Language: bn` দিন। Production-এ `SMS_MODE=console` ব্যবহার করা যাবে না।
