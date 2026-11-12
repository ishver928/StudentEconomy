// Server-only queries for the Travel page and Community messaging.
// Privacy: nothing returned here includes another student's user id (ids act as bearer secrets with
// the demo cookie identity), and other students' starting points are only approximate areas.
import { query } from './db';
import { scoreMatch, type MatchInput } from './travel';

const NAME = `COALESCE(NULLIF(CASE WHEN pr.opt_in THEN pr.display_name END, ''), NULLIF(u.first_name, ''), 'A student')`;

export type MyPlan = {
  id: string; originArea: string; originLat: number; originLng: number; destLabel: string; destLat: number; destLng: number;
  departDate: string; departWindow: string; returnDate: string | null; budgetCents: number | null; estCostCents: number | null;
  mode: string; optIn: boolean; eventId: string | null; eventTitle: string | null;
  goal: { id: string; title: string; savedCents: number; targetCents: number } | null;
};

type PlanRow = {
  id: string; origin_area: string; origin_lat: number; origin_lng: number; dest_label: string; dest_lat: number; dest_lng: number;
  depart_date: string; depart_window: string; return_date: string | null; budget_cents: number | null; est_cost_cents: number | null;
  travel_mode: string; match_opt_in: boolean; event_id: string | null; event_title: string | null;
  goal_id: string | null; goal_title: string | null; saved_cents: number | null; target_cents: number | null;
};

export async function getMyPlans(userId: string): Promise<MyPlan[]> {
  const rows = await query<PlanRow>(
    `SELECT t.id, t.origin_area, t.origin_lat, t.origin_lng, t.dest_label, t.dest_lat, t.dest_lng,
            to_char(t.depart_date, 'YYYY-MM-DD') AS depart_date, t.depart_window, to_char(t.return_date, 'YYYY-MM-DD') AS return_date,
            t.budget_cents, t.est_cost_cents, t.travel_mode, t.match_opt_in, t.event_id, e.title AS event_title,
            t.goal_id, g.title AS goal_title, g.saved_cents, g.target_cents
     FROM travel_plans t
     LEFT JOIN events e ON e.id = t.event_id AND e.deleted_at IS NULL
     LEFT JOIN goals g ON g.id = t.goal_id
     WHERE t.user_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.depart_date, t.created_at DESC LIMIT 20`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id, originArea: r.origin_area, originLat: r.origin_lat, originLng: r.origin_lng, destLabel: r.dest_label, destLat: r.dest_lat, destLng: r.dest_lng,
    departDate: r.depart_date, departWindow: r.depart_window, returnDate: r.return_date, budgetCents: r.budget_cents, estCostCents: r.est_cost_cents,
    mode: r.travel_mode, optIn: r.match_opt_in, eventId: r.event_id, eventTitle: r.event_title,
    goal: r.goal_id && r.target_cents ? { id: r.goal_id, title: r.goal_title ?? 'Travel goal', savedCents: r.saved_cents ?? 0, targetCents: r.target_cents } : null,
  }));
}

export type ConnStatus = 'none' | 'sent' | 'received' | 'accepted' | 'declined';
export type Match = {
  planId: string; name: string; school: string | null; originArea: string; approxLat: number; approxLng: number;
  destLabel: string; departDate: string; departWindow: string; mode: string; eventTitle: string | null;
  isSample: boolean; score: number; reasons: string[]; connection: { id: string | null; status: ConnStatus };
};

