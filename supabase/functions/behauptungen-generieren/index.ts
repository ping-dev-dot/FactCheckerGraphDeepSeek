import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";
import { callOpenRouter, extractJson } from "../_shared/openrouter.ts";
import { detectSpeakers } from "../_shared/speaker-detection.ts";
import { postprocessConclusions } from "../_shared/postprocess-conclusions.ts";

const SYSTEM_PROMPT = `Du bist ein praeziser Faktencheck-Assistent. Zerlege den Text des Nutzers in atomare, einzeln ueberpruefbare Faktenbehauptungen. Eine atomare Behauptung enthaelt genau ein Subjekt, ein Praedikat und ein Objekt/Attribut. Loese Aufzaehlungen in einzelne Behauptungen auf. Loese Pronomen und impliziten Kontext direkt auf (Koreferenz), sodass jede Behauptung eigenstaendig verstaendlich ist. Ignoriere Meinungen, Wertungen und reine Fuellsaetze. Beachte auch Vollstaendigkeits- und Mengenaussagen (z.B. 'genau vier X') als eigene Behauptung. Formuliere alle Behauptungen auf Deutsch, unabhaengig von der Sprache des Eingabetextes.

Bewerte ausserdem fuer jede Behauptung die Faktencheck-Schwierigkeit (0-100%, wobei 0% = trivial empirisch pruefbar und 100% = praktisch unmoeglich zu verifizieren ist) sowie eine kurze Begruendung.

Als Output Schema soll folgendes JSON verwendet werden:
{
  "type": "object",
  "properties": {
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "claim": { "type": "string" },
          "typ": {
            "type": "string",
            "enum": ["faktisch", "meinung", "nicht_pruefbar"]
          },
          "schwierigkeit": { "type": "integer" },
          "schwierigkeit_begruendung": { "type": "string" },
          "speaker_name": { "type": "string" }
        },
        "required": ["id", "claim", "typ", "schwierigkeit", "schwierigkeit_begruendung"],
        "additionalProperties": false
      }
    }
  },
  "required": ["claims"],
  "additionalProperties": false
}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toValidUuid(val?: string): string | null {
  if (!val) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  return isUuid ? val : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const payload = await req.json();
    
    const record = payload.record || payload;
    const rawInhalt = record.inhalt || record.raw_text || record.text;
    const session_id = record.session_id || record.satz_id || record.id;
    const model: string = record.model || "deepseek/deepseek-v4-flash-0731";

    if (!rawInhalt || !session_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing inhalt or session_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[behauptungen-generieren] Processing session_id: ${session_id}`);

    // Step 0: Speaker Detection
    const speakerDetection = detectSpeakers(rawInhalt);
    let promptText = rawInhalt;
    if (speakerDetection.speakers.length > 1) {
      promptText = `Sprecher in diesem Gespräch:\n${
        speakerDetection.speakers.map((s) => `${s.id}: ${s.name}`).join("\n")
      }\n\nEingabetext:\n${rawInhalt}`;
    }

    // Call OpenRouter / DeepSeek LLM
    const llmResult = await callOpenRouter([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: promptText }
    ], 0.0, model);

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(llmResult));
    } catch (err) {
      console.warn(`[behauptungen-generieren] Parsing retry fallback: ${err}`);
      parsed = JSON.parse(extractJson(llmResult));
    }

    const rawClaims = parsed.claims || [];
    // Post-process conclusion markers ("deshalb", "therefore", "thus")
    const claims = postprocessConclusions(rawInhalt, rawClaims);
    console.log(`[behauptungen-generieren] Extracted ${claims.length} claims (including conclusions & speaker metadata).`);

    const savedStatements: any[] = [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    for (const c of claims) {
      const difficultyScore = typeof c.schwierigkeit === "number" ? Math.min(100, Math.max(0, c.schwierigkeit)) : 50;
      const validSpeakerUuid = toValidUuid(c.speakerId || c.speaker_name);

      const { data, error } = await supabase
        .from("statements")
        .insert({
          session_id,
          inhalt: c.claim,
          typ: c.typ || "faktisch",
          difficulty_score: difficultyScore,
          speaker_id: validSpeakerUuid,
          status: "pending"
        })
        .select()
        .single();

      if (error) {
        console.error(`[behauptungen-generieren] DB Insert error: ${error.message}`);
      } else if (data) {
        savedStatements.push(data);
      }
    }

    // Background trigger for query-generieren and relationen-analysieren (non-blocking)
    const backgroundTasks: Promise<any>[] = [];

    if (supabaseUrl && serviceRoleKey) {
      // Trigger query-generieren for factual claims
      for (const stmt of savedStatements) {
        if (stmt.typ === "faktisch") {
          backgroundTasks.push(
            fetch(`${supabaseUrl}/functions/v1/query-generieren`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ statement_id: stmt.id, inhalt: stmt.inhalt, typ: stmt.typ, model })
            }).catch(err => console.error(`[behauptungen-generieren] Failed to trigger query-generieren:`, err))
          );
        }
      }

      // Trigger relationen-analysieren if >= 2 statements saved
      if (savedStatements.length >= 2) {
        backgroundTasks.push(
          fetch(`${supabaseUrl}/functions/v1/relationen-analysieren`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id, model })
          }).catch(err => console.error(`[behauptungen-generieren] Failed to trigger relationen-analysieren:`, err))
        );
      }
    }

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
      edgeRuntime.waitUntil(Promise.all(backgroundTasks));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved_claims: savedStatements.length,
        statements: savedStatements,
        speakers: speakerDetection.speakers
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[behauptungen-generieren] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
