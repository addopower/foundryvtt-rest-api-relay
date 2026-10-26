# Read-only player sheet

Standalone HTML/Node app for the paired Foundry world. It does not load the Foundry
client, canvas or map on the phone. No additional Node packages.

Displays HP, AC, six abilities and saves, eighteen skills, proficiency, final prepared
walking speed with its unit, and prepared initiative bonus. No rolls, edits or builder.

## Run

Copy this directory into a deployment directory. Create access.json outside Git,
readable only by the service user (0600):

    {
      "apiKey": "DEDICATED_RELAY_KEY",
      "relayUrl": "http://127.0.0.1:43110",
      "clientId": "PAIRED_WORLD_CLIENT_ID",
      "world": "WORLD_ID",
      "origin": "https://your-foundry.example",
      "foundryUrl": "http://127.0.0.1:30000"
    }

The relay key needs user:read, entity:read and dnd5e, bound to this client.
The relay's dnd5e scope is broad; this app exposes only fixed read operations.
Never serve the key to the browser. Start with "node server.mjs". CONFIG can point
to another config file. PORT defaults to43111, listening only on loopback.
See service.example and nginx.example; adjust paths, user and origin.
The public route is /scheda/ with a trailing slash.

A connected GM module client is still required. This companion does not replace
the Foundry rule engine or implement a second character database.

## Login and specific character

The native Foundry /join endpoint validates the existing Player/Trusted password.
Empty passwords are supported. Validation sends Origin matching the native URL.
It never forwards/replaces the desktop Foundry cookie. The sheet uses its own
HttpOnly/Secure/SameSite cookie, eight-hour RAM session and separate logout.
A service restart requires another sheet login.

The Master must configure **both**:

- Owner permission on the character Actor.
- The account's **Character** field in Foundry user configuration.

The server resolves this assignment on every read, checks Owner permission and
passes the authenticated player ID to the detail endpoint. Arbitrary actor IDs
cannot be requested. Missing assignment/permission have explicit states.
Role revocation and expiry clear the sheet on the next read.

The visible page refreshes every five seconds, serially, with manual refresh.
On network failure old values are marked potentially stale. Zero remains zero;
missing/nonfinite values are dashes. All values come from the system's prepared
actor, including deterministic bonuses and movement conditions.

## Verification

"node --test tests/server.test.mjs" uses a synthetic transport: native login contract,
zero/final speed and initiative, assignment/ownership, expiry/revocation, world
mismatch/outage, per-user password limit, origin and minimal projection.

tests/live.py is an opt-in integration script for the existing local harness.
Requires Python Playwright, helper set by FOUNDRY_TEST_HELPER and a **synthetic**
actor receipt via FOUNDRY_SYNTHETIC_ACTOR. SHEET_URL selects the authorized HTTPS
deployment. Never use a real PC as fixture. Setup/mutations use temporary
actors/users; login and reading use the real browser. Exact fixture IDs are removed
and all preexisting world documents compared before/after.

Verified26October2026: Foundry14.369, dnd5e6.0.6, module3.4.1-addopower.1:
15/15 HTTPS checks, desktop and Android touch emulation320/390/1440px; values equal
native prepared actor:45ft with bonus, grappled0,9m,initiative+6/+0,HP polling,
logout/reload,revokedOwner,noassignment,simultaneous native desktop session.
Preexisting documents unchanged; independent code/evidence review GO.
Physical phones and Safari are not validated.

The discarded companion projected speed/initiative as null. The original relay
already returned30/+3 for the existing actor through legacy shims. The module
fork's canonical movement path and explicit unit improve compatibility; restoration
removes those placeholders. Initiative was not renamed.

## Visual restoration

Previous paper/ink character-sheet layout: light background, serif headings,
tabular numbers, green controls, responsive ability grid and skill list.
Runtime text uses textContent. Detector reports one intentional cream-palette warning.