/** Other students' opt-in trips that overlap with `plan`. */
export async function getMatches(userId: string, school: string, plan: MyPlan): Promise<Match[]> {
  const rows = await query<{
    id: string; name: string; school: string | null; origin_area: string; origin_lat: number; origin_lng: number; dest_label: string;
    dest_lat: number; dest_lng: number; depart_date: string; depart_window: string; travel_mode: string; event_id: string | null;
    event_title: string | null; is_sample: boolean; conn_id: string | null; conn_status: string | null; conn_from_me: boolean | null;
  }>(
    `SELECT t.id, ${NAME} AS name, u.school, t.origin_area, t.origin_lat, t.origin_lng, t.dest_label, t.dest_lat, t.dest_lng,
            to_char(t.depart_date, 'YYYY-MM-DD') AS depart_date, t.depart_window, t.travel_mode, t.event_id, e.title AS event_title, t.is_sample,
            c.id AS conn_id, c.status AS conn_status, (c.from_user = $1) AS conn_from_me
     FROM travel_plans t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN profiles pr ON pr.user_id = u.id
     LEFT JOIN events e ON e.id = t.event_id
     LEFT JOIN connections c ON LEAST(c.from_user, c.to_user) = LEAST($1, t.user_id) AND GREATEST(c.from_user, c.to_user) = GREATEST($1, t.user_id)
     WHERE t.match_opt_in AND t.deleted_at IS NULL AND t.user_id <> $1
       AND t.depart_date BETWEEN $2::date - 3 AND $2::date + 3
     LIMIT 300`,
    [userId, plan.departDate],
  );
  const mine: MatchInput = { origin: { lat: plan.originLat, lng: plan.originLng }, dest: { lat: plan.destLat, lng: plan.destLng }, date: plan.departDate, window: plan.departWindow, mode: plan.mode, eventId: plan.eventId, school };
  const seen = new Set<string>();
  return rows
    .map((r) => {
      const { score, reasons } = scoreMatch(mine, {
        origin: { lat: r.origin_lat, lng: r.origin_lng }, dest: { lat: r.dest_lat, lng: r.dest_lng }, date: r.depart_date,
        window: r.depart_window, mode: r.travel_mode, eventId: r.event_id, school: r.school ?? '', eventTitle: r.event_title,
      });
      const status: ConnStatus = !r.conn_status ? 'none' : r.conn_status === 'pending' ? (r.conn_from_me ? 'sent' : 'received') : (r.conn_status as ConnStatus);
      return {
        planId: r.id, name: r.name, school: r.school, originArea: r.origin_area, approxLat: r.origin_lat, approxLng: r.origin_lng,
        destLabel: r.dest_label, departDate: r.depart_date, departWindow: r.depart_window, mode: r.travel_mode, eventTitle: r.event_title,
        isSample: r.is_sample, score, reasons, connection: { id: r.conn_id, status },
      };
    })
    .filter((m) => m.score >= 4)
    .sort((a, b) => b.score - a.score)
    .filter((m) => (seen.has(m.name + m.departDate) ? false : (seen.add(m.name + m.departDate), true)))
    .slice(0, 12);
}

export type Connection = { id: string; name: string; status: string; fromMe: boolean; note: string | null; tripLabel: string | null; isSample: boolean; lastMessageAt: string | null };

