# Write or Go Broke

A mobile-friendly 30-day standup writing challenge signup site for Vercel.
Static assets live in public/; api/ contains serverless signup and removal functions.

## Storage

Signups are JSON documents in a private Vercel Blob store connected to this project.
BLOB_READ_WRITE_TOKEN is server-only and injected by Vercel. Hashed email paths,
non-overwriting uploads and conditional deletion preserve duplicates and removal
matching. Persistent private counters limit an IP to 20 requests per 10 minutes;
optimistic concurrency prevents simultaneous requests from bypassing the counter.
No contact details, credentials or storage URLs are exposed to the browser or GitHub.
Existing records in the previous Sites deployment are left intact.

## Deploy

Import the repository into Vercel and connect its private Blob store. The included
vercel.json builds public/ plus API functions. Builds fail if the storage binding is
missing. No external database integration or schema migration is needed.

## Validation

npm ci; npm test. npm run build requires the connected store environment variable.
API checks cover validation, duplicates, removal matching, rate limits and failures.

## Scope

Email/phone signup with separate SMS consent is active. Messages, payments, check-ins,
proof uploads and payouts are not activated. The leaderboard is clearly a sample.
Ray Lau is credited as the quoted comedian, using wording supplied by the user.

## Owner dashboard

/admin lists real signups and manually tracks full $150 Venmo payments. The owner
access link carries a random access key in its URL fragment, which is removed from
browser history before a same-origin sign-in request. The key is stored only as an
encrypted production environment variable. It is never embedded in public source.
A signed, Secure, HttpOnly, SameSite=Strict cookie lasts 7 days. Every admin API
authenticates the session; write requests also require a matching HTTPS origin.
Private responses are never cached. Payment documents live under payments/ in the
existing private store. Conditional writes prevent stale tabs from overwriting
changes. Payment marks are manual, reversible, and never initiate a money transfer.

Keep the owner link private. Rotating ADMIN_ACCESS_KEY invalidates existing sessions.

Paid participants can be explicitly enrolled in the founding challenge. Enrollment is
stored alongside payment state with a cohort ID and timestamp. Unpaid enrollment is
rejected server-side. Undoing payment clears enrollment; undoing enrollment preserves
payment. Existing paid records remain unenrolled until the owner chooses to enroll.

## Participant login and daily check-ins

/challenge supports a password with either signup email or US phone. No phone/email
knowledge alone can claim an existing record. After paid enrollment, the admin
creates a private 72-hour setup/reset link and sends it to that signup contact.
The one-use token is stored as a hash, consumed with an ETag-conditional write,
and removed from browser history before activation. Passwords use salted scrypt.
Sessions are Secure/HttpOnly/SameSite cookies, independently signed with the
PARTICIPANT_SESSION_SECRET environment variable. Resetting the password revokes
old sessions; account access is tied to the signup creation timestamp.

Login attempts are limited by IP and contact. Shared phone numbers must use email.
Participants can see only their own writing record. Check-ins require current paid
enrollment and a server-confirmed active challenge date. The server derives today's
date from the configured cohort timezone; clients cannot choose past/future dates.
One immutable check-in document per person/date makes repeat requests idempotent.
No automatic payments, forfeiture transfers, email/SMS delivery or reminders run.

The owner configures the October 19 start and chooses the deadline timezone under
Challenge schedule. Check-ins stay closed until both values are confirmed. Settings
lock when the challenge starts. The cohort is exactly 30 calendar days, including
DST transitions. Each check-in confirms at least 10 minutes of standup writing.
