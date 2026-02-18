import random
import time
from dataclasses import dataclass, field, asdict
from itertools import combinations
from typing import Dict, List, Optional

RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "3", "SJ", "BJ"]
SUITS = ["♥", "♦", "♣", "♠"]
RANK_VALUES = {rank: i for i, rank in enumerate(RANKS)}
TEAM_A = {0, 2, 4}
TRUMP_RANKS = {"BJ", "SJ", "3", "2", "A"}


def _team_for_seat(seat_id: int) -> str:
    return "A" if seat_id in TEAM_A else "B"


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
    hand_history: List[PlayedHand] = field(default_factory=list)
    spectator_names: List[str] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)
    emotes: List[dict] = field(default_factory=list)
    player_turn_history: Dict[int, Dict[str, int]] = field(default_factory=dict)
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


def _generate_legal_moves(hand: List[Card], last: Optional[PlayedHand]) -> List[List[Card]]:
    if not hand:
        return []
    if last:
        sizes = [len(last.cards)]
    else:
        sizes = [1, 2, 3, 4]

    legal: List[List[Card]] = []
    seen = set()
    for size in sizes:
        if size > len(hand):
            continue
        for combo in combinations(hand, size):
            cards = list(combo)
            if not _can_beat(cards, last):
                continue
            key = tuple(sorted(c.id for c in cards))
            if key in seen:
                continue
            seen.add(key)
            legal.append(cards)

    return legal


def _remaining_hand_cost(move: List[Card], hand: List[Card]) -> float:
    remaining = [c for c in hand if c.id not in {m.id for m in move}]
    if not remaining:
        return -4.0

    value_cost = sum((c.value + 1) / 4 for c in remaining)
    wild_penalty = sum(2 for c in remaining if c.is_wild)
    scatter_penalty = len({c.value for c in remaining}) * 0.8
    return value_cost + wild_penalty + scatter_penalty


def _is_high_impact_card(move: List[Card]) -> bool:
    hand_type, _ = _analyze(move)
    if hand_type == "quad":
        return True
    return any(c.rank in {"BJ", "SJ", "3", "2"} for c in move)


def _is_trump_card(card: Card) -> bool:
    return card.rank in TRUMP_RANKS


def _move_is_trump(move: List[Card]) -> bool:
    return all(_is_trump_card(c) for c in move)


def _trump_ratio(hand: List[Card]) -> float:
    return (sum(1 for c in hand if _is_trump_card(c)) / len(hand)) if hand else 0.0


def _control_followups(move: List[Card], hand: List[Card]) -> int:
    move_ids = {c.id for c in move}
    remaining = [c for c in hand if c.id not in move_ids]
    if not remaining:
        return 0

    move_type, move_rank = _analyze(move)
    req = len(move)
    groups: Dict[int, List[Card]] = {}
    for c in remaining:
        groups.setdefault(c.value, []).append(c)

    count = 0
    for v, cards in groups.items():
        if v > move_rank and len(cards) >= req:
            cand = cards[:req]
            t, _ = _analyze(cand)
            if t == move_type:
                count += 1
    return count


def _teammate_can_cover(room: Room, player: Player, move: List[Card]) -> bool:
    move_type, move_rank = _analyze(move)
    req = len(move)
    teammates = [p for p in room.players if not p.finished and p.id != player.id and p.team == player.team]
    for mate in teammates:
        groups: Dict[int, List[Card]] = {}
        for c in mate.hand:
            groups.setdefault(c.value, []).append(c)
        for v, cards in groups.items():
            if v <= move_rank or len(cards) < req:
                continue
            cand = cards[:req]
            t, _ = _analyze(cand)
            if t == move_type:
                return True
    return False


def _card_strength(move: List[Card]) -> float:
    _, main = _analyze(move)
    return main + len(move) * 0.4


def _teammate_cards_left(room: Room, seat_id: int) -> int:
    team = _team_for_seat(seat_id)
    mates = [p for p in room.players if p.id != seat_id and p.team == team and not p.finished]
    return min((len(p.hand) for p in mates), default=0)


