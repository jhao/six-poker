from flask import Flask, jsonify, render_template, request
from game_engine import Room, apply_action, create_room, join_room, leave_room, serialize, start_game, swap_seat

app = Flask(__name__)
rooms: dict[str, Room] = {}


@app.get("/")
def index():
    return render_template("index.html")


@app.post('/api/rooms')
def api_create_room():
    name = (request.json or {}).get('name', '').strip() or '玩家'
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
    app.run(host='0.0.0.0', port=5008, debug=False)
