# Chat push notification deployment

The application persists every chat notification in MongoDB and uses Firebase Cloud Messaging for Android and iOS delivery. FCM delivery is retried from durable `PushDelivery` records; the notification inbox remains authoritative if an operating system suppresses a push.

## Firebase setup

1. Create one Firebase project and register Android package `com.tolet.bangladesh` and iOS bundle id `com.tolet.bangladesh`.
2. Place `google-services.json` at `tolet-app/android/app/google-services.json`.
3. Place `GoogleService-Info.plist` at `tolet-app/ios/ToLetMobile/GoogleService-Info.plist` and add it to the Xcode application target.
4. Upload the Apple Push Notification service authentication key in Firebase Console and enable Push Notifications plus Background Modes / Remote notifications for the iOS target.
5. Download a Firebase Admin service account JSON to a server-only secret mount. Never commit it.

## Server configuration

```dotenv
ENABLE_PUSH_NOTIFICATIONS=true
FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase-service-account.json
PUSH_TOKEN_ENCRYPTION_KEY=replace-with-a-unique-random-secret-of-at-least-32-characters
PUSH_WORKER_INTERVAL_SECONDS=5
PUSH_DELIVERY_TTL_HOURS=24
PUSH_STALE_DEVICE_DAYS=35
```

Run `npm run migrate:push` once before enabling push in production. Deploy the server before releasing the new app so the device registration endpoints are available. The server refuses to boot in production if push is enabled without a readable credential path or a sufficiently long encryption key.

## Verification

- Sign in to the same receiver account on two physical devices and confirm both registrations exist.
- Send a chat message with the receiver app foregrounded, backgrounded, and force-closed.
- Confirm an open conversation suppresses the foreground banner, while another conversation shows it.
- Tap a background and cold-start notification and confirm the correct conversation opens.
- Temporarily deny network access to the server, restore it, and confirm a `RETRY` delivery reaches `SENT`.
- Log out one device and confirm only that installation is disabled.