export async function getConnections(userId: string): Promise<Connection[]> {
  const rows = await query<{ id: string; name: string; status: string; from_me: boolean; note: string | null; trip: string | null; is_sample: boolean; last_at: Date | null }>(
    `SELECT c.id, ${NAME} AS name, c.status, (c.from_user = $1) AS from_me, c.note, tp.dest_label AS trip, u.is_sample,
            (SELECT max(m.created_at) FROM messages m WHERE m.connection_id = c.id) AS last_at
     FROM connections c
     JOIN users u ON u.id = CASE WHEN c.from_user = $1 THEN c.to_user ELSE c.from_user END
     LEFT JOIN profiles pr ON pr.user_id = u.id
     LEFT JOIN travel_plans tp ON tp.id = CASE WHEN c.from_user = $1 THEN c.to_plan_id ELSE c.from_plan_id END
     WHERE (c.from_user = $1 OR c.to_user = $1) AND c.status <> 'declined'
     ORDER BY c.updated_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, fromMe: r.from_me, note: r.note, tripLabel: r.trip, isSample: r.is_sample, lastMessageAt: r.last_at ? new Date(r.last_at).toISOString() : null }));
}

export type Carpool = {
  id: string; title: string; seats: number; sharedCostCents: number; isOwner: boolean; isSample: boolean; myStatus: string | null;
  owner: string; destLabel: string | null; departDate: string | null;
  members: { name: string; status: string }[];
};

export async function getCarpools(userId: string): Promise<Carpool[]> {
  const groups = await query<{ id: string; title: string; seats: number; shared_cost_cents: number; is_owner: boolean; is_sample: boolean; my_status: string | null; owner: string; dest_label: string | null; depart_date: string | null }>(
    `SELECT cg.id, cg.title, cg.seats, cg.shared_cost_cents, (cg.owner_id = $1) AS is_owner, cg.is_sample, cm.status AS my_status,
            ${NAME} AS owner, tp.dest_label, to_char(tp.depart_date, 'YYYY-MM-DD') AS depart_date
     FROM carpool_groups cg
     JOIN users u ON u.id = cg.owner_id
     LEFT JOIN profiles pr ON pr.user_id = u.id
     LEFT JOIN carpool_members cm ON cm.group_id = cg.id AND cm.user_id = $1
     LEFT JOIN travel_plans tp ON tp.id = cg.plan_id
     WHERE cg.deleted_at IS NULL AND (cg.owner_id = $1 OR (cm.user_id = $1 AND cm.status <> 'declined'))
     ORDER BY cg.created_at DESC LIMIT 20`,
    [userId],
  );
  if (!groups.length) return [];
  const members = await query<{ group_id: string; name: string; status: string }>(
    `SELECT cm.group_id, ${NAME} AS name, cm.status
     FROM carpool_members cm JOIN users u ON u.id = cm.user_id LEFT JOIN profiles pr ON pr.user_id = u.id
     WHERE cm.group_id = ANY($1) AND cm.status <> 'declined' ORDER BY cm.created_at`,
    [groups.map((g) => g.id)],
  );
  return groups.map((g) => ({
    id: g.id, title: g.title, seats: g.seats, sharedCostCents: g.shared_cost_cents, isOwner: g.is_owner, isSample: g.is_sample,
    myStatus: g.my_status, owner: g.owner, destLabel: g.dest_label, departDate: g.depart_date,
    members: members.filter((m) => m.group_id === g.id).map((m) => ({ name: m.name, status: m.status })),
  }));
}

/** Map markers for other students' opt-in trips: approximate origin areas, grouped destinations. */
export async function getTripMarkers(userId: string) {
  const rows = await query<{ dest_label: string; dest_lat: number; dest_lng: number; n: number; samples: number }>(
    `SELECT dest_label, round(dest_lat::numeric, 3)::float AS dest_lat, round(dest_lng::numeric, 3)::float AS dest_lng,
            count(*)::int AS n, count(*) FILTER (WHERE is_sample)::int AS samples
     FROM travel_plans
     WHERE match_opt_in AND deleted_at IS NULL AND user_id <> $1 AND depart_date >= CURRENT_DATE - 1
     GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 30`,
    [userId],
  );
  return rows.map((r) => ({ label: r.dest_label, lat: r.dest_lat, lng: r.dest_lng, count: r.n, allSample: r.samples === r.n }));
}

export type MapEvent = { id: string; title: string; location: string | null; lat: number; lng: number; startsAt: string; isSample: boolean };
export async function getMapEvents(): Promise<MapEvent[]> {
  const rows = await query<{ id: string; title: string; location: string | null; lat: number; lng: number; starts_at: Date; is_sample: boolean }>(
    `SELECT id, title, location, lat, lng, starts_at, is_sample FROM events
     WHERE deleted_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND starts_at >= now() - interval '1 day'
     ORDER BY starts_at LIMIT 30`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, location: r.location, lat: r.lat, lng: r.lng, startsAt: new Date(r.starts_at).toISOString(), isSample: r.is_sample }));
}
