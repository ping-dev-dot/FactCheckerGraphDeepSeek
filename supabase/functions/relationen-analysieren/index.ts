import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabase-client.ts";
import { callOpenRouter, extractJson } from "../_shared/openrouter.ts";

const SYSTEM_PROMPT = `Du bist ein Experte fuer Logik und Argumentationsanalyse. Du erhaeltst eine Liste von Aussagen mit IDs (S1, S2, S3, ...). Deine Aufgabe ist es, die logischen Beziehungen, Fehlschluesse und Zirkelschluesse zwischen diesen Aussagen zu analysieren.

Beziehungstypen (relations):
- "implication" — Aussage A impliziert B (A -> B)
- "conjunction" — A und B bilden zusammen eine zusammengesetzte Aussage
- "disjunction" — Entweder A oder B gilt
- "supports" — A stuetzt oder begruendet B
- "contradiction" — A widerspricht B
- "fallacy" — A begeht einen logischen Fehlschluss gegen B
- "restates" — A und B druecken dieselbe zugrundeliegende Aussage aus

Fehlschlusstypen (fallacies):
"Ad Hominem", "Straw Man", "False Dilemma", "Begging the Question", "Circular Reasoning", "Appeal to Authority", "Slippery Slope", "Red Herring", "Hasty Generalization", "False Equivalence"

Zirkelschluesse (cycles):
Liste alle Ketten von Aussagen auf, die einen Zirkelschluss bilden (z.B. nodeIds: ["S1", "S2", "S3"]).

Output Schema:
{
  "type": "object",
  "properties": {
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["implication", "conjunction", "disjunction", "supports", "contradiction", "fallacy", "restates"]
          },
          "label": { "type": "string" },
          "details": { "type": "string" }
        },
        "required": ["from", "to", "type"],
        "additionalProperties": false
      }
    },
    "fallacies": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "statementId": { "type": "string" },
          "fallacyType": { "type": "string" },
          "description": { "type": "string" }
        },
        "required": ["statementId", "fallacyType", "description"],
        "additionalProperties": false
      }
    },
    "cycles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nodeIds": { "type": "array", "items": { "type": "string" } },
          "description": { "type": "string" }
        },
        "required": ["nodeIds", "description"],
        "additionalProperties": false
      }
    }
  },
  "required": ["relations"],
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
    const session_id = record.session_id || record.id;
    const model: string = record.model || "deepseek/deepseek-v4-flash-0731";

    if (!session_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing session_id in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[relationen-analysieren] Analyzing relations for session: ${session_id}`);

    // 1. Fetch all statements for this session
    const { data: statements, error: stmtErr } = await supabase
      .from("statements")
      .select("id, inhalt, typ")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });

    if (stmtErr || !statements || statements.length < 2) {
      console.log(`[relationen-analysieren] Fewer than 2 statements for session ${session_id}, skipping relation analysis.`);
      return new Response(
        JSON.stringify({ ok: true, relations: [], fallacies: [], cycles: [], message: "Fewer than 2 statements" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Map statements to indexed IDs & flexible lookup
    const idMap = new Map<string, string>();
    const promptLines: string[] = [];

    statements.forEach((stmt, idx) => {
      const shortId = `S${idx + 1}`;
      const num = idx + 1;

      idMap.set(shortId, stmt.id);
      idMap.set(shortId.toLowerCase(), stmt.id);
      idMap.set(`s_${num}`, stmt.id);
      idMap.set(`statement${num}`, stmt.id);
      idMap.set(`${num}`, stmt.id);
      idMap.set(stmt.id, stmt.id);
      idMap.set(stmt.id.toLowerCase(), stmt.id);

      promptLines.push(`[${shortId}]: ${stmt.inhalt}`);
    });

    const resolveId = (raw: string): string | undefined => {
      if (!raw) return undefined;
      const clean = raw.trim();
      return idMap.get(clean) || idMap.get(clean.toLowerCase());
    };

    const userPrompt = `Aussagen zur Logikanalyse:\n\n${promptLines.join("\n")}`;

    // 3. Call LLM
    const llmResult = await callOpenRouter([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ], 0.2, model);

    const parsed = JSON.parse(extractJson(llmResult));
    const rawRelations = parsed.relations || [];
    const rawFallacies = parsed.fallacies || [];
    const rawCycles = parsed.cycles || [];

    console.log(`[relationen-analysieren] LLM generated ${rawRelations.length} relations, ${rawFallacies.length} fallacies, ${rawCycles.length} cycles.`);

    // 4. Save Relations to DB
    const savedRelations: any[] = [];
    for (const rel of rawRelations) {
      const fromUuid = resolveId(rel.from);
      const toUuid = resolveId(rel.to);

      if (fromUuid && toUuid && fromUuid !== toUuid) {
        const { data, error } = await supabase
          .from("relations")
          .insert({
            session_id,
            from_statement_id: fromUuid,
            to_statement_id: toUuid,
            type: rel.type,
            label: rel.label || rel.type,
            reasoning: rel.details || null
          })
          .select()
          .single();

        if (error) {
          console.error(`[relationen-analysieren] DB Error inserting relation: ${error.message}`);
        } else if (data) {
          savedRelations.push(data);
        }
      }
    }

    // 5. Save Fallacies to DB
    const savedFallacies: any[] = [];
    for (const fal of rawFallacies) {
      const stmtUuid = resolveId(fal.statementId);
      if (stmtUuid) {
        const { data, error } = await supabase
          .from("fallacies")
          .insert({
            session_id,
            statement_id: stmtUuid,
            fallacy_type: fal.fallacyType,
            reasoning: fal.description
          })
          .select()
          .single();

        if (error) {
          console.error(`[relationen-analysieren] DB Error inserting fallacy: ${error.message}`);
        } else if (data) {
          savedFallacies.push(data);
        }
      }
    }

    // 6. Map Cycles for output
    const resolvedCycles = rawCycles.map((c: any) => ({
      nodeIds: (c.nodeIds || []).map((id: string) => resolveId(id)).filter(Boolean),
      description: c.description
    }));

    return new Response(
      JSON.stringify({ ok: true, relations: savedRelations, fallacies: savedFallacies, cycles: resolvedCycles }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[relationen-analysieren] Error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
