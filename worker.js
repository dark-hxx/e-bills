/**
 * Cloudflare Worker 入口
 * - /api/records : 电费记录云端存储（KV 读写）
 * - 其余路径      : 交给静态资源（public 目录）
 */

const KV_KEY = "power-records-v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handleApi(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!env.POWER_RECORDS) {
    return json({ error: "KV not bound" }, 500);
  }

  if (request.method === "GET") {
    const data = await env.POWER_RECORDS.get(KV_KEY, { type: "json" });
    return json(data || null);
  }

  if (request.method === "PUT") {
    let records;
    try {
      records = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(records)) {
      return json({ error: "Invalid payload" }, 400);
    }
    await env.POWER_RECORDS.put(KV_KEY, JSON.stringify(records));
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/records") {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