def _opponent_cards_left(room: Room, seat_id: int) -> List[int]:
    team = _team_for_seat(seat_id)
    return [len(p.hand) for p in room.players if p.team != team and not p.finished]


def _evaluate_lead(move: List[Card], hand: List[Card], turn_history: Dict[int, Dict[str, int]]) -> float:
    lead_strength_weight = 1.6
    hand_cost_weight = 0.45
    high_impact_bonus = 2.4
    record_bonus = 0.0

    t, _ = _analyze(move)
    if t in {"triple", "quad"}:
        record_bonus += 0.8
    if any(v.get("passes", 0) >= 2 for v in turn_history.values()):
        record_bonus += 0.5

    score = 0.0
    score += _card_strength(move) * lead_strength_weight
    score -= _remaining_hand_cost(move, hand) * hand_cost_weight
    if _is_high_impact_card(move):
        score += high_impact_bonus
    # 主牌尽量后置，除非主牌很多可抢头游。
    trump_ratio = _trump_ratio(hand)
    if any(_is_trump_card(c) for c in move):
        score -= 3.0 if trump_ratio < 0.45 else 0.8
    if trump_ratio >= 0.6 and _move_is_trump(move):
        score += 2.0

    score += _control_followups(move, hand) * 1.35
    score += record_bonus
    return score


def _evaluate_response(
    move: List[Card],
    hand: List[Card],
    last: Optional[PlayedHand],
    opponent_cards_left: List[int],
    turn_history: Dict[int, Dict[str, int]],
) -> float:
    response_success_weight = 5.0
    hand_cost_weight = 0.45
    pressure_threshold = 2
    pressure_bonus = 2.2

    score = 0.0
    if last and _can_beat(move, last):
        score += response_success_weight
    score -= _remaining_hand_cost(move, hand) * hand_cost_weight

    # 跟牌时优先“小管大”，若我方后续能再压或队友能接力，则更倾向先出小牌。
    score -= _card_strength(move) * 0.2

    followups = _control_followups(move, hand)
    score += followups * 1.2
    if followups == 0:
        score -= 0.8

    if any(_is_trump_card(c) for c in move):
        score -= 2.0 if _trump_ratio(hand) < 0.45 else 0.6

    if opponent_cards_left and min(opponent_cards_left) <= pressure_threshold:
        score += pressure_bonus
        if len(move) > 1:
            score += 0.6

    if last and turn_history.get(last.player_id, {}).get("plays", 0) >= 3:
        score += 0.6
    return score


def _select_best_move(room: Room, player: Player) -> Optional[List[Card]]:
    support_threshold = 2
    team_support_bonus = 1.8
    legal_moves = _generate_legal_moves(player.hand, room.last_hand)

    if not legal_moves:
        return None

    teammate_cards_left = _teammate_cards_left(room, player.id)
    opponent_cards_left = _opponent_cards_left(room, player.id)

    if room.last_hand is not None:
        last_player = room.players[room.last_hand.player_id]
        teammate_led = last_player.team == player.team and last_player.id != player.id
        teammate_critical = len(last_player.hand) <= 2
        if teammate_led and _move_is_trump(room.last_hand.cards):
            # 队友出了主牌，通常不抢，优先让队友走完。
            if teammate_critical or (opponent_cards_left and min(opponent_cards_left) > 1):
                return None

    best_move = None
    best_score = float("-inf")
    for move in legal_moves:
        if room.last_hand is None:
            score = _evaluate_lead(move, player.hand, room.player_turn_history)
        else:
            score = _evaluate_response(
                move,
                player.hand,
                room.last_hand,
                opponent_cards_left,
                room.player_turn_history,
            )
            if _teammate_can_cover(room, player, move):
                score += 1.8

        if teammate_cards_left and teammate_cards_left <= support_threshold:
            score += team_support_bonus
            if len(move) > 1:
                score += 0.4
            # 队友快走完时少用主牌压队友，尽量控节奏给队友。
            if room.last_hand and room.last_hand.player_id != player.id:
                last_player = room.players[room.last_hand.player_id]
                if last_player.team == player.team and any(_is_trump_card(c) for c in move):
                    score -= 2.0

        if score > best_score:
            best_score = score
            best_move = move

    return best_move


