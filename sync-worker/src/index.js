const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, X-STEELER-Sync-Token, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}

function getOwnerId(env) {
  return env.SYNC_OWNER_ID || "steeler";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function isAuthorised(request, env) {
  const expected = env.SYNC_API_TOKEN || "";
  if (!expected) return false;
  const supplied = getBearerToken(request) || request.headers.get("X-STEELER-Sync-Token") || "";
  return supplied === expected;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normaliseRecord(input) {
  const record = input && typeof input === "object" ? input : {};
  const recordId = String(record.recordId || record.id || "").trim();
  const recordType = String(record.recordType || record.type || "").trim();
  if (!recordId || !recordType) return null;
  return {
    recordId,
    recordType,
    payload: record.payload === undefined ? record : record.payload,
    deleted: record.deleted === true,
    schemaVersion: Number(record.schemaVersion || 1),
    clientUpdatedAt: String(record.clientUpdatedAt || record.updatedAt || ""),
    lastChangedDeviceId: String(record.lastChangedDeviceId || record.deviceId || ""),
    lastChangedDeviceName: String(record.lastChangedDeviceName || record.deviceName || record.payload?.deviceName || "")
  };
}

async function touchClient(request, env, deviceId) {
  if (!deviceId) return;
  const ownerId = getOwnerId(env);
  const userAgent = request.headers.get("User-Agent") || "";
  await env.SYNC_DB.prepare(`
    INSERT INTO sync_clients (owner_id, device_id, last_user_agent)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_id, device_id) DO UPDATE SET
      last_seen_at = CURRENT_TIMESTAMP,
      last_user_agent = excluded.last_user_agent
  `).bind(ownerId, deviceId, userAgent).run();
}

async function getCurrentRevision(env) {
  const ownerId = getOwnerId(env);
  const row = await env.SYNC_DB.prepare(`
    SELECT COALESCE(MAX(server_revision), 0) AS revision
    FROM sync_records
    WHERE owner_id = ?
  `).bind(ownerId).first();
  return Number(row?.revision || 0);
}

async function handleStatus(request, env) {
  const ownerId = getOwnerId(env);
  const [revisionRow, recordCountRow, clientCountRow] = await Promise.all([
    env.SYNC_DB.prepare("SELECT COALESCE(MAX(server_revision), 0) AS revision FROM sync_records WHERE owner_id = ?").bind(ownerId).first(),
    env.SYNC_DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE owner_id = ?").bind(ownerId).first(),
    env.SYNC_DB.prepare("SELECT COUNT(*) AS count FROM sync_clients WHERE owner_id = ?").bind(ownerId).first()
  ]);

  return jsonResponse({
    ok: true,
    mode: "prototype",
    ownerId,
    serverRevision: Number(revisionRow?.revision || 0),
    recordCount: Number(recordCountRow?.count || 0),
    clientCount: Number(clientCountRow?.count || 0),
    note: "Worker prototype only; manual sync preview and backup archive/restore are connected, but automatic sync is not enabled."
  });
}

async function handlePush(request, env) {
  const body = await readJson(request);
  if (!body || !Array.isArray(body.records)) {
    return errorResponse("Expected JSON body with a records array.");
  }

  const deviceId = String(body.deviceId || "").trim();
  const deviceName = String(body.deviceName || "").trim();
  await touchClient(request, env, deviceId);

  let revision = await getCurrentRevision(env);
  const accepted = [];
  const rejected = [];
  const ownerId = getOwnerId(env);

  for (const raw of body.records) {
    const record = normaliseRecord(raw);
    if (!record) {
      rejected.push({ reason: "Missing recordId or recordType" });
      continue;
    }

    revision += 1;
    const payloadJson = JSON.stringify(record.payload);
    await env.SYNC_DB.prepare(`
      INSERT INTO sync_records (
        owner_id,
        record_id,
        record_type,
        payload_json,
        deleted,
        schema_version,
        client_updated_at,
        server_revision,
        last_changed_device_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, record_id) DO UPDATE SET
        record_type = excluded.record_type,
        payload_json = excluded.payload_json,
        deleted = excluded.deleted,
        schema_version = excluded.schema_version,
        client_updated_at = excluded.client_updated_at,
        server_updated_at = CURRENT_TIMESTAMP,
        server_revision = excluded.server_revision,
        last_changed_device_id = excluded.last_changed_device_id
    `).bind(
      ownerId,
      record.recordId,
      record.recordType,
      payloadJson,
      record.deleted ? 1 : 0,
      record.schemaVersion || 1,
      record.clientUpdatedAt,
      revision,
      record.lastChangedDeviceId || deviceId
    ).run();

    accepted.push({
      recordId: record.recordId,
      recordType: record.recordType,
      serverRevision: revision,
      deviceName: record.lastChangedDeviceName || deviceName || ""
    });
  }

  return jsonResponse({
    ok: true,
    accepted,
    rejected,
    serverRevision: revision
  });
}

async function handlePull(request, env) {
  const ownerId = getOwnerId(env);
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") || 0);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const typeFilter = String(url.searchParams.get("type") || "").trim();
  const clauses = ["owner_id = ?", "server_revision > ?"];
  const bindings = [ownerId, since];
  if (typeFilter) {
    clauses.push("record_type = ?");
    bindings.push(typeFilter);
  }
  bindings.push(limit);

  const result = await env.SYNC_DB.prepare(`
    SELECT record_id, record_type, payload_json, deleted, schema_version,
           client_updated_at, server_updated_at, server_revision, last_changed_device_id
    FROM sync_records
    WHERE ${clauses.join(" AND ")}
    ORDER BY server_revision ASC
    LIMIT ?
  `).bind(...bindings).all();

  const records = (result.results || []).map((row) => {
    const payload = JSON.parse(row.payload_json);
    return {
      recordId: row.record_id,
      recordType: row.record_type,
      payload,
      deleted: row.deleted === 1,
      schemaVersion: row.schema_version,
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.server_updated_at,
      serverRevision: row.server_revision,
      lastChangedDeviceId: row.last_changed_device_id,
      lastChangedDeviceName: payload.deviceName || payload.backup?.exportedByDeviceName || ""
    };
  });

  return jsonResponse({
    ok: true,
    records,
    serverRevision: records.length ? records[records.length - 1].serverRevision : await getCurrentRevision(env)
  });
}

async function handleRecordsSummary(request, env) {
  const ownerId = getOwnerId(env);
  const url = new URL(request.url);
  const includeBackups = url.searchParams.get("includeBackups") === "1";
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") || 500)));
  const typeFilter = String(url.searchParams.get("type") || "").trim();

  const clauses = ["owner_id = ?"];
  const bindings = [ownerId];
  if (!includeBackups) clauses.push("record_type != 'cloud-backup'");
  if (typeFilter) {
    clauses.push("record_type = ?");
    bindings.push(typeFilter);
  }
  bindings.push(limit);

  const result = await env.SYNC_DB.prepare(`
    SELECT record_id, record_type, deleted, schema_version, client_updated_at,
           server_updated_at, server_revision, last_changed_device_id
    FROM sync_records
    WHERE ${clauses.join(" AND ")}
    ORDER BY server_revision ASC
    LIMIT ?
  `).bind(...bindings).all();

  const records = (result.results || []).map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || "{}");
    } catch {
      payload = {};
    }
    return {
      recordId: row.record_id,
      recordType: row.record_type,
      deleted: row.deleted === 1,
      schemaVersion: row.schema_version,
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.server_updated_at,
      serverRevision: row.server_revision,
      lastChangedDeviceId: row.last_changed_device_id,
      lastChangedDeviceName: payload.deviceName || payload.backup?.exportedByDeviceName || ""
    };
  });

  return jsonResponse({
    ok: true,
    records,
    serverRevision: await getCurrentRevision(env)
  });
}

