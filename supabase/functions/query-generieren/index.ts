import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";
import { callOpenRouter, extractJson } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `Du erzeugst optimale Web-Suchanfragen, um eine einzelne Faktenbehauptung zu verifizieren. Formuliere genau 3 unterschiedliche, praezise Suchanfragen (verschiedene Formulierungen, ggf. mit Zeit- oder Ortsbezug), die eine Suchmaschine gut beantworten kann. Verwende keine Fuellwoerter. Formuliere alle Suchanfragen ausschliesslich auf Deutsch, auch wenn die Behauptung auf Englisch vorliegt. Nutze deutsche Fachbegriffe, um deutschsprachige Quellen zu finden.
Als output schema soll folgendes verwendet werden:
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 3,
      "maxItems": 3
    }
  },
  "required": ["queries"],
  "additionalProperties": false
}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const payload = await req.json();

    const record = payload.record || payload;
    const statement_id = record.statement_id || record.behauptung_id || record.id;
    const inhalt = record.inhalt;
    const typ = record.typ || "faktisch";
    const model: string = record.model || "deepseek/deepseek-v4-flash-0731";

    if (!inhalt || !statement_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing inhalt or statement_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typ !== "faktisch") {
      console.log(`[query-generieren] Ignoring statement ${statement_id} as typ '${typ}' is not 'faktisch'`);
      return new Response(
        JSON.stringify({ ok: true, message: "Ignored, not 'faktisch'" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[query-generieren] Processing statement_id: ${statement_id}`);

    // Call LLM to generate 3 queries
    const llmResult = await callOpenRouter([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: inhalt }
    ], 0.0, model);

    const parsed = JSON.parse(extractJson(llmResult));
    const queries: string[] = parsed.queries || [];
    console.log(`[query-generieren] Generated ${queries.length} queries.`);

    const savedQueries: any[] = [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    for (const q of queries) {
      const { data, error } = await supabase
        .from("queries")
        .insert({
          statement_id,
          inhalt: q
        })
        .select()
        .single();

      if (error) {
        console.error(`[query-generieren] DB Insert error: ${error.message}`);
      } else if (data) {
        savedQueries.push(data);
      }
    }

    // Trigger query-ausfuehren in background
    if (supabaseUrl && serviceRoleKey) {
      const backgroundTasks = savedQueries.map((data) =>
        fetch(`${supabaseUrl}/functions/v1/query-ausfuehren`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query_id: data.id, statement_id, inhalt: data.inhalt })
        }).catch(err => console.error(`[query-generieren] Failed to trigger query-ausfuehren:`, err))
      );

      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
        edgeRuntime.waitUntil(Promise.all(backgroundTasks));
      }
    }

    return new Response(
      JSON.stringify({ ok: true, saved_queries: savedQueries.length, queries: savedQueries }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[query-generieren] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
