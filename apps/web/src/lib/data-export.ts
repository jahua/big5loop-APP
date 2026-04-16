/**
 * Data export – Phase 3 P1-11.
 * exportSessionData: single session bundle (session, turns, personality_states, policy_evidence).
 * exportAllData: admin bulk export – all sessions with human_ratings and audit summary.
 * See docs/DATA-EXPORT-AND-DELETION.md.
 */

import type { Client } from "pg";

export type ExportBundle = {
  session: { session_id: string; created_at: string; status: string; locale: string | null; canton: string | null } | null;
  turns: Array<{ turn_index: number; mode: string | null; created_at: string; user_msg: string; assistant_msg: string | null; latency_ms: number | null }>;
  personality_states: Array<{ turn_index: number; ocean_json: unknown; confidence_json: unknown; stable: boolean; created_at: string }>;
  policy_evidence: Array<{ turn_index: number; source_id: string; chunk_id: string; title: string | null; url: string | null }>;
};

export type HumanRating = {
  session_id: string;
  turn_index: number | null;
  request_id: string | null;
  relevance: number;
  tone: number;
  personality_fit: number;
  comment: string | null;
  ocean_snapshot: unknown;
  coaching_mode: string | null;
  created_at: string;
};

export type AuditRow = {
  session_id: string;
  turn_index: number | null;
  request_id: string | null;
  coaching_mode: string | null;
  route_key: string | null;
  citation_count: number | null;
  verifier_status: string | null;
  retrieval_status: string | null;
  turn_latency_ms: number | null;
  created_at: string;
};

export type AllDataExport = {
  exported_at: string;
  total_sessions: number;
  sessions: Array<{
    session_id: string;
    created_at: string;
    status: string;
    locale: string | null;
    canton: string | null;
    user_id: string | null;
    turn_count: number;
  }>;
  turns: Array<{
    session_id: string;
    turn_index: number;
    mode: string | null;
    created_at: string;
    user_msg: string;
    assistant_msg: string | null;
    latency_ms: number | null;
  }>;
  personality_states: Array<{
    session_id: string;
    turn_index: number;
    ocean_json: unknown;
    confidence_json: unknown;
    stable: boolean;
    created_at: string;
  }>;
  human_ratings: HumanRating[];
  audit_log: AuditRow[];
};

/**
 * Bulk admin export: all sessions with turns, personality states, human ratings, and audit rows.
 * Used by GET /api/admin/export (DATA_API_KEY required).
 * Paginated by session creation time: pass cursor_before (ISO timestamp) to page backwards.
 */
