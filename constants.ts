import { Rank } from "./types";

export const RANK_VALUES: Record<Rank, number> = {
  [Rank.Four]: 0,
  [Rank.Five]: 1,
  [Rank.Six]: 2,
  [Rank.Seven]: 3,
  [Rank.Eight]: 4,
  [Rank.Nine]: 5,
  [Rank.Ten]: 6,
  [Rank.Jack]: 7,
  [Rank.Queen]: 8,
  [Rank.King]: 9,
  [Rank.Ace]: 10,
  [Rank.Two]: 11,
  [Rank.Three]: 12,
  [Rank.SmallJoker]: 13,
  [Rank.BigJoker]: 14,
};

export const TOTAL_PLAYERS = 6;
export const CARDS_PER_PLAYER = 9;

export const TEAM_A_INDICES = [0, 2, 4];
export const TEAM_B_INDICES = [1, 3, 5];

export const EMOTE_LIST = [
  '出的好！',
  '你真臭...',
  '快点啊！',
  '给你小心心 ❤️',
  '我没戏了 😭'
];

export const LOBBY_MESSAGES = [
    '快点开始吧 ⏰',
    '再等个人 🙋',
    '我准备好了 ✅',
    '我要换队伍 🔄'
];

export const MAX_HISTORY_DISPLAY = 6;
export const TURN_DURATION = 30; // Seconds
export const HOSTED_TURN_DURATION = 5; // Seconds while hosted/auto-played