async function handleBackups(request, env) {
  const ownerId = getOwnerId(env);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") || 5)));

  const result = await env.SYNC_DB.prepare(`
    SELECT record_id, payload_json, client_updated_at, server_updated_at,
           server_revision, last_changed_device_id
    FROM sync_records
    WHERE owner_id = ? AND record_type = 'cloud-backup' AND deleted = 0
    ORDER BY server_revision DESC
    LIMIT ?
  `).bind(ownerId, limit).all();

  const backups = (result.results || []).map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || "{}");
    } catch {
      payload = {};
    }
    const backup = payload.backup || {};
    const backupData = backup.data || {};
    return {
      recordId: row.record_id,
      createdAt: payload.createdAt || backup.exportedAt || row.client_updated_at || "",
      appVersion: payload.appVersion || backup.appVersion || "",
      deviceId: payload.deviceId || backup.exportedByDeviceId || row.last_changed_device_id || "",
      deviceName: payload.deviceName || backup.exportedByDeviceName || "",
      passageCount: Array.isArray(backupData.passages) ? backupData.passages.length : null,
      serverUpdatedAt: row.server_updated_at,
      serverRevision: row.server_revision
    };
  });

  return jsonResponse({
    ok: true,
    backups,
    serverRevision: await getCurrentRevision(env)
  });
}

