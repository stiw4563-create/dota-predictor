// Lightweight shapes covering only the fields we actually use from OpenDota
// plus our own derived domain models.

export type Side = 'radiant' | 'dire';

// ───────── OpenDota raw ─────────
export interface ODLeague {
  leagueid: number;
  ticket?: string | null;
  banner?: string | null;
  tier: 'amateur' | 'professional' | 'premium' | 'excluded' | string | null;
  name: string;
  last_match_time?: number; // unix seconds
}

export interface ODLeagueMatch {
  match_id: number;
  duration: number;
  start_time: number;
  radiant_team_id: number | null;
  radiant_name: string | null;
  dire_team_id: number | null;
  dire_name: string | null;
  leagueid: number;
  league_name: string;
  series_id: number;
  series_type: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
}

export interface ODMatchDetail {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_win: boolean;
  radiant_team_id?: number;
  dire_team_id?: number;
  leagueid: number;
  picks_bans?: Array<{
    is_pick: boolean;
    hero_id: number;
    team: 0 | 1; // 0 radiant 1 dire
    order: number;
  }>;
  players?: Array<{
    account_id?: number;
    hero_id: number;
    isRadiant: boolean;
    name?: string;
    personaname?: string;
  }>;
  radiant_gold_adv?: number[]; // per-minute gold advantage (radiant perspective)
  radiant_xp_adv?: number[];   // per-minute xp advantage
}

export interface ODLiveGame {
  activate_time?: number;
  deactivate_time?: number;
  game_time?: number;
  match_id?: string | number;
  league_id?: number;
  radiant_team?: { team_id?: number; team_name?: string; team_logo?: number };
  dire_team?: { team_id?: number; team_name?: string; team_logo?: number };
  players?: Array<{
    account_id?: number;
    hero_id?: number;
    name?: string;
    team?: 0 | 1 | 2 | 3;
  }>;
  scoreboard?: {
    duration?: number;
    radiant?: {
      score?: number;
      net_worth?: number;
      picks?: Array<{ hero_id: number }>;
    };
    dire?: {
      score?: number;
      net_worth?: number;
      picks?: Array<{ hero_id: number }>;
    };
  };
  radiant_lead?: number;
  radiant_score?: number;
  dire_score?: number;
}

export interface ODHero {
  id: number;
  name: string;          // npc_dota_hero_*
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  roles: string[];
}

// ───────── Our derived domain ─────────

export interface Tournament {
  id: number;
  name: string;
  tier: string;
  status: 'live' | 'recent' | 'upcoming';
  lastMatchTime: number | null;
  matchCount: number;
}

export interface MatchSummary {
  matchId: number;
  startTime: number;
  duration: number;
  radiantTeamId: number | null;
  radiantName: string;
  direTeamId: number | null;
  direName: string;
  radiantWin: boolean;
  leagueId: number;
  leagueName: string;
}

export interface LiveMatchSummary {
  matchId: number;
  leagueId: number;
  radiantTeamId: number | null;
  radiantName: string;
  direTeamId: number | null;
  direName: string;
  radiantPicks: number[];
  direPicks: number[];
  gameTime: number;
  radiantScore: number;
  direScore: number;
}

export interface Team {
  id: number;
  name: string;
  tag?: string;
}

export interface PredictionContributions {
  elo: number;
  form: number;
  h2h: number;
  draft: number;
  heroFit: number;
  side: number;
}

export interface PredictionInputs {
  deltaElo: number;
  deltaForm: number;
  h2hFactor: number;
  deltaDraft: number;
  deltaHeroFit: number;
  sideAdv: number;
  poolMatches: number;
  poolRadiantWR: number;
}

export interface Prediction {
  probA: number; // prob that team A wins (calibrated if calibration available)
  probB: number;
  rawProbA?: number; // uncalibrated sigmoid(logit), for comparison
  logit: number; // raw logit (sum of contributions) - used by calibration
  calibrated?: boolean;
  usedTrainedModel?: boolean;
  // honest confidence: 'high' | 'medium' | 'low' based on margin + model quality
  confidence?: 'high' | 'medium' | 'low';
  confidenceNote?: string;
  contributions: PredictionContributions;
  inputs: PredictionInputs;
}

export interface TeamStatsInPool {
  teamId: number;
  name: string;
  matches: number;
  wins: number;
  winrate: number;
  recentFormWR: number;   // exp-weighted recent WR
  elo: number;
  lastSeen: number | null;
  // identity: tracking the team via roster
  aliases: string[];       // alternative names seen in the pool
  coreRoster: number[];    // top 5 player ids that played most for this team
  identityClusterId: number; // groups teams that share ≥3 players (covers renames)
  avgGoldXpAdv?: number;   // historical avg late-game gold+xp advantage (signed)
}

export interface PlayerStats {
  accountId: number;
  matches: number;
  wins: number;
  winrate: number;
  // heroId → games/wins on that hero
  heroes: Record<number, { games: number; wins: number; winrate: number }>;
  // current/likely team in the pool
  teamId: number | null;
  name: string;
}

export interface HeroStatsInPool {
  heroId: number;
  radiantGames: number;
  radiantWins: number;
  direGames: number;
  direWins: number;
  radiantWR: number;
  direWR: number;
  totalGames: number;
  bans: number;             // how often banned in the pool
  pickPriority: number;     // avg pick order (lower = picked earlier = higher priority)
}

export interface H2HRecord {
  teamA: number;
  teamB: number;
  totalGames: number;
  winsA: number;
  winsB: number;
  // include matches between earlier names of the same identity cluster
  clusterTotalGames: number;
  clusterWinsA: number;
  clusterWinsB: number;
}

export interface CounterPickInfo {
  heroId: number;
  winrateAgainst: number;   // WR for this hero when faced against the opposing draft
  sampleSize: number;
}

export interface AnalyzeResponse {
  teamAStats: TeamStatsInPool | null;
  teamBStats: TeamStatsInPool | null;
  h2h: H2HRecord;
  heroSidePool: Record<number, HeroStatsInPool>;
  poolRadiantWR: number;
  poolGameCount: number;
  prediction: Prediction;
  warnings: string[];
  // new fields
  topHeroesRadiant: Array<{ heroId: number; winrate: number; games: number }>;
  topHeroesDire: Array<{ heroId: number; winrate: number; games: number }>;
  mostBanned: Array<{ heroId: number; bans: number }>;
  playerHeroFitA: Array<{ accountId: number; heroId: number; winrate: number; games: number; name: string }>;
  playerHeroFitB: Array<{ accountId: number; heroId: number; winrate: number; games: number; name: string }>;
  counterPicksForA: CounterPickInfo[];
  counterPicksForB: CounterPickInfo[];
  // series-adjusted head-to-head
  seriesH2H?: {
    seriesPlayed: number;
    seriesWinsA: number;
    seriesWinsB: number;
    gamesA: number;
    gamesB: number;
  };
}
