// Supabase Edge Function "strava": copies your Strava runs into the planner.
//
// What it does:
//   - "connect":    swaps the code Strava gives the app for sign-in tokens, saves
//                   them, sets up Strava's webhook, and copies runs since FIRST_DAY.
//   - "sync":       copies any runs it hasn't seen yet (the app calls this when opened).
//   - "disconnect": signs out of Strava and deletes the copied runs and tokens.
//   - Strava webhook: Strava calls this when you finish, edit or delete an activity.
//
// Only runs are copied (Run, Trail run, Virtual run). Rides, gym and everything else
// are ignored.
//
// Secrets it needs (Supabase > Edge Functions > Secrets):
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET  (from strava.com/settings/api)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// "Verify JWT" must be OFF for this function, because Strava's webhook calls it
// without a Supabase login. The code checks your login itself for app actions.

import { createClient } from "npm:@supabase/supabase-js@2";

const FIRST_DAY = "2026-11-15"; // nothing earlier is copied
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = serviceKey();
const CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";
const CALLBACK = SB_URL + "/functions/v1/strava";
const API = "https://www.strava.com/api/v3";

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { return ""; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
// The webhook's verify token: derived from the client secret, so there's one less secret to set.
async function verifyToken(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sub20:" + CLIENT_SECRET));
  return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // Strava checking the webhook address when it is set up.
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === await verifyToken()) {
      return json({ "hub.challenge": url.searchParams.get("hub.challenge") });
    }
    return json({ ok: true, note: "Strava sync for the Sub-20 planner" });
  }
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // A webhook event from Strava: reply straight away (Strava wants an answer
  // within 2 seconds) and do the work in the background.
  if (body && body.object_type && body.owner_id) {
    const work = handleEvent(body).catch((e) => console.error("webhook", e));
    // @ts-ignore EdgeRuntime exists on Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
    return json({ ok: true });
  }

  // Everything else comes from the app and needs your Supabase login.
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Supabase > Edge Functions > Secrets." }, 500);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await db.auth.getUser(jwt);
  if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
  const userId = u.user.id;

  try {
    if (body.action === "connect") return json(await connect(userId, String(body.code ?? "")));
    if (body.action === "sync") return json(await sync(userId));
    if (body.action === "disconnect") return json(await disconnect(userId));
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(body.action, e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/* ---------- app actions ---------- */

async function connect(userId: string, code: string) {
  if (!code) throw new Error("No code from Strava");
  const t = await tokenRequest({ grant_type: "authorization_code", code });
  const scope = String(t.scope ?? "");
  if (!/activity:read/.test(scope)) throw new Error("Strava didn't give permission to read activities. Connect again and leave “View data about your activities” ticked.");
  const a = t.athlete ?? {};
  // One Strava account per app login: drop any older link to the same Strava account.
  await db.from("strava_tokens").delete().eq("athlete_id", a.id).neq("user_id", userId);
  const { error } = await db.from("strava_tokens").upsert({
    user_id: userId, athlete_id: a.id, athlete_name: [a.firstname, a.lastname].filter(Boolean).join(" "),
    access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, scope,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  const webhook = await ensureWebhook();
  const res = await sync(userId);
  return { ...res, webhook };
}

async function sync(userId: string) {
  const tok = await getTokens(userId);
  if (!tok) return { connected: false };
  const access = await freshAccess(tok);
  // Start a day before the newest run we have, so nothing slips through.
  const { data: last } = await db.from("strava_runs").select("data").eq("user_id", userId)
    .order("id", { ascending: false }).limit(1);
  const fromDay = last?.[0]?.data?.date && last[0].data.date > FIRST_DAY ? last[0].data.date : FIRST_DAY;
  const after = Math.floor(Date.parse(fromDay + "T00:00:00Z") / 1000) - 86400;
  let added = 0;
  for (let page = 1; page <= 5; page++) {
    const list = await stravaGet(access, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
    if (!Array.isArray(list) || !list.length) break;
    for (const act of list) if (await saveActivity(userId, act)) added++;
    if (list.length < 100) break;
  }
  await db.from("strava_tokens").update({ last_sync: new Date().toISOString() }).eq("user_id", userId);
  return { connected: true, athlete: tok.athlete_name, added, lastSync: new Date().toISOString() };
}

async function disconnect(userId: string) {
  const tok = await getTokens(userId);
  if (tok) {
    try {
      await fetch("https://www.strava.com/oauth/revoke", {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tok.refresh_token }),
      });
    } catch (e) { console.warn("revoke", e); }
  }
  await db.from("strava_runs").delete().eq("user_id", userId);
  await db.from("strava_tokens").delete().eq("user_id", userId);
  return { connected: false };
}

/* ---------- webhook ---------- */

async function handleEvent(ev: any) {
  const { data: tok } = await db.from("strava_tokens").select("*").eq("athlete_id", ev.owner_id).maybeSingle();
  if (!tok) return;
  if (ev.object_type === "athlete") {
    // You removed the app from your Strava settings.
    if (ev.updates?.authorized === "false") await db.from("strava_tokens").delete().eq("user_id", tok.user_id);
    return;
  }
  if (ev.object_type !== "activity") return;
  if (ev.aspect_type === "delete") {
    await db.from("strava_runs").delete().eq("user_id", tok.user_id).eq("id", ev.object_id);
    return;
  }
  const access = await freshAccess(tok);
  const act = await stravaGet(access, `/activities/${ev.object_id}`);
  if (!(await saveActivity(tok.user_id, act))) {
    // Not a run (or changed from a run to something else): make sure it isn't kept.
    await db.from("strava_runs").delete().eq("user_id", tok.user_id).eq("id", ev.object_id);
  }
}

/* ---------- helpers ---------- */

// Saves one Strava activity if it's a run on or after FIRST_DAY. Returns true if saved.
async function saveActivity(userId: string, act: any): Promise<boolean> {
  const sport = act?.sport_type ?? act?.type;
  if (!act?.id || !RUN_TYPES.includes(sport)) return false;
  const date = String(act.start_date_local ?? act.start_date ?? "").slice(0, 10);
  if (!date || date < FIRST_DAY || !(act.distance > 0)) return false;
  const data = {
    name: act.name ?? "",
    date,
    km: Math.round(act.distance / 10) / 100,
    sec: act.moving_time || act.elapsed_time || 0,
    hr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
    sport,
    workout: act.workout_type ?? null, // 1 race, 2 long run, 3 workout
  };
  const { error } = await db.from("strava_runs").upsert({ user_id: userId, id: act.id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  return true;
}

async function getTokens(userId: string) {
  const { data, error } = await db.from("strava_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Strava access tokens last 6 hours; swap the refresh token for a new one when needed.
async function freshAccess(tok: any): Promise<string> {
  if (tok.expires_at > Date.now() / 1000 + 300) return tok.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh_token });
  await db.from("strava_tokens").update({
    access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", tok.user_id);
  return t.access_token;
}

async function tokenRequest(params: Record<string, string>) {
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Strava sign-in failed: " + (t.message ?? r.status));
  return t;
}

async function stravaGet(access: string, path: string) {
  const r = await fetch(API + path, { headers: { Authorization: "Bearer " + access } });
  if (r.status === 429) throw new Error("Strava is rate limiting. Try again in 15 minutes.");
  if (!r.ok) throw new Error("Strava request failed (" + r.status + ")");
  return r.json();
}

// Strava allows one webhook per API app. Create it if it isn't there yet.
async function ensureWebhook(): Promise<string> {
  const q = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  try {
    const r = await fetch("https://www.strava.com/api/v3/push_subscriptions?" + q);
    const list = await r.json().catch(() => []);
    if (Array.isArray(list) && list.some((s: any) => s.callback_url === CALLBACK)) return "on";
    if (Array.isArray(list)) {
      // An old webhook pointing somewhere else would block ours.
      for (const s of list) await fetch(`https://www.strava.com/api/v3/push_subscriptions/${s.id}?` + q, { method: "DELETE" });
    }
    const c = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, callback_url: CALLBACK, verify_token: await verifyToken() }),
    });
    if (c.ok) return "on";
    console.warn("webhook", c.status, await c.text());
    return "off";
  } catch (e) {
    console.warn("webhook", e);
    return "off";
  }
}