def _run_bot_turns(room: Room):
    while room.game_status == "playing":
        nxt = room.players[room.turn_index]
        if not nxt.is_bot or nxt.finished:
            break
        time.sleep(1)
        mv = _select_best_move(room, nxt)
        if mv:
            apply_action(room, nxt.id, "play", [c.id for c in mv], run_bots=False)
        else:
            apply_action(room, nxt.id, "pass", [], run_bots=False)


def create_room(name: str) -> Room:
    rid = str(random.randint(1000, 9999))
    pwd = str(random.randint(1000, 9999))
    players = [Player(i, f"空位 {i+1}", _team_for_seat(i), is_bot=True, ready=False) for i in range(6)]
    players[0] = Player(0, name, _team_for_seat(0), is_bot=False, ready=False)
    turn_history = {i: {"plays": 0, "passes": 0} for i in range(6)}
    return Room(rid, pwd, 0, players, logs=[f"房主 {name} 创建了房间"], player_turn_history=turn_history)


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
    room.hand_history = []
    room.emotes = []
    room.player_turn_history = {i: {"plays": 0, "passes": 0} for i in range(6)}
    room.logs.append(f"游戏开始，{room.players[starter].name} 持有红桃4先手")
    room.updated_at = time.time()
    _run_bot_turns(room)


def serialize(room: Room, viewer_id: Optional[int] = None):
    data = asdict(room)
    for p in data["players"]:
        if viewer_id is None or p["id"] != viewer_id:
            p["hand"] = [{"id": c["id"]} for c in p["hand"]]
        else:
            p["hand"] = p["hand"]
    return data


def add_emote(room: Room, sender_id: int, target_id: int, content: str):
    if sender_id < 0 or sender_id >= len(room.players):
        return False, "发送者不存在"
    sender = room.players[sender_id]
    if sender.is_bot:
        return False, "电脑玩家不能发送消息"
    if target_id != -1 and (target_id < 0 or target_id >= len(room.players)):
        return False, "目标不存在"

    room.emotes.append({
        "sender_id": sender_id,
        "target_id": target_id,
        "content": content,
        "timestamp": int(time.time() * 1000)
    })
    room.emotes = room.emotes[-50:]
    room.updated_at = time.time()
    return True, "ok"


def join_room(room: Room, name: str):
    if room.game_status != "waiting":
        room.logs.append(f"{name} 以观战身份进入房间")
        return 0, True

    if name in room.spectator_names:
        room.logs.append(f"{name} 仅可观战")
        return 0, True

    for p in room.players:
        if p.is_bot:
            p.name = name
            p.is_bot = False
            p.ready = False
            room.logs.append(f"{name} 加入了房间")
            return p.id, False
    return None, False


def leave_room(room: Room, player_id: int):
    if player_id < 0 or player_id >= len(room.players):
        return False, "玩家不存在"

    leaver = room.players[player_id]
    if leaver.is_bot:
        return True, "ok"

    leaver_name = leaver.name
    if leaver_name not in room.spectator_names:
        room.spectator_names.append(leaver_name)

    if room.host_id == player_id and room.game_status == "playing":
        room.game_status = "round_over"
        room.logs.append(f"房主 {leaver_name} 退出，当前对局直接结束")
        room.updated_at = time.time()
        return True, "ok"

    leaver.is_bot = True
    leaver.ready = True
    room.logs.append(f"{leaver_name} 退出房间，已切换为电脑托管")

    if room.host_id == player_id:
        for p in room.players:
            if not p.is_bot:
                room.host_id = p.id
                room.logs.append(f"新房主为 {p.name}")
                break

    if room.game_status == "playing" and room.turn_index == player_id and not leaver.finished:
        mv = _select_best_move(room, leaver)
        if mv:
            apply_action(room, leaver.id, "play", [c.id for c in mv])
        else:
            apply_action(room, leaver.id, "pass", [])

    room.updated_at = time.time()
    return True, "ok"



