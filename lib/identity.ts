// Team identity tracker.
//
// Pro Dota teams change names constantly: "Team Liquid" → "Nigma" → "Nigma Galaxy",
// "OG.Seed" → "OG", "B8" → "Yellow Submarine" → "B8" again. OpenDota assigns a new
// team_id every time, which breaks H2H, Elo and form unless we stitch them back.
//
// Our approach: build a graph where two team_ids are connected if they share ≥3
// players in their pool roster. Connected components = identity clusters. We pick
// the most-recent name + the most-active team_id as the cluster's display.
//
// Inputs: match details (with players[].account_id and isRadiant).

import type { ODMatchDetail, ODLeagueMatch } from './types';

const OVERLAP_THRESHOLD = 3; // ≥3 shared players → same identity

export interface TeamRoster {
  teamId: number;
  // Map account_id → games played for this team in the pool.
  // We then take top 5 as the "core roster".
  players: Map<number, number>;
  matches: number;
  lastSeen: number;
  displayName: string;
}

export interface IdentityCluster {
  clusterId: number;
  teamIds: number[];           // all team_ids that belong to this identity
  primaryTeamId: number;       // most-recent / most-active id
  primaryName: string;
  aliases: string[];           // alternative names seen
  coreRoster: number[];        // top players across the whole cluster
}

// Build team rosters from match details (which carry players + team_id).
export function buildRosters(
  matches: ODLeagueMatch[],
  details: ODMatchDetail[]
): Map<number, TeamRoster> {
  const rosters = new Map<number, TeamRoster>();

  // Initialize from summary matches (so we know teamId → name)
  for (const m of matches) {
    if (m.radiant_team_id && m.radiant_name) {
      if (!rosters.has(m.radiant_team_id)) {
        rosters.set(m.radiant_team_id, {
          teamId: m.radiant_team_id,
          players: new Map(),
          matches: 0,
          lastSeen: m.start_time,
          displayName: m.radiant_name,
        });
      }
      const r = rosters.get(m.radiant_team_id)!;
      r.matches++;
      if (m.start_time > r.lastSeen) {
        r.lastSeen = m.start_time;
        r.displayName = m.radiant_name; // update to most recent name
      }
    }
    if (m.dire_team_id && m.dire_name) {
      if (!rosters.has(m.dire_team_id)) {
        rosters.set(m.dire_team_id, {
          teamId: m.dire_team_id,
          players: new Map(),
          matches: 0,
          lastSeen: m.start_time,
          displayName: m.dire_name,
        });
      }
      const r = rosters.get(m.dire_team_id)!;
      r.matches++;
      if (m.start_time > r.lastSeen) {
        r.lastSeen = m.start_time;
        r.displayName = m.dire_name;
      }
    }
  }

  // Fill in player counts from details
  const matchIndex = new Map(matches.map((m) => [m.match_id, m]));
  for (const d of details) {
    if (!d.players) continue;
    const meta = matchIndex.get(d.match_id);
    if (!meta) continue;
    for (const p of d.players) {
      if (!p.account_id || p.account_id === 0) continue; // anonymous
      const teamId = p.isRadiant ? meta.radiant_team_id : meta.dire_team_id;
      if (!teamId) continue;
      const roster = rosters.get(teamId);
      if (!roster) continue;
      roster.players.set(p.account_id, (roster.players.get(p.account_id) ?? 0) + 1);
    }
  }

  return rosters;
}

// Top N players by game count.
function topPlayers(roster: TeamRoster, n: number = 5): number[] {
  return [...roster.players.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

// Union-Find for clustering
class DSU {
  parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = this.parent.get(x)!;
    while (r !== this.parent.get(r)!) r = this.parent.get(r)!;
    this.parent.set(x, r);
    return r;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function clusterIdentities(
  rosters: Map<number, TeamRoster>
): Map<number, IdentityCluster> {
  const teamIds = [...rosters.keys()];
  const cores = new Map<number, Set<number>>();
  for (const id of teamIds) {
    cores.set(id, new Set(topPlayers(rosters.get(id)!, 5)));
  }

  const dsu = new DSU();
  // O(n²) over teams in the pool - fine because n is at most a few hundred.
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const a = cores.get(teamIds[i])!;
      const b = cores.get(teamIds[j])!;
      let overlap = 0;
      for (const p of a) if (b.has(p)) overlap++;
      if (overlap >= OVERLAP_THRESHOLD) {
        dsu.union(teamIds[i], teamIds[j]);
      }
    }
  }

  // Build clusters
  const groups = new Map<number, number[]>();
  for (const id of teamIds) {
    const root = dsu.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }

  const clusters = new Map<number, IdentityCluster>();
  let clusterId = 0;
  for (const [_root, ids] of groups) {
    // pick "primary" as the most-recently-seen team_id
    const primary = ids
      .map((id) => rosters.get(id)!)
      .sort((a, b) => b.lastSeen - a.lastSeen)[0];

    // union players across all aliases
    const allPlayers = new Map<number, number>();
    for (const id of ids) {
      for (const [p, g] of rosters.get(id)!.players) {
        allPlayers.set(p, (allPlayers.get(p) ?? 0) + g);
      }
    }
    const coreRoster = [...allPlayers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const aliases = ids
      .filter((id) => id !== primary.teamId)
      .map((id) => rosters.get(id)!.displayName)
      .filter((n, i, arr) => arr.indexOf(n) === i);

    const cluster: IdentityCluster = {
      clusterId: clusterId++,
      teamIds: ids,
      primaryTeamId: primary.teamId,
      primaryName: primary.displayName,
      aliases,
      coreRoster,
    };
    // Map every team_id in the cluster to the cluster
    for (const id of ids) clusters.set(id, cluster);
  }

  return clusters;
}

// Resolve a team_id to its primary identity (for display & H2H aggregation).
export function resolveIdentity(
  teamId: number,
  clusters: Map<number, IdentityCluster>
): IdentityCluster | null {
  return clusters.get(teamId) ?? null;
}