async function handleBackupDownload(request, env, recordId) {
  const cleanRecordId = String(recordId || "").trim();
  if (!cleanRecordId) return errorResponse("Missing backup record id.", 400);

  const ownerId = getOwnerId(env);
  const row = await env.SYNC_DB.prepare(`
    SELECT record_id, payload_json, client_updated_at, server_updated_at,
           server_revision, last_changed_device_id
    FROM sync_records
    WHERE owner_id = ? AND record_id = ? AND record_type = 'cloud-backup' AND deleted = 0
    LIMIT 1
  `).bind(ownerId, cleanRecordId).first();

  if (!row) return errorResponse("Cloud backup not found.", 404);

  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || "{}");
  } catch {
    return errorResponse("Cloud backup payload could not be read.", 500);
  }

  const backup = payload.backup || null;
  if (!backup || backup.format !== "steeler-data-backup") {
    return errorResponse("Cloud backup payload is not a STEELER data backup.", 500);
  }

  return jsonResponse({
    ok: true,
    recordId: row.record_id,
    backup,
    summary: {
      createdAt: payload.createdAt || backup.exportedAt || row.client_updated_at || "",
      appVersion: payload.appVersion || backup.appVersion || "",
      deviceId: payload.deviceId || backup.exportedByDeviceId || row.last_changed_device_id || "",
      deviceName: payload.deviceName || backup.exportedByDeviceName || "",
      serverUpdatedAt: row.server_updated_at,
      serverRevision: row.server_revision
    },
    note: "Downloaded backup JSON only; restore is not performed by the Worker."
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "steeler-logbook-sync",
        mode: "prototype"
      });
    }

    if (!isAuthorised(request, env)) {
      return errorResponse("Unauthorised", 401);
    }

    if (url.pathname === "/v1/status" && request.method === "GET") return handleStatus(request, env);
    if (url.pathname === "/v1/backups" && request.method === "GET") return handleBackups(request, env);
    if (url.pathname.startsWith("/v1/backups/") && request.method === "GET") {
      return handleBackupDownload(request, env, decodeURIComponent(url.pathname.slice("/v1/backups/".length)));
    }
    if (url.pathname === "/v1/records/summary" && request.method === "GET") return handleRecordsSummary(request, env);
    if (url.pathname === "/v1/records" && request.method === "GET") return handlePull(request, env);
    if (url.pathname === "/v1/records/push" && request.method === "POST") return handlePush(request, env);

    return errorResponse("Not found", 404);
  }
};
