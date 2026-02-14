import { Card, Suit, Rank, HandType, PlayedHand } from '../types';
import { RANK_VALUES } from '../constants';

// Generate a fresh deck
export const createDeck = (): Card[] => {
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = [
    Rank.Four, Rank.Five, Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten,
    Rank.Jack, Rank.Queen, Rank.King, Rank.Ace, Rank.Two, Rank.Three
  ];

  let deck: Card[] = [];
  let idCounter = 0;

  // Standard cards
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

  // Jokers
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

// Sort hand: Wilds (Big Joker -> 2) then regular (Ace -> 4)
export const sortHand = (hand: Card[]): Card[] => {
  return [...hand].sort((a, b) => b.value - a.value);
};

// Identify the hand type and value
export const analyzeHand = (cards: Card[]): { type: HandType; mainRankValue: number } => {
  if (cards.length === 0) return { type: HandType.Invalid, mainRankValue: -1 };

  // Separate wilds and non-wilds
  const wilds = cards.filter(c => c.isWild);
  const nonWilds = cards.filter(c => !c.isWild);

  // 1. Single Card
  if (cards.length === 1) {
    return { type: HandType.Single, mainRankValue: cards[0].value };
  }

  // 2. Multiple Cards
  // Logic: All non-wilds must be the same rank.
  if (nonWilds.length > 0) {
    const firstVal = nonWilds[0].value;
    const allSame = nonWilds.every(c => c.value === firstVal);
    if (!allSame) return { type: HandType.Invalid, mainRankValue: -1 };

    // Valid combination (Wilds act as the non-wild rank)
    const count = cards.length;
    if (count === 2) return { type: HandType.Pair, mainRankValue: firstVal };
    if (count === 3) return { type: HandType.Triple, mainRankValue: firstVal };
    if (count === 4) return { type: HandType.Quad, mainRankValue: firstVal };
  } else {
    // ONLY WILDS
    // Rule: "Two or more wilds take the smallest".
    // Example: Big Joker + 3 -> Pair of 3s.
    // Example: 2 + 3 -> Pair of 2s (Actually 2 < 3? No, 2=11, 3=12. So 2 is smaller wild logic-wise?
    // Wait, Rule says: 大王＞小王＞3＞2. So 2 is smallest wild.
    // However, if we play [Big Joker, 3], the smallest is 3?
    // Let's look at logic values: 2=11, 3=12, SJ=13, BJ=14.
    // Rule says: "Two or more composed of wilds take smallest".
    // Meaning the rank value is the minimum of the wilds.
    
    // Find min value card
    const minWildValue = Math.min(...wilds.map(c => c.value));
    const count = cards.length;
    if (count === 2) return { type: HandType.Pair, mainRankValue: minWildValue };
    if (count === 3) return { type: HandType.Triple, mainRankValue: minWildValue };
    if (count === 4) return { type: HandType.Quad, mainRankValue: minWildValue };
  }

  return { type: HandType.Invalid, mainRankValue: -1 };
};

// Check if current cards beat the last hand
export const canBeat = (newCards: Card[], lastHand: PlayedHand): boolean => {
  const analysis = analyzeHand(newCards);
  
  // Must match type
  if (analysis.type !== lastHand.type) return false;
  
  // Must be strictly larger
  return analysis.mainRankValue > lastHand.mainRankValue;
};

// Simple AI to find a valid move
export const findAutoMove = (hand: Card[], lastHand: PlayedHand | null): Card[] | null => {
  // If free turn, play smallest single
  if (!lastHand) {
    // Try to save wilds, play smallest non-wild
    const nonWilds = hand.filter(c => !c.isWild);
    if (nonWilds.length > 0) return [nonWilds[nonWilds.length - 1]];
    return [hand[hand.length - 1]]; // Play smallest wild
  }

  const reqCount = lastHand.cards.length;
  const reqType = lastHand.type;
  const reqVal = lastHand.mainRankValue;

  // Simple Greedy Strategy:
  // 1. Look for exact natural matches (e.g., Pair of 5s beating Pair of 4s)
  // 2. Look for wild-assisted matches
  
  // Group cards by rank
  const groups: Record<number, Card[]> = {};
  hand.forEach(c => {
    if (!groups[c.value]) groups[c.value] = [];
    groups[c.value].push(c);
  });

  // Try to find natural beats first (saving wilds)
  const sortedValues = Object.keys(groups).map(Number).sort((a, b) => a - b);
  
  for (const val of sortedValues) {
    if (val > reqVal && !groups[val][0].isWild) { // Must be bigger and ideally not pure wild
       if (groups[val].length >= reqCount) {
         // We have enough naturals
         return groups[val].slice(0, reqCount);
       }
    }
  }

  // Try using wilds
  // Calculate available wilds
  const myWilds = hand.filter(c => c.isWild);
  
  // Try to combine a natural group with wilds
  for (const val of sortedValues) {
      if (val > reqVal) { // Candidate rank
          const naturalCount = groups[val].length;
          const needed = reqCount - naturalCount;
          if (needed > 0 && myWilds.length >= needed) {
             // Avoid using the wild if it's the same card (already in group if rank is 2/3)
             // If val is a Wild rank (e.g. 2 or 3), it's already in 'groups'.
             // This logic is complex. Simplified:
             
             // Check if we can form a hand of length `reqCount` with value `val`
             // Construct candidate
             const candidates = [...groups[val]];
             // Add distinct wilds until full
             for (const w of myWilds) {
                 if (candidates.length >= reqCount) break;
                 if (!candidates.find(c => c.id === w.id)) {
                     candidates.push(w);
                 }
             }
             
             if (candidates.length === reqCount) {
                 return candidates;
             }
          }
      }
  }

  // Pure wild beat (if we have pure wilds bigger than target)
  // E.g. last hand is Single 5. We have Single 2.
  // This is covered by the first loop if they are grouped correctly.
  
  return null;
};
