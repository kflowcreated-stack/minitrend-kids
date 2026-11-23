const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjiat7rNkOGkQYjf3RT6rC4g5AdXiVtraecqUTG8wXcu4l6Dm1mmtnXpVhaxjAzsrd/exec";
const EDGE_CACHE_SECONDS = 60;
const BROWSER_CACHE_SECONDS = 30;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const bypassCache = url.searchParams.get("nocache") === "1";
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/products`, { method: "GET" });

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  };

  // 1. Cloudflare Edge Cache ထဲ ရှိနေပြီးသားဆိုရင် ချက်ချင်းပြန်ပေးမည်
  if (!bypassCache) {
    try {
      const cachedRes = await cache.match(cacheKey);
      if (cachedRes) {
        const hitHeaders = new Headers(cachedRes.headers);
        hitHeaders.set("X-Cache-Status", "HIT");
        return new Response(cachedRes.body, {
          status: cachedRes.status,
          headers: hitHeaders
        });
      }
    } catch (e) {}
  }

  // 2. Google Apps Script မှ ပစ္စည်းစာရင်းအသစ် ဆွဲယူခြင်း (12 စက္ကန့် Timeout ကာကွယ်ချက်ပါ)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const upstreamRes = await fetch(
      `${APPS_SCRIPT_URL}?action=getProducts&t=${Date.now()}`,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      }
    );
    clearTimeout(timer);

    // Error ကာကွယ်ချက် ၁ — HTTP Error တက်ပါက Cache မသိမ်းဘဲ Error ပြန်မည်
    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ status: "error", message: "Upstream HTTP " + upstreamRes.status }),
        { status: 502, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
      );
    }

    const text = await upstreamRes.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      // Error ကာကွယ်ချက် ၂ — Google HTML Error စာမျက်နှာဖြစ်နေပါက Cache လုံးဝမသိမ်းပါ
      return new Response(
        JSON.stringify({ status: "error", message: "Invalid JSON from upstream" }),
        { status: 502, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
      );
    }

    // Error ကာကွယ်ချက် ၃ — ပစ္စည်းစာရင်း အစစ်အမှန် ပါမှသာ Cache သိမ်းမည်
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return new Response(
        JSON.stringify({ status: "error", message: "Empty or invalid product rows" }),
        { status: 502, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
      );
    }

    const edgeCachedRes = new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Cache-Control": `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`,
        "X-Cache-Status": "MISS"
      }
    });

    // Cloudflare Edge Cache ထဲ ၆၀ စက္ကန့် သိမ်းဆည်းခြင်း
    context.waitUntil(cache.put(cacheKey, edgeCachedRes.clone()).catch(() => {}));

    // Admin မှ ?nocache=1 ဖြင့် ခေါ်ပါက Browser Cache မခံဘဲ တိုက်ရိုက်ပြန်ပေးမည်
    if (bypassCache) {
      return new Response(text, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
          "X-Cache-Status": "BYPASS-REFRESH"
        }
      });
    }

    return edgeCachedRes;
  } catch (err) {
    clearTimeout(timer);
    return new Response(
      JSON.stringify({ status: "error", message: "Upstream fetch timeout or failed" }),
      { status: 504, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    );
  }
}
