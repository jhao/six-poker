export enum Suit {
  Hearts = '♥',
  Diamonds = '♦',
  Clubs = '♣',
  Spades = '♠',
  None = '' // For Jokers
}

export enum Rank {
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A',
  Two = '2',
  Three = '3',
  SmallJoker = 'S-Joker',
  BigJoker = 'B-Joker',
}

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
  isWild: boolean;
  isRed: boolean;
}

export enum HandType {
  Single = '单张',
  Pair = '对子',
  Triple = '三张',
  Quad = '四张',
  Invalid = '无效牌型'
}

export interface PlayedHand {
  cards: Card[];
  type: HandType;
  mainRankValue: number;
  playerId: number;
  playerName: string; // Snapshot of name
  playerTeam: 'A' | 'B'; // Snapshot of team
}

export interface Player {
  id: number;
  name: string;
  team: 'A' | 'B';
  hand: Card[];
  isHuman: boolean; // false means Bot or Disconnected/Taken over
  isFinished: boolean;
  finishOrder: number | null;
  isReady: boolean; // For lobby
  isConnected: boolean; // For disconnect logic
  isAutoPlayed: boolean; // New: If true, the player is being hosted due to timeout
  seatIndex: number; // 0-5
}

export interface ScoreRecord {
  round: number;
  winnerTeam: 'A' | 'B' | 'Draw';
  teamAScore: number;
  teamBScore: number;
  details: string;
}

export interface EmoteMessage {
  senderId: number;
  targetId: number; // -1 for broadcast/lobby
  content: string;
  timestamp: number;
}

export type ViewState = 'home' | 'lobby' | 'room_waiting' | 'game' | 'score_summary';

export interface RoomInfo {
  roomId: string;
  password?: string;
  hostId: number;
  players: Player[];
  isStarted: boolean; // To check if spectator needed
}

export interface GameState {
  players: Player[];
  currentTurnIndex: number; // Index in the players array
  handHistory: PlayedHand[]; // Stack of recent 6 hands
  deck: Card[];
  passCount: number;
  winners: string[];
  logs: string[];
  activeEmotes: EmoteMessage[];
  scores: ScoreRecord[];
  currentRound: number;
  gameStatus: 'waiting' | 'playing' | 'roundOver';
  turnTimeLeft: number; // Seconds remaining for current turn
}

export interface UserStats {
  singlePlayer: { played: number; wins: number };
  multiPlayer: { played: number; wins: number };
}