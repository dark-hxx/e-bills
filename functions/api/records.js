/**
 * Cloudflare Pages Functions API
 * 提供电费记录的云端存储接口
 */

const KV_KEY = "power-records-v1";

export async function onRequestGet(context) {
  try {
    const { POWER_RECORDS } = context.env;
    if (!POWER_RECORDS) {
      return new Response(JSON.stringify({ error: "KV not bound" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await POWER_RECORDS.get(KV_KEY, { type: "json" });
    return new Response(JSON.stringify(data || null), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestPut(context) {
  try {
    const { POWER_RECORDS } = context.env;
    if (!POWER_RECORDS) {
      return new Response(JSON.stringify({ error: "KV not bound" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const records = await context.request.json();
    if (!Array.isArray(records)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await POWER_RECORDS.put(KV_KEY, JSON.stringify(records));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
