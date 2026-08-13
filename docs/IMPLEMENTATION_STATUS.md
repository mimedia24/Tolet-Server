# Implementation Status

Release: 2.2.0 candidate

## Complete server modules

- Password registration/login with mandatory OTP verification, reset flow, lockout controls and hashed OTP storage
- JWT access tokens, rotating/revocable refresh sessions, logout-all
- User profiles, four capabilities, Admin roles, suspension and identity verification
- Residential and commercial property CRUD, moderation, lifecycle, expiry, map/search/filter, privacy-aware location and contact
- Family/Bachelor/student/corporate tenant targeting and Bangladesh utility/listing attributes
- Moderated “বাসা চাই” housing requests and owner property offers
- Expanded property jobs, worker profiles, hire invitations, moderation and applicant workflow
- Favorites, reports, notifications, image uploads and analytics counters
- Admin dashboard, review queues, settings, feature flags and audit log
- Bilingual intent-aware smart search and nearest-first property/job/request/worker discovery
- Participant-authorized realtime Chat/Socket.IO with blocking and visit booking
- 360 panorama and portable 3D model upload endpoints
- English-default and Bangla API messages/content fallback
- Swagger/OpenAPI, seeding, expiry scheduler, Docker deployment and automated checks

## Optional infrastructure not activated by default

- Services marketplace
- Rent payment and digital rental agreements
- Paid boost/wallet billing
- Professional Matterport-grade scanning (the platform accepts 360 panoramas and GLB/GLTF/USDZ models)

The database and SMS provider are external infrastructure and therefore are configured through `.env`; no credential is included in this project.