export async function exportAllData(
  client: Client,
  limit = 200,
  cursorBefore?: string
): Promise<AllDataExport> {
  const cursorClause = cursorBefore ? `WHERE cs.created_at < $2::timestamptz` : "";
  const params: (string | number)[] = [limit];
  if (cursorBefore) params.push(cursorBefore);

  const sessionsResult = await client.query<{
    session_id: string;
    created_at: string;
    status: string;
    locale: string | null;
    canton: string | null;
    user_id: string | null;
    turn_count: string;
  }>(
    `SELECT cs.session_id::text, cs.created_at, cs.status, cs.locale, cs.canton, cs.user_id::text,
            COUNT(ct.turn_index)::text AS turn_count
     FROM chat_sessions cs
     LEFT JOIN conversation_turns ct USING (session_id)
     ${cursorClause}
     GROUP BY cs.session_id, cs.created_at, cs.status, cs.locale, cs.canton, cs.user_id
     ORDER BY cs.created_at DESC
     LIMIT $1`,
    params
  );

  const sessionIds = sessionsResult.rows.map((r) => r.session_id);

  if (sessionIds.length === 0) {
    return {
      exported_at: new Date().toISOString(),
      total_sessions: 0,
      sessions: [],
      turns: [],
      personality_states: [],
      human_ratings: [],
      audit_log: [],
    };
  }

  const placeholders = sessionIds.map((_, i) => `$${i + 1}::uuid`).join(", ");

  const [turnsResult, personalityResult, ratingsResult, auditResult, totalResult] =
    await Promise.all([
      client.query<{
        session_id: string;
        turn_index: number;
        mode: string | null;
        created_at: string;
        user_msg: string;
        assistant_msg: string | null;
        latency_ms: number | null;
      }>(
        `SELECT session_id::text, turn_index, mode, created_at, user_msg, assistant_msg, latency_ms
         FROM conversation_turns
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, turn_index`,
        sessionIds
      ),
      client.query<{
        session_id: string;
        turn_index: number;
        ocean_json: unknown;
        confidence_json: unknown;
        stable: boolean;
        created_at: string;
      }>(
        `SELECT session_id::text, turn_index, ocean_json, confidence_json, stable, created_at
         FROM personality_states
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, turn_index`,
        sessionIds
      ),
      client.query<{
        session_id: string;
        turn_index: number | null;
        request_id: string | null;
        relevance: number;
        tone: number;
        personality_fit: number;
        comment: string | null;
        ocean_snapshot: unknown;
        coaching_mode: string | null;
        created_at: string;
      }>(
        `SELECT session_id::text, turn_index, request_id, relevance, tone, personality_fit,
                comment, ocean_snapshot, coaching_mode, created_at
         FROM human_ratings
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, turn_index`,
        sessionIds
      ),
      client
        .query<{
          has_routing: boolean;
        }>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'routing'
           ) AS has_routing`
        )
        .then(async (r) => {
          const hasRouting = Boolean(r.rows[0]?.has_routing);
          return client.query<{
            session_id: string;
            turn_index: number | null;
            request_id: string | null;
            coaching_mode: string | null;
            route_key: string | null;
            citation_count: number | null;
            verifier_status: string | null;
            retrieval_status: string | null;
            turn_latency_ms: number | null;
            created_at: string;
          }>(
            `SELECT session_id::text, turn_index, request_id, coaching_mode,
                    ${hasRouting ? "routing->>'route_key'" : "NULL"} AS route_key,
                    citation_count, verifier_status,
                    pipeline_status->>'retrieval' AS retrieval_status,
                    turn_latency_ms, created_at
             FROM audit_log
             WHERE session_id IN (${placeholders})
             ORDER BY session_id, created_at`,
            sessionIds
          );
        }),
      client.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM chat_sessions"),
    ]);

  return {
    exported_at: new Date().toISOString(),
    total_sessions: Number(totalResult.rows[0]?.total ?? 0),
    sessions: sessionsResult.rows.map((r) => ({
      session_id: r.session_id,
      created_at: r.created_at,
      status: r.status,
      locale: r.locale ?? null,
      canton: r.canton ?? null,
      user_id: r.user_id ?? null,
      turn_count: Number(r.turn_count),
    })),
    turns: turnsResult.rows,
    personality_states: personalityResult.rows,
    human_ratings: ratingsResult.rows,
    audit_log: auditResult.rows,
  };
}

export async function exportSessionData(client: Client, sessionId: string): Promise<ExportBundle> {
  const sessionResult = await client.query(
    "SELECT session_id, created_at, status, locale, canton FROM chat_sessions WHERE session_id = $1::uuid",
    [sessionId]
  );
  const turnsResult = await client.query(
    "SELECT turn_index, mode, created_at, user_msg, assistant_msg, latency_ms FROM conversation_turns WHERE session_id = $1::uuid ORDER BY turn_index",
    [sessionId]
  );
  const personalityResult = await client.query(
    "SELECT turn_index, ocean_json, confidence_json, stable, created_at FROM personality_states WHERE session_id = $1::uuid ORDER BY turn_index",
    [sessionId]
  );
  const evidenceResult = await client.query(
    "SELECT turn_index, source_id, chunk_id, title, url FROM policy_evidence WHERE session_id = $1::uuid ORDER BY turn_index, source_id, chunk_id",
    [sessionId]
  );

  const sessionRow = sessionResult.rows[0];
  return {
    session: sessionRow
      ? {
          session_id: sessionRow.session_id,
          created_at: sessionRow.created_at,
          status: sessionRow.status,
          locale: sessionRow.locale ?? null,
          canton: sessionRow.canton ?? null,
        }
      : null,
    turns: turnsResult.rows.map((r) => ({
      turn_index: r.turn_index,
      mode: r.mode ?? null,
      created_at: r.created_at,
      user_msg: r.user_msg,
      assistant_msg: r.assistant_msg ?? null,
      latency_ms: r.latency_ms ?? null,
    })),
    personality_states: personalityResult.rows.map((r) => ({
      turn_index: r.turn_index,
      ocean_json: r.ocean_json,
      confidence_json: r.confidence_json,
      stable: r.stable,
      created_at: r.created_at,
    })),
    policy_evidence: evidenceResult.rows.map((r) => ({
      turn_index: r.turn_index,
      source_id: r.source_id,
      chunk_id: r.chunk_id,
      title: r.title ?? null,
      url: r.url ?? null,
    })),
  };
}
