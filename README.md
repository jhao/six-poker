# 砸六家（Six Poker）

这是一个基于 **Flask + 原生浏览器 JavaScript** 的多人联机卡牌项目。当前线上可运行版本为 **Flask 一体化部署模式**：后端提供 API，同时渲染页面与静态资源。

> 仓库中保留了 `Vite + React + TypeScript` 的前端代码（用于前端独立开发/演进），但默认部署入口仍是 Flask（`app.py` + `templates/` + `static/`）。

---

## 1. 最新启动方式（推荐）

### 1.1 一体化本地启动（生产/联调同构）

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py --admin-username admin --admin-password 123456 --allowed-creators 张三,李四
```

启动后访问：

- `http://localhost:5000`

说明：

- 页面由 Flask 返回 `templates/index.html`。
- 浏览器脚本来自 `static/app.js`。
- 前端通过 `/api/*` 与后端通信，轮询间隔为 1 秒。



### 1.3 后台管理入口

启动服务后可访问：

- `http://localhost:5008/admin`

管理员账号密码由启动参数 `--admin-username` 与 `--admin-password` 指定。

后台能力：

- 管理“允许创建房间”的昵称白名单
- 查看全部房间（房间号、密码、玩家状态、出牌与比分状态）
- 强制结束并关闭任意房间

### 1.2 前端独立开发启动（可选）

如果你要调试仓库中的 React/TS 前端（非默认线上入口），可使用：

```bash
npm install
npm run dev
```

默认地址：

- `http://localhost:3000`

说明：

- `vite.config.ts` 已配置 `/api` 代理到 `http://127.0.0.1:5000`，因此你仍需同时启动 Flask 后端。
- 该模式用于前端开发效率提升，不影响默认部署形态。

---

## 2. 最新部署方式

### 2.1 Docker 单容器部署（推荐）

#### 构建镜像

```bash
docker build -t six-poker:latest .
```

#### 运行容器

```bash
docker run -d --name six-poker -p 5000:5000 --restart unless-stopped six-poker:latest
```

#### 运行检查

```bash
curl http://127.0.0.1:5000/
```

#### 查看日志

```bash
docker logs -f six-poker
```

#### 停止与删除

```bash
docker stop six-poker && docker rm six-poker
```

### 2.2 直接进程部署（无容器）

```bash
pip install -r requirements.txt
python app.py --admin-username admin --admin-password 123456 --allowed-creators 张三,李四
```

如果你在服务器上运行，建议使用 systemd/supervisor 做进程守护，并通过 Nginx 反向代理到 `5000` 端口。

---

## 3. 前端代码结构说明

当前仓库包含两套前端代码：

### 3.1 运行中（Flask 一体化）前端

```text
templates/
  └── index.html         # 页面结构（大厅/房间/对局）
static/
  └── app.js             # 前端状态、渲染、事件、API 调用与轮询
```

职责划分：

- `templates/index.html`
  - 定义 UI 容器与按钮：创建房间、加入房间、准备、开始、出牌、过牌。
  - 通过 `<script src="/static/app.js"></script>` 注入逻辑。
- `static/app.js`
  - `api(path, method, body)`: 统一封装 `fetch` 请求。
  - `tick()`: 每 1 秒请求 `/api/rooms/<room_id>/state`。
  - `render()`: 根据后端状态刷新玩家区、手牌区、日志区。
  - 点击事件：创建/加入/准备/开始/出牌/过牌。

### 3.2 预留（Vite + React + TS）前端

```text
index.tsx                # React 入口
App.tsx                  # 主应用状态与流程
components/
  ├── GameBoard.tsx      # 对局面板组件
  └── CardComponent.tsx  # 手牌组件
utils/
  └── cardLogic.ts       # 牌型分析、比较、自动出牌策略
types.ts                 # 类型定义
constants.ts             # 常量定义
vite.config.ts           # 开发服务器与代理配置
```

说明：这部分更适合中长期迭代（组件化 + 类型化），但默认部署不依赖它。

---

## 4. 后端代码结构说明

```text
app.py                   # Flask 入口、路由与 API 编排
game_engine.py           # 领域模型（Room/Player/Card）与核心规则
requirements.txt         # Python 依赖
Dockerfile               # 容器化部署配置
```

### 4.1 `app.py`（Web 层）

主要职责：

- 初始化 Flask 应用和全局房间字典 `rooms`。
- 提供首页路由 `GET /`。
- 提供房间与对局 API：创建、加入、准备、开始、拉取状态、执行动作。

### 4.2 `game_engine.py`（规则层）

主要职责：

- 数据模型：`Card`、`Player`、`PlayedHand`、`Room`。
- 发牌与排序：`_create_deck`、`_sort_hand`。
- 牌型判定与比较：`_analyze`、`_can_beat`。
- Bot 行为：`_auto_move`。
- 核心流程函数：`create_room`、`join_room`、`start_game`、`apply_action`、`serialize`。

---

## 5. 接口与调用说明

## 5.1 API 一览

| 方法 | 路径 | 用途 | 关键请求参数 | 关键响应字段 |
|---|---|---|---|---|
| GET | `/` | 返回游戏页面 | - | HTML 页面 |
| POST | `/api/rooms` | 创建房间 | `name` | `room_id`, `password`, `player_id` |
| POST | `/api/rooms/{room_id}/join` | 加入房间 | `name`, `password` | `player_id` |
| POST | `/api/rooms/{room_id}/ready` | 准备/取消准备 | `player_id`, `ready` | `ok` |
| POST | `/api/rooms/{room_id}/start` | 开始游戏 | - | `ok` |
| GET | `/api/rooms/{room_id}/state` | 获取房间/对局状态 | `player_id`(query) | `room_id`, `players`, `turn_index`, `last_hand`, `logs` 等 |
| POST | `/api/rooms/{room_id}/action` | 出牌或过牌 | `player_id`, `action`, `card_ids` | `ok` |

### 5.2 前端调用时序（默认一体化前端）

1. 创建/加入房间：
   - 点击按钮 -> 调用 `api()` -> 保存 `roomId/playerId` -> 切换 UI 到房间页。
2. 房间轮询：
   - `setInterval(tick, 1000)` 拉取状态。
   - `render()` 基于最新状态重绘座位、手牌和日志。
3. 玩家动作：
   - 出牌：提交 `action=play + card_ids`。
   - 过牌：提交 `action=pass`。
4. 后端处理：
   - `app.py` 接口转调 `game_engine.apply_action()`。
   - 规则层校验牌型、更新回合、触发 Bot、写入日志。
5. 前端下一次轮询拿到最新状态并展示。

### 5.3 状态可见性与错误处理

- `serialize(room, viewer_id)` 会对非当前玩家的手牌做脱敏（仅保留牌 ID）。
- API 错误通过 `{ "error": "..." }` 返回，前端 `api()` 统一抛错处理。

---

## 6. 项目结构（总览）

```text
.
├── app.py
├── game_engine.py
├── templates/
│   └── index.html
├── static/
│   └── app.js
├── App.tsx
├── index.tsx
├── components/
│   ├── CardComponent.tsx
│   └── GameBoard.tsx
├── utils/
│   └── cardLogic.ts
├── types.ts
├── constants.ts
├── vite.config.ts
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## License

本项目使用 **MIT License**。详见 [LICENSE](./LICENSE)。
