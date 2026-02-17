import argparse
import secrets
from functools import wraps
from typing import Any

from flask import Flask, jsonify, render_template, request, session
from game_engine import Room, add_emote, apply_action, create_room, join_room, leave_room, serialize, start_game, swap_seat

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
rooms: dict[str, Room] = {}
allowed_creators: set[str] = set()
admin_username = "admin"
admin_password = "admin"


def _is_admin_logged_in() -> bool:
    return bool(session.get("is_admin"))


def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not _is_admin_logged_in():
            return jsonify({"error": "未登录或登录已过期"}), 401
        return func(*args, **kwargs)

    return wrapper


def _admin_room_summary(room: Room) -> dict[str, Any]:
    players = []
    for p in room.players:
        players.append({
            "id": p.id,
            "name": p.name,
            "team": p.team,
            "is_bot": p.is_bot,
            "ready": p.ready,
            "finished": p.finished,
            "hand_count": len(p.hand),
        })

    last_hand = None
    if room.last_hand:
        last_hand = {
            "player_id": room.last_hand.player_id,
            "player_name": room.players[room.last_hand.player_id].name,
            "hand_type": room.last_hand.hand_type,
            "card_count": len(room.last_hand.cards),
            "main_rank": room.last_hand.main_rank,
        }

    team_a_finished = sum(1 for p in room.players if p.finished and p.team == "A")
    team_b_finished = sum(1 for p in room.players if p.finished and p.team == "B")

    return {
        "room_id": room.room_id,
        "password": room.password,
        "game_status": room.game_status,
        "host_id": room.host_id,
        "host_name": room.players[room.host_id].name,
        "turn_index": room.turn_index,
        "turn_player": room.players[room.turn_index].name,
        "pass_count": room.pass_count,
        "winners": room.winners,
        "team_score": {"A": team_a_finished, "B": team_b_finished},
        "last_hand": last_hand,
        "players": players,
        "updated_at": room.updated_at,
        "latest_logs": room.logs[-8:],
    }


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Vary'] = 'Origin'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, DELETE'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response


@app.route('/api/<path:_unused>', methods=['OPTIONS'])
def api_options(_unused):
    return ('', 204)


@app.get("/")
def index():
    return render_template("index.html")


@app.get('/admin')
def admin_index():
    return render_template('admin.html')


@app.post('/api/admin/login')
def api_admin_login():
    body = request.json or {}
    username = str(body.get('username', '')).strip()
    password = str(body.get('password', '')).strip()

    if username != admin_username or password != admin_password:
        return jsonify({"error": "用户名或密码错误"}), 403

    session['is_admin'] = True
    return jsonify({"ok": True})


@app.post('/api/admin/logout')
@admin_required
def api_admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get('/api/admin/session')
def api_admin_session():
    return jsonify({"logged_in": _is_admin_logged_in()})


@app.get('/api/admin/creators')
@admin_required
def api_admin_get_creators():
    return jsonify({"allowed_creators": sorted(allowed_creators)})


@app.post('/api/admin/creators')
@admin_required
def api_admin_add_creator():
    name = str((request.json or {}).get('name', '')).strip()
    if not name:
        return jsonify({"error": "昵称不能为空"}), 400
    allowed_creators.add(name)
    return jsonify({"ok": True, "allowed_creators": sorted(allowed_creators)})


@app.delete('/api/admin/creators')
@admin_required
def api_admin_remove_creator():
    name = str((request.json or {}).get('name', '')).strip()
    if not name:
        return jsonify({"error": "昵称不能为空"}), 400
    allowed_creators.discard(name)
    return jsonify({"ok": True, "allowed_creators": sorted(allowed_creators)})


@app.get('/api/admin/rooms')
@admin_required
def api_admin_rooms():
    summaries = [_admin_room_summary(room) for room in rooms.values()]
    summaries.sort(key=lambda item: item['updated_at'], reverse=True)
    return jsonify({"rooms": summaries})


@app.get('/api/admin/rooms/<room_id>')
@admin_required
def api_admin_room_detail(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404

    full_state = serialize(room, viewer_id=room.host_id)
    return jsonify({
        "summary": _admin_room_summary(room),
        "room_state": full_state,
    })


@app.post('/api/admin/rooms/<room_id>/close')
@admin_required
def api_admin_close_room(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    del rooms[room_id]
    return jsonify({"ok": True})


@app.post('/api/rooms')
def api_create_room():
    name = (request.json or {}).get('name', '').strip() or '玩家'
    if name not in allowed_creators:
        return jsonify({"error": "该昵称未获得创建房间权限，请联系管理员授权"}), 403

    room = create_room(name)
    rooms[room.room_id] = room
    return jsonify({"room_id": room.room_id, "password": room.password, "player_id": 0})


@app.post('/api/rooms/<room_id>/join')
def api_join_room(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    body = request.json or {}
    if room.password and body.get('password') != room.password:
        return jsonify({"error": "密码错误"}), 403
    pid, spectator = join_room(room, body.get('name', '玩家'))
    if pid is None:
        return jsonify({"error": "房间已满"}), 409
    return jsonify({"player_id": pid, "is_spectator": spectator})


@app.post('/api/rooms/<room_id>/leave')
def api_leave(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    pid = int((request.json or {}).get('player_id', -1))
    ok, msg = leave_room(room, pid)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@app.post('/api/rooms/<room_id>/ready')
def api_ready(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    pid = int((request.json or {}).get('player_id', -1))
    room.players[pid].ready = bool((request.json or {}).get('ready', True))
    return jsonify({"ok": True})


@app.post('/api/rooms/<room_id>/start')
def api_start(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    if not all(p.ready for p in room.players if not p.is_bot):
        return jsonify({"error": "还有玩家未准备"}), 400
    start_game(room)
    return jsonify({"ok": True})


@app.get('/api/rooms/<room_id>/state')
def api_state(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    viewer = request.args.get('player_id', default=None, type=int)
    return jsonify(serialize(room, viewer))


@app.post('/api/rooms/<room_id>/swap-seat')
def api_swap_seat(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    body = request.json or {}
    ok, msg = swap_seat(room, int(body.get('player_id', -1)), int(body.get('target_seat_id', -1)))
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@app.post('/api/rooms/<room_id>/dissolve')
def api_dissolve_room(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    pid = int((request.json or {}).get('player_id', -1))
    if pid != room.host_id:
        return jsonify({"error": "仅房主可解散房间"}), 403
    del rooms[room_id]
    return jsonify({"ok": True})


@app.post('/api/rooms/<room_id>/emote')
def api_emote(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    body = request.json or {}
    ok, msg = add_emote(room, int(body.get('sender_id', -1)), int(body.get('target_id', -1)), body.get('content', ''))
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@app.post('/api/rooms/<room_id>/action')
def api_action(room_id):
    room = rooms.get(room_id)
    if not room:
        return jsonify({"error": "房间不存在"}), 404
    body = request.json or {}
    ok, msg = apply_action(room, int(body.get('player_id', -1)), body.get('action', ''), body.get('card_ids', []))
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Six Poker Flask server')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=5008)
    parser.add_argument('--admin-username', required=True)
    parser.add_argument('--admin-password', required=True)
    parser.add_argument('--allowed-creators', default='', help='允许创建房间昵称，逗号分隔')
    args = parser.parse_args()

    admin_username = args.admin_username
    admin_password = args.admin_password
    allowed_creators = {name.strip() for name in args.allowed_creators.split(',') if name.strip()}

    app.run(host=args.host, port=args.port, debug=False)
