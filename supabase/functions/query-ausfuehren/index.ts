import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  url: string;
  title: string;
  snippets: string[];
  raw?: any;
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const exaKey = Deno.env.get("EXA_API_KEY");
  const braveKey = Deno.env.get("BRAVE_API_KEY");

  if (exaKey) {
    console.log(`[query-ausfuehren] Searching via Exa Neural Search: "${query}"`);
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": exaKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: "neural",
        numResults: 3,
        contents: { text: true },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return (data.results || []).map((r: any) => ({
        url: r.url || "",
        title: r.title || r.url || "",
        snippets: r.text ? [r.text.slice(0, 1000)] : [],
        raw: r,
      }));
    }
  }

  if (braveKey) {
    console.log(`[query-ausfuehren] Searching via Brave Context Search: "${query}"`);
    const url = new URL("https://api.search.brave.com/res/v1/llm/context");
    url.searchParams.set("q", query);
    url.searchParams.set("country", "de");
    url.searchParams.set("search_lang", "de");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": braveKey,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const grounding = data.grounding?.generic || [];
      return grounding.map((g: any) => ({
        url: g.url || "",
        title: g.title || "",
        snippets: g.snippets || [],
        raw: g,
      }));
    }
  }

  // Fallback mock search for local testing without external API key
  console.warn(`[query-ausfuehren] No EXA_API_KEY or BRAVE_API_KEY set. Returning fallback web results for query: "${query}"`);
  return [
    {
      url: "https://de.wikipedia.org/wiki/Faktencheck",
      title: "Faktencheck - Wikipedia",
      snippets: [`Suchergebnis fuer Anfragen zu: ${query}`],
    },
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const payload = await req.json();

    const record = payload.record || payload;
    const query_id = record.query_id || record.id;
    const statement_id = record.statement_id;
    const queryText = record.inhalt;

    if (!queryText || !query_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing query text or query_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[query-ausfuehren] Executing query_id ${query_id} for statement ${statement_id}: "${queryText}"`);

    const results = await searchWeb(queryText);
    console.log(`[query-ausfuehren] Found ${results.length} search results.`);

    const savedResults: any[] = [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    for (const r of results) {
      const { data, error } = await supabase
        .from("query_results")
        .insert({
          query_id,
          statement_id,
          url: r.url,
          title: r.title,
          snippets: r.snippets,
          inhalt: r.raw || { title: r.title, snippets: r.snippets }
        })
        .select()
        .single();

      if (error) {
        console.error(`[query-ausfuehren] DB Insert error: ${error.message}`);
      } else if (data) {
        savedResults.push(data);
      }
    }

    // Trigger quelle-bewerten in background
    if (supabaseUrl && serviceRoleKey) {
      const backgroundTasks = savedResults.map((data) =>
        fetch(`${supabaseUrl}/functions/v1/quelle-bewerten`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query_result_id: data.id,
            statement_id,
            url: data.url,
            title: data.title,
            snippets: data.snippets
          })
        }).catch(err => console.error(`[query-ausfuehren] Failed to trigger quelle-bewerten:`, err))
      );

      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
        edgeRuntime.waitUntil(Promise.all(backgroundTasks));
      }
    }

    // Increment erwartete_bewertungen on statement
    if (savedResults.length > 0 && statement_id) {
      const { data: stmt } = await supabase.from("statements").select("erwartete_bewertungen").eq("id", statement_id).single();
      const currentErwartet = stmt?.erwartete_bewertungen || 0;
      await supabase.from("statements").update({
        erwartete_bewertungen: currentErwartet + savedResults.length,
        status: "evaluating"
      }).eq("id", statement_id);
    }

    return new Response(
      JSON.stringify({ ok: true, saved_results: savedResults.length, results: savedResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[query-ausfuehren] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
