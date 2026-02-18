import { Card, Suit, Rank, HandType, PlayedHand, Player } from '../types';
import { RANK_VALUES } from '../constants';

export interface AutoMoveContext {
  playerId: number;
  players: Player[];
  playerTurnHistory?: Record<number, { plays: number; passes: number }>;
}

const TRUMP_RANKS = new Set<Rank>([Rank.BigJoker, Rank.SmallJoker, Rank.Three, Rank.Two, Rank.Ace]);

// Generate a fresh deck
export const createDeck = (): Card[] => {
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = [
    Rank.Four, Rank.Five, Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten,
    Rank.Jack, Rank.Queen, Rank.King, Rank.Ace, Rank.Two, Rank.Three
  ];

  let deck: Card[] = [];
  let idCounter = 0;

  for (const suit of suits) {
    for (const rank of ranks) {
      const isRed = suit === Suit.Hearts || suit === Suit.Diamonds;
      const isWild = rank === Rank.Two || rank === Rank.Three;
      deck.push({
        id: `card-${idCounter++}`,
        suit,
        rank,
        value: RANK_VALUES[rank],
        isWild,
        isRed
      });
    }
  }

  deck.push({
    id: `card-${idCounter++}`,
    suit: Suit.None,
    rank: Rank.SmallJoker,
    value: RANK_VALUES[Rank.SmallJoker],
    isWild: true,
    isRed: false
  });
  deck.push({
    id: `card-${idCounter++}`,
    suit: Suit.None,
    rank: Rank.BigJoker,
    value: RANK_VALUES[Rank.BigJoker],
    isWild: true,
    isRed: true
  });

  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const sortHand = (hand: Card[]): Card[] => {
  return [...hand].sort((a, b) => b.value - a.value);
};

export const analyzeHand = (cards: Card[]): { type: HandType; mainRankValue: number } => {
  if (cards.length === 0) return { type: HandType.Invalid, mainRankValue: -1 };

  const wilds = cards.filter(c => c.isWild);
  const nonWilds = cards.filter(c => !c.isWild);

  if (cards.length === 1) {
    return { type: HandType.Single, mainRankValue: cards[0].value };
  }

  if (nonWilds.length > 0) {
    const firstVal = nonWilds[0].value;
    const allSame = nonWilds.every(c => c.value === firstVal);
    if (!allSame) return { type: HandType.Invalid, mainRankValue: -1 };

    const count = cards.length;
    if (count === 2) return { type: HandType.Pair, mainRankValue: firstVal };
    if (count === 3) return { type: HandType.Triple, mainRankValue: firstVal };
    if (count === 4) return { type: HandType.Quad, mainRankValue: firstVal };
  } else {
    const minWildValue = Math.min(...wilds.map(c => c.value));
    const count = cards.length;
    if (count === 2) return { type: HandType.Pair, mainRankValue: minWildValue };
    if (count === 3) return { type: HandType.Triple, mainRankValue: minWildValue };
    if (count === 4) return { type: HandType.Quad, mainRankValue: minWildValue };
  }

  return { type: HandType.Invalid, mainRankValue: -1 };
};

export const canBeat = (newCards: Card[], lastHand: PlayedHand): boolean => {
  const analysis = analyzeHand(newCards);
  if (analysis.type !== lastHand.type) return false;
  return analysis.mainRankValue > lastHand.mainRankValue;
};

const generateLegalMoves = (hand: Card[], lastHand: PlayedHand | null): Card[][] => {
  const legalMoves: Card[][] = [];
  const seen = new Set<string>();
  const sizes = lastHand ? [lastHand.cards.length] : [1, 2, 3, 4];

  const dfs = (start: number, size: number, path: Card[]) => {
    if (path.length === size) {
      const key = path.map(c => c.id).sort().join('|');
      if (seen.has(key)) return;
      const valid = lastHand ? canBeat(path, lastHand) : analyzeHand(path).type !== HandType.Invalid;
      if (!valid) return;
      seen.add(key);
      legalMoves.push([...path]);
      return;
    }
    for (let i = start; i < hand.length; i++) {
      path.push(hand[i]);
      dfs(i + 1, size, path);
      path.pop();
    }
  };

  for (const size of sizes) {
    if (size <= hand.length) dfs(0, size, []);
  }

  return legalMoves;
};

const cardStrength = (move: Card[]): number => {
  const { mainRankValue } = analyzeHand(move);
  return mainRankValue + move.length * 0.35;
};

const remainingHandCost = (move: Card[], hand: Card[]): number => {
  const moveIds = new Set(move.map(c => c.id));
  const remaining = hand.filter(c => !moveIds.has(c.id));
  if (remaining.length === 0) return -5;

  const valueCost = remaining.reduce((sum, c) => sum + (c.value + 1) / 4, 0);
  const structurePenalty = new Set(remaining.map(c => c.value)).size * 0.7;
  const wildPenalty = remaining.filter(c => c.isWild).length * 1.8;
  return valueCost + structurePenalty + wildPenalty;
};

const isHighImpactCard = (move: Card[]): boolean => {
  const { type } = analyzeHand(move);
  return type === HandType.Quad || move.some(c => [Rank.Two, Rank.Three, Rank.SmallJoker, Rank.BigJoker].includes(c.rank));
};

const isTrumpCard = (card: Card): boolean => TRUMP_RANKS.has(card.rank);

const moveIsTrump = (move: Card[]): boolean => move.length > 0 && move.every(isTrumpCard);

const trumpRatio = (hand: Card[]): number => hand.length === 0 ? 0 : hand.filter(isTrumpCard).length / hand.length;

const controlFollowups = (move: Card[], hand: Card[]): number => {
  const moveIds = new Set(move.map(c => c.id));
  const remaining = hand.filter(c => !moveIds.has(c.id));
  if (remaining.length === 0) return 0;

  const { type, mainRankValue } = analyzeHand(move);
  const req = move.length;
  const groups = new Map<number, Card[]>();
  for (const card of remaining) {
    const cards = groups.get(card.value) || [];
    cards.push(card);
    groups.set(card.value, cards);
  }

  let count = 0;
  groups.forEach((cards, value) => {
    if (value <= mainRankValue || cards.length < req) return;
    const candidate = cards.slice(0, req);
    if (analyzeHand(candidate).type === type) count += 1;
  });
  return count;
};

const teammateCardsLeft = (ctx: AutoMoveContext): number => {
  const me = ctx.players[ctx.playerId];
  if (!me) return 0;
  const mates = ctx.players.filter(p => !p.isFinished && p.id !== me.id && p.team === me.team);
  if (mates.length === 0) return 0;
  return Math.min(...mates.map(p => p.hand.length));
};

const opponentCardsLeft = (ctx: AutoMoveContext): number[] => {
  const me = ctx.players[ctx.playerId];
  if (!me) return [];
  return ctx.players.filter(p => !p.isFinished && p.team !== me.team).map(p => p.hand.length);
};

const evaluateLead = (move: Card[], hand: Card[], ctx?: AutoMoveContext): number => {
  const LEAD_STRENGTH_WEIGHT = 1.6;
  const HAND_COST_WEIGHT = 0.45;
  const HIGH_IMPACT_BONUS = 2.2;

  let score = 0;
  score += cardStrength(move) * LEAD_STRENGTH_WEIGHT;
  score -= remainingHandCost(move, hand) * HAND_COST_WEIGHT;
  if (isHighImpactCard(move)) score += HIGH_IMPACT_BONUS;

  const ratio = trumpRatio(hand);
  if (move.some(isTrumpCard)) score -= ratio < 0.45 ? 3 : 0.8;
  if (ratio >= 0.6 && moveIsTrump(move)) score += 2;
  score += controlFollowups(move, hand) * 1.35;

  if (ctx?.playerTurnHistory && Object.values(ctx.playerTurnHistory).some(v => v.passes >= 2)) {
    score += 0.5;
  }
  return score;
};


const teammateCanCover = (move: Card[], ctx: AutoMoveContext): boolean => {
  const me = ctx.players[ctx.playerId];
  if (!me) return false;
  const { type, mainRankValue } = analyzeHand(move);
  const req = move.length;
  const mates = ctx.players.filter(p => !p.isFinished && p.id !== me.id && p.team === me.team);
  for (const mate of mates) {
    const groups = new Map<number, Card[]>();
    for (const card of mate.hand) {
      const cards = groups.get(card.value) || [];
      cards.push(card);
      groups.set(card.value, cards);
    }
    for (const [value, cards] of groups.entries()) {
      if (value <= mainRankValue || cards.length < req) continue;
      const candidate = cards.slice(0, req);
      if (analyzeHand(candidate).type === type) return true;
    }
  }
  return false;
};
const evaluateResponse = (move: Card[], hand: Card[], lastHand: PlayedHand, ctx?: AutoMoveContext): number => {
  const RESPONSE_SUCCESS_WEIGHT = 5;
  const HAND_COST_WEIGHT = 0.45;
  const PRESSURE_THRESHOLD = 2;
  const PRESSURE_BONUS = 2.2;

  let score = 0;
  if (canBeat(move, lastHand)) score += RESPONSE_SUCCESS_WEIGHT;
  score -= remainingHandCost(move, hand) * HAND_COST_WEIGHT;

  // 跟牌优先以小牌试探：能自管或队友能接力时，不急于交大牌。
  score -= cardStrength(move) * 0.2;
  const followups = controlFollowups(move, hand);
  score += followups * 1.2;
  if (followups === 0) score -= 0.8;

  if (move.some(isTrumpCard)) score -= trumpRatio(hand) < 0.45 ? 2 : 0.6;

  if (ctx) {
    const oppLeft = opponentCardsLeft(ctx);
    if (oppLeft.length > 0 && Math.min(...oppLeft) <= PRESSURE_THRESHOLD) {
      score += PRESSURE_BONUS;
      if (move.length > 1) score += 0.6;
    }

    const lastPid = lastHand.playerId;
    if ((ctx.playerTurnHistory?.[lastPid]?.plays || 0) >= 3) score += 0.4;
  }

  return score;
};

export const findAutoMove = (
  hand: Card[],
  lastHand: PlayedHand | null,
  ctx?: AutoMoveContext
): Card[] | null => {
  const legalMoves = generateLegalMoves(hand, lastHand);
  if (legalMoves.length === 0) return null;

  const SUPPORT_THRESHOLD = 2;
  const TEAM_SUPPORT_BONUS = 1.8;
  const mateLeft = ctx ? teammateCardsLeft(ctx) : 0;

  if (ctx && lastHand) {
    const me = ctx.players[ctx.playerId];
    const lastPlayer = ctx.players[lastHand.playerId];
    const oppLeft = opponentCardsLeft(ctx);
    const teammateLed = Boolean(me && lastPlayer && me.team === lastPlayer.team && me.id !== lastPlayer.id);
    const teammateCritical = Boolean(lastPlayer && lastPlayer.hand.length <= 2);
    if (teammateLed && moveIsTrump(lastHand.cards) && (teammateCritical || (oppLeft.length > 0 && Math.min(...oppLeft) > 1))) {
      return null;
    }
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMove: Card[] | null = null;

  for (const move of legalMoves) {
    let moveScore = lastHand
      ? evaluateResponse(move, hand, lastHand, ctx)
      : evaluateLead(move, hand, ctx);

    if (ctx && lastHand && teammateCanCover(move, ctx)) {
      moveScore += 1.8;
    }

    if (mateLeft > 0 && mateLeft <= SUPPORT_THRESHOLD) {
      moveScore += TEAM_SUPPORT_BONUS;
      if (move.length > 1) moveScore += 0.4;

      if (ctx && lastHand) {
        const me = ctx.players[ctx.playerId];
        const lastPlayer = ctx.players[lastHand.playerId];
        if (me && lastPlayer && me.team === lastPlayer.team && me.id !== lastPlayer.id && move.some(isTrumpCard)) {
          moveScore -= 2;
        }
      }
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = move;
    }
  }

  return bestMove;
};
