# Local fork: Foundry14 login and read-only sheet

Based on tag3.4.1. No dependency manifest/lockfile changes.

The native join form can use userId (Foundry14) or userid (older Foundry).
The worker now reads the actual select name and sends that exact field in POST /join.
Name lookup remains case-insensitive and scoped to the requested option. Missing,
empty,disabled or already-active options are rejected before submitting credentials.
An empty password is still sent explicitly; no retries against other users.

Verification:

-15Chrome-driven local httptest cases: both spellings, exact POST, password escaping
and empty values, requested user matching, missing/active options.
-The userId case fails against baseline HEAD and passes the fork.
-Whole Go suite passes with TEST_DATABASE_URL unset; PostgreSQL tests skip.
-Static Linux build passes; module/Go dependencies remain unchanged.
-Real public HTTPS on Foundry14.369: session-handshake/start-session created a working
headless module connection, end-session closed it, temporary GM removed. Ordinary
automation browser restored online.13.4seconds including setup/cleanup.
-One paired world shares one client ID. The real probe first stopped the normal bot
after creating its temporary GM, then started the headless session. Running a second
session while the same ID is already connected cannot satisfy LaunchSession's
new-client polling contract. No timeout was increased.

The installed runtime image preserves the previous pinned base and overlays only the
new static binary; see go-relay/Dockerfile.local-overlay. Example build:

    cd go-relay
    CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o /path/to/context/relay ./cmd/server/
    cp Dockerfile.local-overlay /path/to/context/Dockerfile
    docker build -t foundry-rest-api-relay:local /path/to/context

Preserve the existing environment, data volume and loopback port when replacing the
container. Do not publish credentials or change the system/core to install this fork.
The local deployment keeps its existing durable automation browser service; this
change does not silently replace its reconnect mechanism with an in-memory session.

The standalone companion is in examples/player-sheet. It has native Player login,
assigned-character/Owner checks and fixed read routes. It displays prepared movement,
unit and initiative, including zero. It does not load the canvas or implement rules.
See its README for deployment, fixtures, privacy and physical-device limitations.
