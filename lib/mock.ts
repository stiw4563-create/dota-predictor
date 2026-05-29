// Mock data for local development & "real-data unavailable" fallback.
// Generated to exercise every model code path: identity clustering, bans,
// pick order, player-on-hero, counter-picks. Names are obviously fake.

import type {
  ODLeague,
  ODLeagueMatch,
  ODMatchDetail,
  ODLiveGame,
  ODHero,
} from './types';

const MOCK_HEROES: ODHero[] = [
  { id: 1, name: 'npc_dota_hero_antimage', localized_name: 'Anti-Mage', primary_attr: 'agi', attack_type: 'Melee', roles: ['Carry'] },
  { id: 2, name: 'npc_dota_hero_axe', localized_name: 'Axe', primary_attr: 'str', attack_type: 'Melee', roles: ['Initiator'] },
  { id: 3, name: 'npc_dota_hero_bane', localized_name: 'Bane', primary_attr: 'int', attack_type: 'Ranged', roles: ['Support'] },
  { id: 4, name: 'npc_dota_hero_bloodseeker', localized_name: 'Bloodseeker', primary_attr: 'agi', attack_type: 'Melee', roles: ['Carry'] },
  { id: 5, name: 'npc_dota_hero_crystal_maiden', localized_name: 'Crystal Maiden', primary_attr: 'int', attack_type: 'Ranged', roles: ['Support'] },
  { id: 6, name: 'npc_dota_hero_drow_ranger', localized_name: 'Drow Ranger', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Carry'] },
  { id: 7, name: 'npc_dota_hero_earthshaker', localized_name: 'Earthshaker', primary_attr: 'str', attack_type: 'Melee', roles: ['Support'] },
  { id: 8, name: 'npc_dota_hero_juggernaut', localized_name: 'Juggernaut', primary_attr: 'agi', attack_type: 'Melee', roles: ['Carry'] },
  { id: 9, name: 'npc_dota_hero_mirana', localized_name: 'Mirana', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Support'] },
  { id: 10, name: 'npc_dota_hero_morphling', localized_name: 'Morphling', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Carry'] },
  { id: 11, name: 'npc_dota_hero_nevermore', localized_name: 'Shadow Fiend', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 12, name: 'npc_dota_hero_phantom_lancer', localized_name: 'Phantom Lancer', primary_attr: 'agi', attack_type: 'Melee', roles: ['Carry'] },
  { id: 13, name: 'npc_dota_hero_puck', localized_name: 'Puck', primary_attr: 'int', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 14, name: 'npc_dota_hero_pudge', localized_name: 'Pudge', primary_attr: 'str', attack_type: 'Melee', roles: ['Support'] },
  { id: 16, name: 'npc_dota_hero_sand_king', localized_name: 'Sand King', primary_attr: 'str', attack_type: 'Melee', roles: ['Support'] },
  { id: 17, name: 'npc_dota_hero_storm_spirit', localized_name: 'Storm Spirit', primary_attr: 'int', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 22, name: 'npc_dota_hero_zuus', localized_name: 'Zeus', primary_attr: 'int', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 37, name: 'npc_dota_hero_warlock', localized_name: 'Warlock', primary_attr: 'int', attack_type: 'Ranged', roles: ['Support'] },
  { id: 40, name: 'npc_dota_hero_venomancer', localized_name: 'Venomancer', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Support'] },
  { id: 42, name: 'npc_dota_hero_skeleton_king', localized_name: 'Wraith King', primary_attr: 'str', attack_type: 'Melee', roles: ['Carry'] },
  { id: 43, name: 'npc_dota_hero_death_prophet', localized_name: 'Death Prophet', primary_attr: 'int', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 45, name: 'npc_dota_hero_pugna', localized_name: 'Pugna', primary_attr: 'int', attack_type: 'Ranged', roles: ['Support'] },
  { id: 46, name: 'npc_dota_hero_templar_assassin', localized_name: 'Templar Assassin', primary_attr: 'agi', attack_type: 'Ranged', roles: ['Mid'] },
  { id: 51, name: 'npc_dota_hero_clockwerk', localized_name: 'Clockwerk', primary_attr: 'str', attack_type: 'Melee', roles: ['Support'] },
  { id: 74, name: 'npc_dota_hero_invoker', localized_name: 'Invoker', primary_attr: 'int', attack_type: 'Ranged', roles: ['Mid'] },
];

// Teams - some share players to test identity clustering.
// Team 1 "Aurora Mid" and team 100 "Aurora" share 3 players → same identity.
// Team 2 "Spirit Wolves" and team 200 "Wolves Esports" share 4 players → same.

const PLAYERS = {
  // Aurora / Aurora Mid core (will become 1 cluster)
  aurora: [1001, 1002, 1003, 1004, 1005],
  // Spirit Wolves / Wolves Esports core
  wolves: [2001, 2002, 2003, 2004, 2005],
  // Independent teams
  liquidA: [3001, 3002, 3003, 3004, 3005],
  ogB: [4001, 4002, 4003, 4004, 4005],
  vpC: [5001, 5002, 5003, 5004, 5005],
  lgdD: [6001, 6002, 6003, 6004, 6005],
};

const PLAYER_NAMES: Record<number, string> = {
  1001: 'Mira', 1002: 'Cosmic', 1003: 'NotALie', 1004: 'Stormrider', 1005: 'satanic',
  2001: 'yatoro', 2002: 'TORONTOTOKYO', 2003: 'Collapse', 2004: 'Mira', 2005: 'Miposhka',
  3001: 'micke', 3002: 'zai', 3003: 'iNSaNiA', 3004: 'Boxi', 3005: 'qojqva',
  4001: 'ATF', 4002: 'bzm', 4003: 'misha', 4004: 'Yuragi', 4005: 'Saksa',
  5001: 'No[o]ne', 5002: 'gpk', 5003: 'kingrd', 5004: 'silent', 5005: 'fng',
  6001: 'XinQ', 6002: 'NothingToSay', 6003: 'Faith_bian', 6004: 'Ame', 6005: 'y`',
};

export const mockLeagues: ODLeague[] = [
  { leagueid: 12345, name: 'The International 2026', tier: 'premium', last_match_time: Math.floor(Date.now() / 1000) - 3600, ticket: null, banner: null },
  { leagueid: 12346, name: 'DPC 2026 · Spring Tour', tier: 'premium', last_match_time: Math.floor(Date.now() / 1000) - 86400, ticket: null, banner: null },
  { leagueid: 12347, name: 'ESL One Berlin Major', tier: 'premium', last_match_time: Math.floor(Date.now() / 1000) - 5 * 86400, ticket: null, banner: null },
  { leagueid: 12348, name: 'PGL Wallachia Season 4', tier: 'premium', last_match_time: Math.floor(Date.now() / 1000) - 14 * 86400, ticket: null, banner: null },
  { leagueid: 12349, name: 'BLAST Slam V', tier: 'premium', last_match_time: Math.floor(Date.now() / 1000) - 30 * 86400, ticket: null, banner: null },
];

// Build a varied match list. Each match has team_id, team name, score, winner.
type MatchSeed = {
  matchId: number;
  leagueId: number;
  daysAgo: number;
  radTeamId: number;
  radName: string;
  direTeamId: number;
  direName: string;
  radWin: boolean;
  picks: Array<[number, 0 | 1, number]>; // hero_id, team, order
  bans: Array<[number, 0 | 1, number]>;
  radPlayers: number[];
  direPlayers: number[];
};

const SEEDS: MatchSeed[] = [
  // Aurora (id=1) vs Spirit Wolves (id=2)
  {
    matchId: 7000001, leagueId: 12345, daysAgo: 0.5,
    radTeamId: 1, radName: 'Aurora',
    direTeamId: 2, direName: 'Spirit Wolves',
    radWin: true,
    picks: [[1,0,0],[2,1,0],[11,0,1],[14,1,1],[5,0,2],[7,1,2],[37,0,3],[3,1,3],[22,0,4],[43,1,4]],
    bans: [[12,0,0],[10,1,0],[8,0,1],[6,1,1]],
    radPlayers: PLAYERS.aurora, direPlayers: PLAYERS.wolves,
  },
  {
    matchId: 7000002, leagueId: 12345, daysAgo: 1,
    radTeamId: 2, radName: 'Spirit Wolves',
    direTeamId: 1, direName: 'Aurora',
    radWin: false,
    picks: [[10,0,0],[1,1,0],[13,0,1],[11,1,1],[14,0,2],[5,1,2],[3,0,3],[7,1,3],[46,0,4],[40,1,4]],
    bans: [[8,0,0],[12,1,0]],
    radPlayers: PLAYERS.wolves, direPlayers: PLAYERS.aurora,
  },
  // OG (id=3) vs Liquid (id=4)
  {
    matchId: 7000003, leagueId: 12346, daysAgo: 2,
    radTeamId: 3, radName: 'OG',
    direTeamId: 4, direName: 'Team Liquid',
    radWin: true,
    picks: [[8,0,0],[12,1,0],[17,0,1],[46,1,1],[5,0,2],[3,1,2],[16,0,3],[40,1,3],[42,0,4],[51,1,4]],
    bans: [[1,0,0],[2,1,0],[11,0,1]],
    radPlayers: PLAYERS.ogB, direPlayers: PLAYERS.liquidA,
  },
  // VP (id=5) vs LGD (id=6)
  {
    matchId: 7000004, leagueId: 12346, daysAgo: 3,
    radTeamId: 5, radName: 'Virtus.pro',
    direTeamId: 6, direName: 'PSG.LGD',
    radWin: false,
    picks: [[11,0,0],[1,1,0],[13,0,1],[8,1,1],[3,0,2],[5,1,2],[40,0,3],[7,1,3],[45,0,4],[42,1,4]],
    bans: [[10,0,0],[12,1,0]],
    radPlayers: PLAYERS.vpC, direPlayers: PLAYERS.lgdD,
  },
  // Aurora Mid (id=100) - same as Aurora cluster, 3 shared players
  {
    matchId: 7000005, leagueId: 12347, daysAgo: 30,
    radTeamId: 100, radName: 'Aurora Mid',
    direTeamId: 5, direName: 'Virtus.pro',
    radWin: true,
    picks: [[1,0,0],[8,1,0],[22,0,1],[11,1,1],[5,0,2],[3,1,2],[7,0,3],[40,1,3],[37,0,4],[42,1,4]],
    bans: [[12,0,0],[10,1,0]],
    radPlayers: [1001, 1002, 1003, 9001, 9002], direPlayers: PLAYERS.vpC,
  },
  // Wolves Esports (id=200) - same as Spirit Wolves, 4 shared
  {
    matchId: 7000006, leagueId: 12347, daysAgo: 45,
    radTeamId: 200, radName: 'Wolves Esports',
    direTeamId: 3, direName: 'OG',
    radWin: false,
    picks: [[10,0,0],[8,1,0],[11,0,1],[12,1,1],[14,0,2],[5,1,2],[3,0,3],[7,1,3],[16,0,4],[40,1,4]],
    bans: [[1,0,0],[2,1,0]],
    radPlayers: [2001, 2002, 2003, 2004, 8001], direPlayers: PLAYERS.ogB,
  },
  // Older Aurora (id=1) matches for form/elo history
  {
    matchId: 7000007, leagueId: 12348, daysAgo: 14,
    radTeamId: 1, radName: 'Aurora',
    direTeamId: 4, direName: 'Team Liquid',
    radWin: true,
    picks: [[11,0,0],[1,1,0],[13,0,1],[8,1,1],[5,0,2],[7,1,2],[37,0,3],[3,1,3],[42,0,4],[40,1,4]],
    bans: [[12,0,0],[10,1,0]],
    radPlayers: PLAYERS.aurora, direPlayers: PLAYERS.liquidA,
  },
  {
    matchId: 7000008, leagueId: 12348, daysAgo: 16,
    radTeamId: 6, radName: 'PSG.LGD',
    direTeamId: 1, direName: 'Aurora',
    radWin: false,
    picks: [[8,0,0],[1,1,0],[17,0,1],[11,1,1],[3,0,2],[5,1,2],[40,0,3],[7,1,3],[12,0,4],[37,1,4]],
    bans: [[10,0,0],[46,1,0]],
    radPlayers: PLAYERS.lgdD, direPlayers: PLAYERS.aurora,
  },
  {
    matchId: 7000009, leagueId: 12349, daysAgo: 60,
    radTeamId: 2, radName: 'Spirit Wolves',
    direTeamId: 5, direName: 'Virtus.pro',
    radWin: true,
    picks: [[10,0,0],[8,1,0],[11,0,1],[12,1,1],[14,0,2],[5,1,2],[7,0,3],[3,1,3],[40,0,4],[16,1,4]],
    bans: [[1,0,0],[2,1,0]],
    radPlayers: PLAYERS.wolves, direPlayers: PLAYERS.vpC,
  },
  {
    matchId: 7000010, leagueId: 12349, daysAgo: 70,
    radTeamId: 4, radName: 'Team Liquid',
    direTeamId: 3, direName: 'OG',
    radWin: true,
    picks: [[1,0,0],[8,1,0],[11,0,1],[13,1,1],[5,0,2],[3,1,2],[7,0,3],[40,1,3],[42,0,4],[37,1,4]],
    bans: [[12,0,0],[10,1,0]],
    radPlayers: PLAYERS.liquidA, direPlayers: PLAYERS.ogB,
  },
];

function makeSummary(seed: MatchSeed): ODLeagueMatch {
  return {
    match_id: seed.matchId,
    leagueid: seed.leagueId,
    league_name: mockLeagues.find((l) => l.leagueid === seed.leagueId)?.name ?? 'League',
    start_time: Math.floor(Date.now() / 1000) - Math.floor(seed.daysAgo * 86400),
    duration: 1800 + Math.floor(Math.random() * 1200),
    radiant_team_id: seed.radTeamId,
    radiant_name: seed.radName,
    dire_team_id: seed.direTeamId,
    dire_name: seed.direName,
    radiant_win: seed.radWin,
    radiant_score: seed.radWin ? 30 : 18,
    dire_score: seed.radWin ? 15 : 28,
    series_id: 0,
    series_type: 1,
  };
}

function makeDetail(seed: MatchSeed): ODMatchDetail {
  return {
    match_id: seed.matchId,
    start_time: Math.floor(Date.now() / 1000) - Math.floor(seed.daysAgo * 86400),
    duration: 1800,
    radiant_win: seed.radWin,
    radiant_team_id: seed.radTeamId,
    dire_team_id: seed.direTeamId,
    leagueid: seed.leagueId,
    picks_bans: [
      ...seed.picks.map(([id, team, order]) => ({ is_pick: true, hero_id: id, team: team as 0 | 1, order })),
      ...seed.bans.map(([id, team, order]) => ({ is_pick: false, hero_id: id, team: team as 0 | 1, order })),
    ],
    players: [
      // Radiant: heroes for team 0 in seed.picks
      ...seed.picks
        .filter(([, t]) => t === 0)
        .map(([heroId], idx) => ({
          account_id: seed.radPlayers[idx] ?? 0,
          hero_id: heroId,
          isRadiant: true,
          personaname: PLAYER_NAMES[seed.radPlayers[idx] ?? 0] || `Player ${seed.radPlayers[idx]}`,
        })),
      ...seed.picks
        .filter(([, t]) => t === 1)
        .map(([heroId], idx) => ({
          account_id: seed.direPlayers[idx] ?? 0,
          hero_id: heroId,
          isRadiant: false,
          personaname: PLAYER_NAMES[seed.direPlayers[idx] ?? 0] || `Player ${seed.direPlayers[idx]}`,
        })),
    ],
  };
}

export const mockMatches: ODLeagueMatch[] = SEEDS.map(makeSummary);
export const mockMatchDetailsList: ODMatchDetail[] = SEEDS.map(makeDetail);
// Single-match fallback for backwards-compat
export const mockMatchDetail = mockMatchDetailsList[0];

export const mockLiveGames: ODLiveGame[] = [
  {
    match_id: 7999999999,
    league_id: 12345,
    activate_time: Math.floor(Date.now() / 1000) - 900,
    game_time: 900,
    radiant_team: { team_id: 5, team_name: 'Virtus.pro', team_logo: 0 },
    dire_team: { team_id: 6, team_name: 'PSG.LGD', team_logo: 0 },
    radiant_score: 8,
    dire_score: 5,
    radiant_lead: 2000,
    scoreboard: {
      radiant: { picks: [{ hero_id: 1 }, { hero_id: 11 }, { hero_id: 7 }, { hero_id: 5 }, { hero_id: 22 }] },
      dire: { picks: [{ hero_id: 8 }, { hero_id: 46 }, { hero_id: 3 }, { hero_id: 40 }, { hero_id: 42 }] },
    },
  },
];

export const mockHeroes = MOCK_HEROES;

export function shouldUseMock(): boolean {
  // Use mocks only when explicitly opted in. Production uses real OpenDota + Liquipedia.
  return process.env.NEXT_PUBLIC_USE_MOCK === 'true';
}
