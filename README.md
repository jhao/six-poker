# 砸六家（Six Poker）- Flask 一体化部署版

这是一个基于 **Python Flask + 原生浏览器 JS** 的轻量级联机卡牌项目。前后端位于同一工程中，不需要前端独立打包，启动后可直接通过浏览器访问。

## 项目定位

- 保留并实现核心业务：六人对抗、A/B 两队、房间制联机、准备、发牌、轮转出牌、过牌重置、回合结束判定。
- 强化联机模块：由 Python 后端维护房间与对局状态，客户端通过 HTTP 轮询同步。
- 一体化部署：单进程 Flask 服务负责 API + 页面渲染 + 静态资源。

## 功能逻辑说明

### 1. 大厅与房间

- 玩家输入昵称后可创建房间（返回房间号与密码）或加入房间。
- 房间固定 6 个座位，空位由 bot 占位。
- 人类玩家可点击“准备/取消”，主持人（或任意客户端）可点击“开始”（需要所有真人玩家准备）。

### 2. 对局流程

- 开始后为每位玩家发 9 张牌。
- 按顺位轮流行动：`出牌` 或 `过牌`。
- 牌型支持：单张、对子、三张、四张（含混牌规则：2、3、大小王可作混）。
- 跟牌必须同牌型且主值更大。
- 若连续过牌达到阈值，重置牌权（上手清空）。

### 3. 联机与托管（Bot）

- 服务端管理全局房间状态，保证多客户端一致。
- 机器人自动在其回合执行简单策略（可压则压，否则过牌）。

### 4. 回合结束

- 玩家手牌出完即记录名次。
- 仅剩 1 名未出完时本轮结束。
- 日志区显示关键事件（加入、出牌、过牌、结束等）。

## 技术方案

- **后端**：Flask 3，内存态房间管理。
- **前端**：HTML + Tailwind CDN + 原生 JS。
- **通信**：REST API + 1s 轮询。
- **部署**：Docker 单容器部署。

## 本地运行

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

访问：`http://localhost:5000`

## Docker 构建与部署

### 构建镜像

```bash
docker build -t six-poker:flask .
```

### 运行容器

```bash
docker run -d --name six-poker -p 5000:5000 six-poker:flask
```

### 查看日志

```bash
docker logs -f six-poker
```

### 停止与删除

```bash
docker stop six-poker && docker rm six-poker
```

## 项目结构

```text
.
├── app.py                # Flask 入口与 API
├── game_engine.py        # 核心规则与房间/对局状态机
├── templates/index.html  # 前端页面
├── static/app.js         # 前端逻辑
├── Dockerfile
├── requirements.txt
└── LICENSE
```

## License

本项目使用 **MIT License**。详见 [LICENSE](./LICENSE)。
