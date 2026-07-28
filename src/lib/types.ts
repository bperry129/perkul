import type { Grade } from './grades';

export type GameStatus = 'draft' | 'needs_review' | 'ready' | 'published' | 'expired';
export type DerivedGameStatus = GameStatus | 'live';

export type RoundType =
  | 'mixed'
  | 'suspicious-real'
  | 'almost-a-word'
  | 'morphological'
  | 'familiar-root'
  | 'visual-family'
  | 'phonetic'
  | 'spelling-pattern';

export const ROUND_TYPES: RoundType[] = [
  'mixed',
  'suspicious-real',
  'almost-a-word',
  'morphological',
  'familiar-root',
  'visual-family',
  'phonetic',
  'spelling-pattern',
];

/** Round types that count against the "one strong visual family per game" cap. */
export const PATTERN_ROUND_TYPES: RoundType[] = ['visual-family', 'spelling-pattern'];

export type IntegrityStatus = 'valid' | 'suspicious' | 'unranked' | 'admin_review';

/* -------------------------------------------------------------------------- */
/* Editorial (server-side only) shapes                                        */
/* -------------------------------------------------------------------------- */

export type OptionRecord = {
  id: string;
  round_id: string;
  lexicon_entry_id: string | null;
  position: number;
  display_word: string;
  normalized_word: string;
  is_real: boolean;
  part_of_speech: string | null;
  short_definition: string | null;
  expanded_definition: string | null;
};

export type RoundRecord = {
  id: string;
  game_id: string;
  position: number;
  difficulty: number;
  round_type: RoundType;
  fake_option_id: string | null;
  intended_decoy_option_id: string | null;
  fake_rationale: string | null;
  decoy_rationale: string | null;
  editor_notes: string | null;
  approved: boolean;
  quality_checklist: Record<string, boolean>;
  options?: OptionRecord[];
};

export type GameRecord = {
  id: string;
  game_number: number;
  active_date: string;
  status: GameStatus;
  difficulty_label: string | null;
  editor_notes: string | null;
  published_at: string | null;
  source_batch_id: string | null;
  rounds?: RoundRecord[];
};

/* -------------------------------------------------------------------------- */
/* Public (browser safe) shapes — never contain answer data                    */
/* -------------------------------------------------------------------------- */

export type PublicOption = {
  /** round_options.id — an opaque uuid, reveals nothing */
  id: string;
  word: string;
  /** 1..5 as shown to this player */
  displayPosition: number;
};

export type PublicRound = {
  roundId: string;
  roundNumber: number;
  options: PublicOption[];
};

export type PublicGameSummary = {
  gameId: string;
  gameNumber: number;
  activeDate: string;
  roundCount: number;
};

export type ActiveAttemptPayload = {
  attemptId: string;
  game: PublicGameSummary;
  /** authoritative server start time, ISO */
  startedAt: string;
  serverNow: string;
  isRanked: boolean;
  mode: 'ranked' | 'practice';
  rounds: PublicRound[];
  /** round ids already answered, in order of answering */
  answeredRoundIds: string[];
};

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export type RoundResultOption = {
  optionId: string;
  word: string;
  isReal: boolean;
  partOfSpeech: string | null;
  shortDefinition: string | null;
  expandedDefinition: string | null;
  isFake: boolean;
  isIntendedDecoy: boolean;
  wasSelected: boolean;
  /** percentage of eligible players who chose this option, when permitted */
  selectionPercent?: number | null;
};

export type RoundResult = {
  roundId: string;
  roundNumber: number;
  difficulty: number;
  roundType: RoundType;
  isCorrect: boolean;
  responseMs: number | null;
  fakeWord: string;
  fakeRationale: string | null;
  decoyWord: string | null;
  decoyRationale: string | null;
  decoyShortDefinition: string | null;
  selectedWord: string | null;
  options: RoundResultOption[];
  stats?: {
    correctPercent: number;
    sampleSize: number;
    mostCommonWrongWord: string | null;
    mostCommonWrongPercent: number | null;
  } | null;
};

export type ComparisonMode = 'off' | 'real' | 'benchmark';

export type ResultComparison = {
  mode: ComparisonMode;
  /** real leaderboard rank when real data is used */
  rank?: number | null;
  total?: number | null;
  beatPercent?: number | null;
  topPercent?: number | null;
  benchmarkPopulation?: number | null;
  benchmarkName?: string | null;
  sampleSize?: number | null;
};

export type PersonalRecords = {
  isFirstPerfect: boolean;
  isPersonalBestPerfect: boolean;
  isBestScore: boolean;
  currentStreak: number;
  longestStreak: number;
  gamesPlayed: number;
};

export type AttemptResult = {
  attemptId: string;
  game: PublicGameSummary;
  correctCount: number;
  roundsTotal: number;
  elapsedMs: number;
  grade: Grade | null;
  isRanked: boolean;
  integrityStatus: IntegrityStatus;
  marks: boolean[];
  rounds: RoundResult[];
  comparison: ResultComparison;
  records?: PersonalRecords | null;
  isAuthenticated: boolean;
  shareText: string;
};

export type LeaderboardRow = {
  rank: number;
  attemptId: string;
  displayName: string;
  correctCount: number;
  elapsedMs: number;
  isRegistered: boolean;
  isSimulated: boolean;
  isYou?: boolean;
};
