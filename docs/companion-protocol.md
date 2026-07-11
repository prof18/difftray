# Companion Protocol

The source of truth for the wire contract is the
[`@difftray/companion-protocol`](../packages/companion-protocol) package. It
exports the protocol version, TypeScript request/response/event types, body
parsers, public-key fingerprints, and the `sealEnvelope` / `openEnvelope`
helpers used by both the desktop server and mobile companion.

This document summarizes the current v1 desktop server behavior for client
implementers and reviewers. Update the package first when the contract changes,
then update this overview.

## Transport

The desktop companion server is disabled by default. When enabled, it binds to
the configured companion port, falling back within `48620-48629`, and advertises
Bonjour/mDNS service `_difftray._tcp`. Pairing payloads can also include LAN and
Tailscale MagicDNS addresses.

The public unauthenticated endpoint is:

- `GET /companion/v1/handshake`

It returns the desktop app version, protocol version, server id, server name,
server public key, and whether pairing is open. All pairing and authenticated
payloads after that are encrypted envelopes.

## Pairing

Each desktop install has a persisted X25519 server keypair. Each mobile device
has its own X25519 keypair and sends the public key during pairing.

Pairing starts from the desktop settings screen and lasts five minutes. The QR
flow sends a one-time secret in the QR payload and is approved immediately when
the secret matches. The manual-code flow sends the six-digit code, creates a
pending request, and requires desktop approval after the user compares the
device public-key fingerprint shown in the settings UI. Wrong manual-code
attempts lock the active session after three failures.

Pair requests are sent to:

- `POST /companion/v1/pair`

The request body is an encrypted envelope addressed to the server public key.
The response is encrypted back to the device public key.

## Envelopes

Encrypted envelopes have this outer shape:

```ts
type EncryptedEnvelope = {
  readonly box: string;
  readonly devicePk: string;
  readonly nonce: string;
  readonly v: 1;
};
```

`box` and `nonce` are base64url values produced with `tweetnacl` public-key
boxes. Authenticated HTTP requests encrypt this plaintext shape:

```ts
type EnvelopeRequestPlain = {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
  readonly requestId: string;
  readonly ts: string;
};
```

The server validates the registered device public key, route-bound `method` and
`path`, a five-minute timestamp skew window, and nonce replay within a bounded
ten-minute replay cache. Authenticated responses encrypt the matching
`requestId`, status, timestamp, and response body.

## Authenticated API

Authenticated routes use the real HTTP path, but the logical method and body are
inside the encrypted envelope. Current routes cover:

- Project list and workspace loading.
- File diff loading, including text, binary, mode-only, symlink, submodule, and
  rename metadata.
- Mark/unmark reviewed with stale-diff rejection when the displayed diff hash no
  longer matches the current workspace.
- Comment list/create/update/delete and comment report generation.
- Branch/commit target discovery and diff-target switching.

The WebSocket endpoint is:

- `WS /companion/v1/events`

The first frame must be an encrypted auth envelope from a paired device. Server
events are then encrypted per connected device. Events include `hello`,
`workspace_changed`, `device_revoked`, `server_stopping`, and encrypted `pong`
responses to client `ping` frames.

## Security Model

An unauthenticated network observer can see the desktop host, chosen companion
port, HTTP paths, packet timing and sizes, Bonjour service metadata, and the
plaintext handshake identity metadata. Encrypted envelopes also expose the
sender device public key, nonce, and envelope version. Observers cannot decrypt
project lists, local repository paths, file paths, diff contents, comments,
review state, comment reports, WebSocket events, or pairing responses without
the paired device secret key.

A paired device is trusted to view and update review workflow state for projects
already opened in Difftray. It is not given shell execution, Git credential
access, staging/fetch/push controls, or arbitrary file reads. File paths are
validated as safe relative paths before diff lookup.

Revoking a device in desktop settings prevents future authenticated requests
from that device public key. Existing clients should also treat
`device_revoked`, `server_stopping`, protocol mismatches, and envelope-open
failures as reasons to disconnect and require user action.
