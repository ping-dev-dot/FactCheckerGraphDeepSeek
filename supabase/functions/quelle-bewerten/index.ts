import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";
import { callOpenRouter, extractJson } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `Du bewertest, ob EINE einzelne Quelle die gegebene Behauptung stuetzt. Nutze ausschliesslich den bereitgestellten Quellentext (Titel + Snippet), kein Vorwissen. Moegliche Urteile: "stuetzt" (Quelle bestaetigt die Behauptung), "widerlegt" (Quelle widerspricht der Behauptung), "irrelevant" (Quelle sagt nichts Eindeutiges zur Behauptung). Antworte auf Deutsch und ausschliesslich im vorgegebenen JSON-Schema.

Output Schema:
{
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "urteil": { "type": "string", "enum": ["stuetzt", "widerlegt", "irrelevant"] },
    "konfidenz": { "type": "number", "minimum": 0, "maximum": 1 },
    "begruendung": { "type": "string" }
  },
  "required": ["id", "urteil", "konfidenz", "begruendung"],
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
    const query_result_id = record.query_result_id || record.id;
    const statement_id = record.statement_id;
    const url = record.url || "";
    const title = record.title || "";
    const snippets = record.snippets || [];
    const model: string = record.model || "deepseek/deepseek-v4-flash-0731";

    if (!query_result_id || !statement_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing query_result_id or statement_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[quelle-bewerten] Evaluating source ${query_result_id} for statement ${statement_id}`);

    // Fetch statement text from DB
    const { data: stmt, error: stmtErr } = await supabase
      .from("statements")
      .select("inhalt, session_id, erwartete_bewertungen, abgeschlossene_bewertungen")
      .eq("id", statement_id)
      .single();

    if (stmtErr || !stmt) {
      return new Response(
        JSON.stringify({ ok: false, error: `Statement not found: ${stmtErr?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedSnippets = Array.isArray(snippets) ? snippets.join("\n\n") : String(snippets);
    const userPrompt = `Behauptung: ${stmt.inhalt}\n\nQuelle: ${title} (${url})\nQuellentext:\n---\n${combinedSnippets}\n---`;

    // Call LLM
    const llmResult = await callOpenRouter([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ], 0.0, model);

    const parsed = JSON.parse(extractJson(llmResult));
    const urteil = parsed.urteil || "irrelevant";
    const konfidenz = typeof parsed.konfidenz === "number" ? parsed.konfidenz : 0.5;
    const begruendung = parsed.begruendung || "";

    // Save evaluation to fact_check_sources table
    const { data: savedSource, error: saveErr } = await supabase
      .from("fact_check_sources")
      .insert({
        statement_id,
        query_result_id,
        urteil,
        konfidenz,
        begruendung
      })
      .select()
      .single();

    if (saveErr) {
      console.error(`[quelle-bewerten] Failed to save source evaluation: ${saveErr.message}`);
      return new Response(
        JSON.stringify({ ok: false, error: saveErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment abgeschlossene_bewertungen
    const newAbgeschlossen = (stmt.abgeschlossene_bewertungen || 0) + 1;
    const erwartete = stmt.erwartete_bewertungen || 0;

    await supabase
      .from("statements")
      .update({ abgeschlossene_bewertungen: newAbgeschlossen })
      .eq("id", statement_id);

    console.log(`[quelle-bewerten] Progress for statement ${statement_id}: ${newAbgeschlossen}/${erwartete}`);

    // If all evaluations for this statement are complete, trigger satz-bewerten
    if (newAbgeschlossen >= erwartete && erwartete > 0) {
      console.log(`[quelle-bewerten] All source evaluations complete for statement ${statement_id}. Triggering satz-bewerten.`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (supabaseUrl && serviceRoleKey) {
        const bgTask = fetch(`${supabaseUrl}/functions/v1/satz-bewerten`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ statement_id, session_id: stmt.session_id, model })
        }).catch(err => console.error(`[quelle-bewerten] Failed to trigger satz-bewerten:`, err));

        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
          edgeRuntime.waitUntil(bgTask);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, saved_bewertung: savedSource }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[quelle-bewerten] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
