import random
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "3", "SJ", "BJ"]
SUITS = ["♥", "♦", "♣", "♠"]
RANK_VALUES = {rank: i for i, rank in enumerate(RANKS)}
TEAM_A = {0, 2, 4}


@dataclass
class Card:
    id: str
    suit: str
    rank: str
    value: int
    is_wild: bool


@dataclass
class Player:
    id: int
    name: str
    team: str
    hand: List[Card] = field(default_factory=list)
    ready: bool = False
    is_bot: bool = False
    finished: bool = False


@dataclass
class PlayedHand:
    player_id: int
    cards: List[Card]
    hand_type: str
    main_rank: int


@dataclass
class Room:
    room_id: str
    password: str
    host_id: int
    players: List[Player]
    game_status: str = "waiting"
    turn_index: int = 0
    last_hand: Optional[PlayedHand] = None
    pass_count: int = 0
    winners: List[int] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)


def _create_deck() -> List[Card]:
    deck = []
    cid = 0
    for s in SUITS:
        for r in RANKS[:-2]:
            deck.append(Card(f"c{cid}", s, r, RANK_VALUES[r], r in {"2", "3"}))
            cid += 1
    deck.append(Card(f"c{cid}", "", "SJ", RANK_VALUES["SJ"], True)); cid += 1
    deck.append(Card(f"c{cid}", "", "BJ", RANK_VALUES["BJ"], True))
    random.shuffle(deck)
    return deck


def _sort_hand(hand: List[Card]) -> List[Card]:
    return sorted(hand, key=lambda c: c.value, reverse=True)


def _analyze(cards: List[Card]):
    if not cards:
        return "invalid", -1
    if len(cards) == 1:
        return "single", cards[0].value
    wild = [c for c in cards if c.is_wild]
    normal = [c for c in cards if not c.is_wild]
    if normal:
        v = normal[0].value
        if any(c.value != v for c in normal):
            return "invalid", -1
        return ({2: "pair", 3: "triple", 4: "quad"}.get(len(cards), "invalid"), v)
    mv = min(c.value for c in wild)
    return ({2: "pair", 3: "triple", 4: "quad"}.get(len(cards), "invalid"), mv)


def _can_beat(cards: List[Card], last: Optional[PlayedHand]) -> bool:
    t, v = _analyze(cards)
    if t == "invalid":
        return False
    if not last:
        return True
    return t == last.hand_type and v > last.main_rank


def _auto_move(hand: List[Card], last: Optional[PlayedHand]) -> Optional[List[Card]]:
    ordered = sorted(hand, key=lambda c: c.value)
    if not last:
        non_wild = [c for c in ordered if not c.is_wild]
        return [non_wild[0] if non_wild else ordered[0]] if ordered else None
    req = len(last.cards)
    groups: Dict[int, List[Card]] = {}
    for c in ordered:
        groups.setdefault(c.value, []).append(c)
    for v in sorted(groups):
        if v > last.main_rank and len(groups[v]) >= req:
            cand = groups[v][:req]
            if _can_beat(cand, last):
                return cand
    return None


def create_room(name: str) -> Room:
    rid = str(random.randint(1000, 9999))
    pwd = str(random.randint(1000, 9999))
    players = [Player(i, f"空位 {i+1}", "A" if i in TEAM_A else "B", is_bot=True, ready=False) for i in range(6)]
    players[0] = Player(0, name, "A", is_bot=False, ready=False)
    return Room(rid, pwd, 0, players, logs=[f"房主 {name} 创建了房间"])


def start_game(room: Room):
    deck = _create_deck()
    starter = 0
    for p in room.players:
        p.hand = _sort_hand([deck.pop() for _ in range(9)])
        p.finished = False
        if any(c.suit == '♥' and c.rank == '4' for c in p.hand):
            starter = p.id
    room.game_status = "playing"
    room.turn_index = starter
    room.last_hand = None
    room.pass_count = 0
    room.winners = []
    room.logs.append(f"游戏开始，{room.players[starter].name} 持有红桃4先手")


def serialize(room: Room, viewer_id: Optional[int] = None):
    data = asdict(room)
    for p in data["players"]:
        if viewer_id is None or p["id"] != viewer_id:
            p["hand"] = [{"id": c["id"]} for c in p["hand"]]
        else:
            p["hand"] = p["hand"]
    return data


def join_room(room: Room, name: str):
    for p in room.players:
        if p.is_bot:
            p.name = name
            p.is_bot = False
            p.ready = False
            room.logs.append(f"{name} 加入了房间")
            return p.id
    return None


def apply_action(room: Room, player_id: int, action: str, card_ids: Optional[List[str]] = None):
    if room.game_status != "playing":
        return False, "游戏未开始"
    cur = room.players[room.turn_index]
    if cur.id != player_id:
        return False, "还没轮到你"
    if action == "pass":
        if room.last_hand is None:
            return False, "新一轮必须出牌"
        room.pass_count += 1
        room.logs.append(f"{cur.name} 过牌")
    else:
        selected = [c for c in cur.hand if c.id in set(card_ids or [])]
        if not selected:
            return False, "未选择牌"
        if not _can_beat(selected, room.last_hand):
            return False, "牌型不合法或压不过"
        cur.hand = [c for c in cur.hand if c.id not in set(card_ids)]
        t, v = _analyze(selected)
        room.last_hand = PlayedHand(player_id, selected, t, v)
        room.pass_count = 0
        room.logs.append(f"{cur.name} 出了 {len(selected)} 张牌")
        if not cur.hand and cur.id not in room.winners:
            cur.finished = True
            room.winners.append(cur.id)

    team_a_finished = sum(1 for p in room.players if p.finished and p.id in TEAM_A)
    team_b_finished = sum(1 for p in room.players if p.finished and p.id not in TEAM_A)
    if team_a_finished >= 3 or team_b_finished >= 3:
        room.game_status = "round_over"
        winner = 'A' if team_a_finished >= 3 else 'B'
        room.logs.append(f"本局结束，{winner}队全员出完")
        return True, "ok"

    alive = [p for p in room.players if not p.finished]

    for _ in range(6):
        room.turn_index = (room.turn_index + 1) % 6
        if not room.players[room.turn_index].finished:
            break
    if room.pass_count >= len(alive) - 1:
        room.last_hand = None
        room.pass_count = 0
        room.logs.append("一轮过牌，重置牌权")

    nxt = room.players[room.turn_index]
    if nxt.is_bot:
        mv = _auto_move(nxt.hand, room.last_hand)
        if mv:
            apply_action(room, nxt.id, "play", [c.id for c in mv])
        else:
            apply_action(room, nxt.id, "pass", [])

    room.updated_at = time.time()
    return True, "ok"
