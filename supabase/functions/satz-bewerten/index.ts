import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";
import { callOpenRouter, extractJson } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `Du bist ein erfahrener Faktenchecker und Redakteur. Deine Aufgabe ist es, eine komplexe Hauptaussage basierend auf ueberprueften Sub-Aussagen und deren jeweiligen Quellen abschliessend zu bewerten.

Du erhaeltst die Hauptaussage sowie eine Liste von Behauptungen (Sub-Aussagen), fuer die jeweils Quellen ausgewertet wurden (mit einem Urteil wie "stuetzt", "widerlegt" oder "irrelevant" sowie einer Begruendung).

Analysiere die Faktenlage:
1. Wie viele Sub-Aussagen sind wahr, wie viele falsch?
2. Ist die Hauptaussage im Gesamtzusammenhang korrekt, irrefuehrend oder komplett falsch?

Formuliere ein verstaendliches, objektives Fazit (ca. 3-5 Saetze), das die Quellenlage sachlich zusammenfasst und die finale Bewertung logisch begruendet. Vermeide Spekulationen und stuetze dich nur auf die gelieferten Informationen.

Waehle anschliessend eines der folgenden Urteile, das am besten zum Gesamtfazit passt: 
"Wahr", "Eher Wahr", "Teilweise", "Eher Falsch", "Falsch", "Unbelegt".

Antworte ausschliesslich im vorgegebenen JSON-Format.

Output Schema:
{
  "type": "object",
  "properties": {
    "bewertung_fazit": { "type": "string" },
    "bewertung_urteil": { "type": "string", "enum": ["Wahr", "Eher Wahr", "Teilweise", "Eher Falsch", "Falsch", "Unbelegt"] }
  },
  "required": ["bewertung_fazit", "bewertung_urteil"],
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
    const statement_id = record.statement_id;
    const session_id = record.session_id;
    const model: string = record.model || "deepseek/deepseek-v4-flash-0731";

    if (!statement_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing statement_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[satz-bewerten] Synthesizing final verdict for statement ${statement_id}`);

    // 1. Fetch statement
    const { data: stmt, error: stmtErr } = await supabase
      .from("statements")
      .select("id, inhalt, session_id")
      .eq("id", statement_id)
      .single();

    if (stmtErr || !stmt) {
      return new Response(
        JSON.stringify({ ok: false, error: `Statement not found: ${stmtErr?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch all source evaluations for this statement
    const { data: sources, error: srcErr } = await supabase
      .from("fact_check_sources")
      .select("urteil, begruendung, konfidenz")
      .eq("statement_id", statement_id);

    if (srcErr) {
      console.error(`[satz-bewerten] Error fetching fact_check_sources: ${srcErr.message}`);
    }

    // 3. Assemble prompt context
    const contextParts = [`Hauptaussage: ${stmt.inhalt}\n`];
    contextParts.push(`Quellenbewertungen (${(sources || []).length} Quellen):`);

    (sources || []).forEach((src, idx) => {
      contextParts.push(`- Quelle ${idx + 1} Urteil: ${src.urteil} (Konfidenz: ${src.konfidenz}, Begruendung: ${src.begruendung})`);
    });

    const userPrompt = contextParts.join("\n");

    // 4. Call LLM
    const llmResult = await callOpenRouter([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ], 0.2, model);

    const parsed = JSON.parse(extractJson(llmResult));
    const bewertung_fazit = parsed.bewertung_fazit || "";
    const bewertung_urteil = parsed.bewertung_urteil || "Unbelegt";

    console.log(`[satz-bewerten] Final verdict for statement ${statement_id}: ${bewertung_urteil}`);

    // 5. Update statement in DB
    const { data: updatedStmt, error: updateErr } = await supabase
      .from("statements")
      .update({
        final_verdict: bewertung_urteil,
        final_evaluation: bewertung_fazit,
        status: "completed"
      })
      .eq("id", statement_id)
      .select()
      .single();

    if (updateErr) {
      console.error(`[satz-bewerten] DB Update error: ${updateErr.message}`);
      return new Response(
        JSON.stringify({ ok: false, error: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Check if session is overall complete
    const targetSessionId = session_id || stmt.session_id;
    if (targetSessionId) {
      const { data: allStmts } = await supabase
        .from("statements")
        .select("status")
        .eq("session_id", targetSessionId);

      const allCompleted = (allStmts || []).every(s => s.status === "completed");
      if (allCompleted) {
        await supabase
          .from("sessions")
          .update({
            status: "completed",
            bewertung_urteil,
            bewertung_fazit
          })
          .eq("id", targetSessionId);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, urteil: bewertung_urteil, fazit: bewertung_fazit, statement: updatedStmt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[satz-bewerten] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
