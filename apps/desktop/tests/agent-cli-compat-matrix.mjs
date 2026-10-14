import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import nacl from "tweetnacl";
import {
  ATTRIBUTION_CAPABILITY,
  COMPANION_CAPABILITY_FILE_COMMENTS_REVIEW_NOTES,
  COMPANION_PROTOCOL_VERSION,
  encodeBase64Url,
  openEnvelope,
  sealEnvelope
} from "../../../packages/companion-protocol/dist/index.js";

function assertLegacy(value) {
  if (Array.isArray(value)) return value.forEach(assertLegacy);
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assert.ok(
      !["createdBy", "lastEditedBy", "noteVersion", "actor", "editedByHuman"].includes(
        key
      ),
      `Legacy companion response contains ${key}`
    );
    assertLegacy(entry);
  }
}

/** Exercise the fixture application's real companion, without persisted device keys. */
export async function runCompatMatrix({
  cli,
  createProfile,
  repository,
  browser,
  selected,
  open,
  fixture,
  results
}) {
  const repo = await repository(
    "companion compatibility",
    "old one\nold two\nold three\n",
    "new one\nnew two\nnew three\n"
  );
  const profile = await createProfile("companion-compatibility");
  await open(profile, repo.path);
  const gui = await browser(profile);
  const page = await selected(gui, repo.path, path.basename(repo.path));
  const context = (await cli(profile, ["review", "inspect", "--repo", repo.path])).result;
  const file = (
    await cli(profile, [
      "review",
      "file",
      "--context",
      context.contextId,
      "--path",
      "tracked.txt"
    ])
  ).result;
  const actor = { name: "Compatibility reviewer", runId: randomUUID() };
  const attributedActor = { kind: "agent", ...actor };
  const items = [
    {
      kind: "line",
      path: "tracked.txt",
      diffHash: file.diffHash,
      side: "additions",
      lineStart: 1,
      lineEnd: 1,
      body: "Compatibility line"
    },
    {
      kind: "line",
      path: "tracked.txt",
      diffHash: file.diffHash,
      side: "deletions",
      lineStart: 1,
      lineEnd: 2,
      body: "Compatibility range"
    },
    {
      kind: "file",
      path: "tracked.txt",
      diffHash: file.diffHash,
      body: "Compatibility file"
    },
    {
      kind: "overall",
      expectedNoteVersion: context.noteVersion,
      body: "Compatibility overall"
    }
  ];
  const input = path.join(fixture, "companion-compatibility-feedback.json");
  await writeFile(input, JSON.stringify({ actor, requestId: randomUUID(), items }));
  const receipt = (
    await cli(profile, [
      "feedback",
      "submit",
      "--context",
      context.contextId,
      "--input",
      input
    ])
  ).result;
  assert.equal(receipt.itemIds.length, 4);

  try {
    const state = await page.evaluate(() => window.difftray.setCompanionEnabled(true));
    assert.equal(state.status, "running", "fixture companion must start");
    assert.ok(Number.isInteger(state.port) && state.port > 0);
    const baseUrl = `http://127.0.0.1:${state.port}`;
    const handshakeResponse = await fetch(`${baseUrl}/companion/v1/handshake`, {
      signal: AbortSignal.timeout(10_000)
    });
    assert.equal(handshakeResponse.status, 200);
    const handshake = await handshakeResponse.json();
    const pairing = await page.evaluate(() => window.difftray.startCompanionPairing());
    assert.equal(handshake.serverId, pairing.qrPayload.serverId);
    assert.equal(handshake.serverPublicKey, pairing.qrPayload.serverPublicKey);
    const keys = nacl.box.keyPair();
    const devicePublicKey = encodeBase64Url(keys.publicKey);
    const deviceSecretKey = encodeBase64Url(keys.secretKey);
    const exchange = async (route, plaintext, requestId) => {
      const envelope = sealEnvelope({
        devicePublicKey,
        plaintext,
        recipientPublicKey: handshake.serverPublicKey,
        senderSecretKey: deviceSecretKey
      });
      const response = await fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: { "content-type": "application/x-difftray-envelope" },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(10_000)
      });
      assert.equal(response.status, 200, "fixture encrypted transport must succeed");
      const opened = openEnvelope({
        envelope: await response.json(),
        ...(requestId ? { expectedRequestId: requestId } : {}),
        recipientSecretKey: deviceSecretKey,
        senderPublicKey: handshake.serverPublicKey
      });
      assert.equal(opened.ok, true, "fixture response must authenticate and decrypt");
      return opened.value;
    };
    const paired = await exchange("/companion/v1/pair", {
      deviceId: randomUUID(),
      deviceName: "Ephemeral compatibility client",
      devicePublicKey,
      platform: "ios",
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      secret: pairing.qrPayload.secret
    });
    assert.equal(paired.status, "approved");
    const projectRoute = `/companion/v1/projects/${encodeURIComponent(context.projectId)}`;
    for (const supportsAttribution of [false, true]) {
      const request = async (route) => {
        const requestId = randomUUID();
        const response = await exchange(
          route,
          {
            method: "GET",
            path: route,
            requestId,
            ts: new Date().toISOString(),
            capabilities: [
              COMPANION_CAPABILITY_FILE_COMMENTS_REVIEW_NOTES,
              ...(supportsAttribution ? [ATTRIBUTION_CAPABILITY] : [])
            ]
          },
          requestId
        );
        assert.equal(response.status, 200);
        if (!supportsAttribution) assertLegacy(response.body);
        return response.body;
      };
      const { workspace } = await request(`${projectRoute}/workspace`);
      assert.equal(workspace.comments.length, 2);
      assert.equal(workspace.fileComments.length, 1);
      const comments = [...workspace.comments, ...workspace.fileComments];
      for (const item of items.slice(0, 3)) {
        const comment = comments.find((entry) => entry.body === item.body);
        assert.ok(comment, `Companion must deliver ${item.body}`);
        if (item.kind === "line") {
          assert.equal(comment.lineStart, item.lineStart);
          assert.equal(comment.lineEnd, item.lineEnd);
        }
        if (supportsAttribution) {
          assert.deepEqual(comment.createdBy, attributedActor);
          assert.deepEqual(comment.lastEditedBy, attributedActor);
        }
      }
      assert.equal(workspace.reviewNote.body, items[3].body);
      if (supportsAttribution) {
        assert.deepEqual(workspace.reviewNote.lastEditedBy, attributedActor);
        assert.equal(workspace.noteVersion, receipt.noteVersion);
      }
      const listed = await request(`${projectRoute}/comments`);
      assert.equal(listed.comments.length, 2);
      if (supportsAttribution) {
        for (const comment of listed.comments) {
          assert.deepEqual(comment.createdBy, attributedActor);
          assert.deepEqual(comment.lastEditedBy, attributedActor);
        }
      }
    }
    results.push(
      "actual packaged companion encrypted legacy/current capability matrix: CLI line, range, file and overall attribution"
    );
  } finally {
    const stopped = await page.evaluate(() => window.difftray.setCompanionEnabled(false));
    assert.equal(stopped.status, "stopped", "owned fixture companion must stop");
  }
}