def swap_seat(room: Room, player_id: int, target_seat_id: int):
    if room.game_status != "waiting":
        return False, "仅可在等待阶段换座"
    if player_id < 0 or player_id >= len(room.players):
        return False, "玩家不存在"
    if target_seat_id < 0 or target_seat_id >= len(room.players):
        return False, "目标座位不存在"

    player = room.players[player_id]
    target = room.players[target_seat_id]

    if player.is_bot:
        return False, "电脑座位不能换座"
    if not target.is_bot:
        return False, "该座位已有玩家"

    room.players[player_id], room.players[target_seat_id] = room.players[target_seat_id], room.players[player_id]
    room.players[player_id].id = player_id
    room.players[target_seat_id].id = target_seat_id
    room.players[player_id].team = _team_for_seat(player_id)
    room.players[target_seat_id].team = _team_for_seat(target_seat_id)

    if room.host_id == player_id:
        room.host_id = target_seat_id

    room.logs.append(f"{player.name} 从 {player_id + 1} 号位换到 {target_seat_id + 1} 号位")
    room.updated_at = time.time()
    return True, "ok"

def apply_action(room: Room, player_id: int, action: str, card_ids: Optional[List[str]] = None, run_bots: bool = True):
    if room.game_status != "playing":
        return False, "游戏未开始"
    cur = room.players[room.turn_index]
    if cur.id != player_id:
        return False, "还没轮到你"
    if action == "pass":
        if room.last_hand is None:
            return False, "新一轮必须出牌"
        room.pass_count += 1
        room.player_turn_history.setdefault(cur.id, {"plays": 0, "passes": 0})["passes"] += 1
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
        room.hand_history.append(room.last_hand)
        room.hand_history = room.hand_history[-30:]
        room.player_turn_history.setdefault(cur.id, {"plays": 0, "passes": 0})["plays"] += 1
        room.pass_count = 0
        room.logs.append(f"{cur.name} 出了 {len(selected)} 张牌")
        if not cur.hand and cur.id not in room.winners:
            cur.finished = True
            room.winners.append(cur.id)

    team_a_finished = sum(1 for p in room.players if p.finished and p.id in TEAM_A)
    team_b_finished = sum(1 for p in room.players if p.finished and p.id not in TEAM_A)
    if team_a_finished >= 3 or team_b_finished >= 3:
        room.game_status = "round_over"
        head_team = room.players[room.winners[0]].team if room.winners else None
        if team_a_finished >= 3 and team_b_finished >= 3:
            winner = "Draw"
        else:
            winner = 'A' if team_a_finished >= 3 else 'B'
            # 头游队不判负：若对方先全员出完但我方有头游，则判平。
            if head_team and winner != head_team:
                winner = "Draw"
        if winner == "Draw":
            room.logs.append("本局结束，平局（头游队未负）")
        else:
            room.logs.append(f"本局结束，{winner}队全员出完")
        return True, "ok"

    alive = [p for p in room.players if not p.finished]

    for _ in range(6):
        room.turn_index = (room.turn_index + 1) % 6
        if not room.players[room.turn_index].finished:
            break
    pass_threshold = len(alive) - 1
    if room.last_hand:
        last_player = room.players[room.last_hand.player_id]
        if last_player.finished:
            pass_threshold = len(alive)

    if room.pass_count >= pass_threshold:
        last_winning_player_id = room.last_hand.player_id if room.last_hand else None
        room.last_hand = None
        room.pass_count = 0
        if last_winning_player_id is not None and not room.players[last_winning_player_id].finished:
            room.turn_index = last_winning_player_id
        room.logs.append("一轮过牌，重置牌权")
        for pid in room.player_turn_history:
            room.player_turn_history[pid]["passes"] = 0

    room.updated_at = time.time()
    if run_bots:
        _run_bot_turns(room)
    return True, "ok"
