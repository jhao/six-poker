import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, GameState, Player, HandType, Suit, Rank, PlayedHand, ViewState, RoomInfo, ScoreRecord, EmoteMessage, UserStats } from './types';
import { createDeck, shuffleDeck, sortHand, analyzeHand, canBeat, findAutoMove } from './utils/cardLogic';
import { CardComponent } from './components/CardComponent';
import { GameBoard } from './components/GameBoard';
import { CARDS_PER_PLAYER, TOTAL_PLAYERS, TEAM_A_INDICES, LOBBY_MESSAGES, TURN_DURATION } from './constants';

const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<ViewState>('home');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [inputRoomId, setInputRoomId] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [isSpectator, setIsSpectator] = useState(false);
  
  // User Profile State
  const [userName, setUserName] = useState<string>('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({ 
      singlePlayer: { played: 0, wins: 0 }, 
      multiPlayer: { played: 0, wins: 0 } 
  });
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | 'single' | null>(null);

  // Game Logic State
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentTurnIndex: -1,
    handHistory: [],
    deck: [],
    gameStatus: 'waiting',
    passCount: 0,
    winners: [],
    logs: [],
    activeEmotes: [],
    scores: [],
    currentRound: 1,
    turnTimeLeft: TURN_DURATION
  });

  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<number>(0); 
  const botIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Initialization & Persistence ---
  
  useEffect(() => {
      // Load User Data
      const savedName = localStorage.getItem('za6_username');
      const savedStats = localStorage.getItem('za6_stats');
      if (savedName) setUserName(savedName);
      if (savedStats) setUserStats(JSON.parse(savedStats));

      // Check URL for invite
      const params = new URLSearchParams(window.location.search);
      const inviteRoom = params.get('room');
      if (inviteRoom) {
          setInputRoomId(inviteRoom);
          setPendingAction('join');
          if (!savedName) {
              setShowNameModal(true);
          } else {
              setView('lobby');
          }
      }
  }, []);

  // Save game state (Single Player)
  useEffect(() => {
    if (view === 'game' && room?.roomId === 'LOCAL' && !isSpectator) {
      localStorage.setItem('za6_save', JSON.stringify({
        gameState,
        myPlayerId,
        room
      }));
    }
  }, [gameState, view, room, myPlayerId, isSpectator]);

  const saveStats = (isWin: boolean, isSingle: boolean) => {
      setUserStats(prev => {
          const newStats = { ...prev };
          if (isSingle) {
              newStats.singlePlayer.played++;
              if (isWin) newStats.singlePlayer.wins++;
          } else {
              newStats.multiPlayer.played++;
              if (isWin) newStats.multiPlayer.wins++;
          }
          localStorage.setItem('za6_stats', JSON.stringify(newStats));
          return newStats;
      });
  };

  const handleNameSubmit = (name: string) => {
      if (!name.trim()) return;
      setUserName(name);
      localStorage.setItem('za6_username', name);
      setShowNameModal(false);
      
      // Execute pending action
      if (pendingAction === 'single') startSinglePlayer();
      else if (pendingAction === 'create') setView('lobby'); // Go to lobby then click create
      else if (pendingAction === 'join') setView('lobby');
      
      setPendingAction(null);
  };

  // --- Network Simulation Helpers ---

  const handleCreateRoom = () => {
    if (!userName) {
        setPendingAction('create');
        setShowNameModal(true);
        return;
    }

    const newRoom: RoomInfo = {
      roomId: Math.floor(1000 + Math.random() * 9000).toString(),
      password: Math.floor(1000 + Math.random() * 9000).toString(),
      hostId: 0,
      isStarted: false,
      players: Array(6).fill(null).map((_, i) => ({
        id: i,
        name: i === 0 ? userName : `空位 ${i+1}`,
        team: TEAM_A_INDICES.includes(i) ? 'A' : 'B',
        hand: [],
        isHuman: false, 
        isFinished: false,
        finishOrder: null,
        isReady: false, // Host not ready by default
        isConnected: true,
        isAutoPlayed: false,
        seatIndex: i
      }))
    };
    setRoom(newRoom);
    setMyPlayerId(0);
    setIsSpectator(false);
    setView('room_waiting');
  };

  const handleJoinRoom = () => {
    if (!userName) {
        setPendingAction('join');
        setShowNameModal(true);
        return;
    }
    if (inputRoomId.length !== 4) {
      alert("请输入4位房间号 (模拟)");
      return;
    }

    // Check if user has left this room before (Spectator Logic)
    const spectateList = JSON.parse(localStorage.getItem('za6_spectate_list') || '[]');
    const previouslyLeft = spectateList.includes(inputRoomId);

    // Simulate finding a room
    // Mock logic: If input ID is "9999", simulate an "Already Started" room
    const isMockStarted = inputRoomId === '9999'; 

    const mockRoom: RoomInfo = {
      roomId: inputRoomId,
      hostId: 0,
      isStarted: isMockStarted,
      players: Array(6).fill(null).map((_, i) => ({
        id: i,
        name: `玩家 ${i+1}`,
        team: TEAM_A_INDICES.includes(i) ? 'A' : 'B',
        hand: [],
        isHuman: false,
        isFinished: false,
        finishOrder: null,
        isReady: true,
        isConnected: true,
        isAutoPlayed: false,
        seatIndex: i
      }))
    };
    
    if (previouslyLeft || isMockStarted) {
        setIsSpectator(true);
        alert(previouslyLeft ? "你之前退出了该房间，现在进入观战模式。" : "游戏已开始，进入观战模式。");
        setMyPlayerId(0); // Watch from perspective of P0
        mockRoom.isStarted = true;
    } else {
        setIsSpectator(false);
        // Find an empty seat
        const mySeat = 1; 
        mockRoom.players[mySeat] = {
            ...mockRoom.players[mySeat],
            name: userName, // Use real name
            isHuman: true,
            isReady: false
        };
        setMyPlayerId(mySeat);
    }

    setRoom(mockRoom);
    setView('room_waiting');
  };

  const copyInviteLink = () => {
      if (!room) return;
      const url = `${window.location.origin}?room=${room.roomId}`;
      navigator.clipboard.writeText(url).then(() => {
          alert(`邀请链接已复制：\n${url}\n\n对方进入需要输入密码：${room.password}`);
      });
  };

  const copyRoomInfo = () => {
      if (!room || room.roomId === 'LOCAL') return;
      const url = `${window.location.origin}?room=${room.roomId}`;
      const info = `房间号: ${room.roomId}\n密码: ${room.password || '无'}\n加入链接: ${url}`;
      navigator.clipboard.writeText(info).then(() => {
          alert("房间信息已复制！");
      });
  };

  const toggleReady = () => {
    if (!room || isSpectator) return;
    const updatedPlayers = room.players.map(p => 
      p.id === myPlayerId ? { ...p, isReady: !p.isReady } : p
    );
    setRoom({ ...room, players: updatedPlayers });
  };

  const sendLobbyMessage = (msg: string) => {
      // Simulate receiving a message in lobby
      const emote: EmoteMessage = {
          senderId: myPlayerId,
          targetId: -1, // Broadcast
          content: msg,
          timestamp: Date.now()
      };
      setGameState(prev => ({
          ...prev,
          activeEmotes: [...prev.activeEmotes, emote]
      }));
      
      // Auto clear
      setTimeout(() => {
          setGameState(prev => ({
              ...prev,
              activeEmotes: prev.activeEmotes.filter(e => e.timestamp !== emote.timestamp)
          }));
      }, 3000);
  };

  const startGame = useCallback(() => {
    if (!room) return;
    
    // Check if everyone is ready
    const allReady = room.players.every(p => !p.isHuman || p.isReady); // Simple check: Humans must be ready
    if (!allReady) {
        alert("还有玩家未准备，无法开始！");
        return;
    }

    setRoom(prev => prev ? { ...prev, isStarted: true } : null);

    let deck = shuffleDeck(createDeck());
    const players: Player[] = room.players.map(p => ({
        ...p,
        hand: [], 
        isFinished: false,
        finishOrder: null,
        isHuman: p.id === myPlayerId && p.isConnected && !isSpectator, 
        isAutoPlayed: false
    }));

    let starterIndex = -1;
    for (let i = 0; i < TOTAL_PLAYERS; i++) {
      const hand = sortHand(deck.slice(i * CARDS_PER_PLAYER, (i + 1) * CARDS_PER_PLAYER));
      players[i].hand = hand;
      if (hand.some(c => c.suit === Suit.Hearts && c.rank === Rank.Four)) {
        starterIndex = i;
      }
    }
    if (starterIndex === -1) starterIndex = 0;

    setGameState({
      players,
      currentTurnIndex: starterIndex,
      handHistory: [],
      deck,
      gameStatus: 'playing',
      passCount: 0,
      winners: [],
      logs: [`游戏开始！${players[starterIndex].name} 拥有红桃4，先出牌。`],
      activeEmotes: [],
      scores: [],
      currentRound: 1,
      turnTimeLeft: TURN_DURATION
    });
    setSelectedCards([]);
    setView('game');
  }, [room, myPlayerId, isSpectator]);


  // --- Game Logic ---

  // Helper: Find next player who is NOT finished
  const getNextActivePlayer = useCallback((startIndex: number, currentPlayers: Player[]) => {
      let nextIndex = startIndex % TOTAL_PLAYERS;
      let count = 0;
      while (currentPlayers[nextIndex].isFinished && count < TOTAL_PLAYERS) {
          nextIndex = (nextIndex + 1) % TOTAL_PLAYERS;
          count++;
      }
      return nextIndex;
  }, []);

  const handleTurn = useCallback(async () => {
    const { players, currentTurnIndex, handHistory, passCount, gameStatus, turnTimeLeft } = gameState;
    
    if (gameStatus !== 'playing') return;

    const currentPlayer = players[currentTurnIndex];

    // If current player is finished (should usually be skipped, but double check)
    if (currentPlayer.isFinished) {
      passTurn(currentTurnIndex); // Treat as auto-pass just in case
      return;
    }

    const isAuto = currentPlayer.id === myPlayerId && currentPlayer.isAutoPlayed;
    const isTimeout = turnTimeLeft <= 0;

    // Human Turn (if not timed out and not auto-played)
    if (currentPlayer.isHuman && currentPlayer.isConnected && !isAuto && !isTimeout) {
      return; 
    }

    // Bot / Disconnect / Spectated / Timeout / AutoPlayed Turn
    if (!isTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Check if it's a "free turn" (passCount reached limit or no history)
    // passCount limit calculation: 
    // If the person who played the last hand is still playing, we need (ActivePlayers - 1) passes.
    // If the person who played the last hand is FINISHED, we need (ActivePlayers) passes.
    const activePlayersCount = players.filter(p => !p.isFinished).length;
    let threshold = activePlayersCount - 1;
    
    if (handHistory.length > 0) {
        const lastHandPlayerId = handHistory[handHistory.length - 1].playerId;
        if (players[lastHandPlayerId].isFinished) {
            threshold = activePlayersCount;
        }
    }

    const isFreeTurn = handHistory.length === 0 || passCount >= threshold;
    const lastValidHand = isFreeTurn ? null : handHistory[handHistory.length - 1];

    const move = findAutoMove(currentPlayer.hand, lastValidHand);

    if (move) {
      playCards(currentPlayer.id, move);
    } else {
      passTurn(currentPlayer.id);
    }
  }, [gameState, getNextActivePlayer]); // Added getNextActivePlayer dependency

  const playCards = (playerId: number, cards: Card[]) => {
    const handAnalysis = analyzeHand(cards);
    setGameState(prev => {
      const player = prev.players[playerId];
      const newHand = player.hand.filter(c => !cards.find(pc => pc.id === c.id));
      const isFinished = newHand.length === 0;
      let newWinners = [...prev.winners];
      let newFinishOrder = player.finishOrder;
      
      if (isFinished) {
        newWinners.push(player.name);
        newFinishOrder = newWinners.length;
      }

      const playedHand: PlayedHand = {
        cards,
        type: handAnalysis.type,
        mainRankValue: handAnalysis.mainRankValue,
        playerId,
        playerName: player.name,
        playerTeam: player.team
      };

      const newHistory = [...prev.handHistory, playedHand];
      
      // Update players array
      const newPlayers = prev.players.map(p => p.id === playerId ? { ...p, hand: newHand, isFinished, finishOrder: newFinishOrder } : p);

      // Determine next turn
      // After playing, it's the next active player's turn
      const nextIndex = getNextActivePlayer(playerId + 1, newPlayers);

      return {
        ...prev,
        players: newPlayers,
        handHistory: newHistory,
        currentTurnIndex: nextIndex,
        passCount: 0, // Reset pass count on play
        logs: [`${player.name} 打出了 ${handAnalysis.type}`, ...prev.logs].slice(0, 50),
        winners: newWinners,
        turnTimeLeft: TURN_DURATION
      };
    });
  };

  const passTurn = (playerId: number) => {
    setGameState(prev => {
      const newPassCount = prev.passCount + 1;
      let logs = [`${prev.players[playerId].name} 不出`, ...prev.logs].slice(0, 50);
      let newHistory = prev.handHistory;
      
      // Calculate active players to determine if round is over
      const activePlayersCount = prev.players.filter(p => !p.isFinished).length;
      
      // Determine Threshold for "Round Over"
      // Default: ActivePlayers - 1 (Everyone else passed)
      let threshold = activePlayersCount - 1;
      let lastHandOwnerFinished = false;

      if (prev.handHistory.length > 0) {
          const lastHandPlayerId = prev.handHistory[prev.handHistory.length - 1].playerId;
          if (prev.players[lastHandPlayerId].isFinished) {
              // If the person who led the trick is gone, EVERYONE currently playing must pass
              threshold = activePlayersCount;
              lastHandOwnerFinished = true;
          }
      }

      let nextTurnIndex = -1;
      let resetPassCount = newPassCount;

      if (newPassCount >= threshold) { 
         // --- Round Over (Trick Won) ---
         newHistory = []; 
         resetPassCount = 0;
         
         // Who starts next? 
         // Normally: The winner of the trick (lastHandPlayerId).
         // Exception (Gei Feng): If winner is finished, pass lead to their downstream neighbor.
         if (prev.handHistory.length > 0) {
             const lastHandPlayerId = prev.handHistory[prev.handHistory.length - 1].playerId;
             const winner = prev.players[lastHandPlayerId];
             
             if (!winner.isFinished) {
                 nextTurnIndex = winner.id;
                 logs = [`${winner.name} 赢得了本轮`, ...logs];
             } else {
                 // Gei Feng: Winner is gone, next active player after winner starts
                 nextTurnIndex = getNextActivePlayer(winner.id + 1, prev.players);
                 logs = [`${winner.name} 已走，下家接风`, ...logs];
             }
         } else {
             // Should not happen if threshold logic works, but fallback
             nextTurnIndex = getNextActivePlayer(playerId + 1, prev.players);
         }
      } else {
         // --- Round Continues ---
         nextTurnIndex = getNextActivePlayer(playerId + 1, prev.players);
         resetPassCount = newPassCount;
      }

      return {
        ...prev,
        passCount: resetPassCount,
        handHistory: newHistory,
        logs,
        currentTurnIndex: nextTurnIndex,
        turnTimeLeft: TURN_DURATION
      };
    });
  };

  const sendEmote = (targetId: number, content: string) => {
      const emote: EmoteMessage = {
          senderId: myPlayerId,
          targetId,
          content,
          timestamp: Date.now()
      };
      setGameState(prev => ({
          ...prev,
          activeEmotes: [...prev.activeEmotes, emote]
      }));
      setTimeout(() => {
          setGameState(prev => ({
              ...prev,
              activeEmotes: prev.activeEmotes.filter(e => e.timestamp !== emote.timestamp)
          }));
      }, 3000);
  };

  const toggleSelectCard = (card: Card) => {
    setSelectedCards(prev => {
      if (prev.some(c => c.id === card.id)) {
        return prev.filter(c => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  };

  const handleUserPlay = () => {
    if (selectedCards.length === 0) return;
    const analysis = analyzeHand(selectedCards);
    if (analysis.type === HandType.Invalid) {
      alert("无效的牌型组合！");
      return;
    }
    
    // Check validity against history
    const activePlayersCount = gameState.players.filter(p => !p.isFinished).length;
    let threshold = activePlayersCount - 1;
    if (gameState.handHistory.length > 0) {
        const lastHandPlayerId = gameState.handHistory[gameState.handHistory.length - 1].playerId;
        if (gameState.players[lastHandPlayerId].isFinished) {
            threshold = activePlayersCount;
        }
    }
    
    const isFreeTurn = gameState.handHistory.length === 0 || gameState.passCount >= threshold;
    const effectiveLastHand = isFreeTurn ? null : gameState.handHistory[gameState.handHistory.length - 1];

    if (effectiveLastHand) {
      if (!canBeat(selectedCards, effectiveLastHand)) {
        alert("你的牌必须大于上家且牌型一致！");
        return;
      }
    }
    playCards(myPlayerId, selectedCards);
    setSelectedCards([]);
  };

  const handleUserPass = () => {
    const activePlayersCount = gameState.players.filter(p => !p.isFinished).length;
    let threshold = activePlayersCount - 1;
    if (gameState.handHistory.length > 0) {
        const lastHandPlayerId = gameState.handHistory[gameState.handHistory.length - 1].playerId;
        if (gameState.players[lastHandPlayerId].isFinished) {
            threshold = activePlayersCount;
        }
    }
    const isFreeTurn = gameState.handHistory.length === 0 || gameState.passCount >= threshold;

    if (isFreeTurn) {
      alert("新的一轮，你必须出牌，不能过！");
      return;
    }
    passTurn(myPlayerId);
    setSelectedCards([]);
  };

  const handleLeaveGame = (force: boolean = false) => {
      if (room?.roomId === 'LOCAL') {
          // Saving is handled by useEffect
          alert("游戏进度已保存，下次进入将继续。");
          setView('home');
      } else {
          // Host Restrictions
          if (room?.hostId === myPlayerId && gameState.gameStatus === 'playing' && !force) {
              const choice = window.confirm(
                  "您是房主，当前本轮游戏尚未结束。\n\n强行退出将导致房间关闭。\n\n是否强行退出？"
              );
              if (!choice) return;
          } else if (gameState.gameStatus === 'playing' && !force && !isSpectator) {
               // Regular player in multiplayer warning
               if (!window.confirm("游戏正在进行中，退出将由电脑接管。确定退出吗？")) return;
          }

          // Leave Logic
          const confirmLeave = force || window.confirm(isSpectator ? "退出观战？" : "确定退出房间吗？");
          if (confirmLeave) {
             if (room?.roomId) {
                 const list = JSON.parse(localStorage.getItem('za6_spectate_list') || '[]');
                 if (!list.includes(room.roomId) && !isSpectator) {
                     list.push(room.roomId);
                     localStorage.setItem('za6_spectate_list', JSON.stringify(list));
                 }
             }
             setView('home');
          }
      }
  };

  const cancelAutoPlay = () => {
      setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === myPlayerId ? { ...p, isAutoPlayed: false } : p)
      }));
  };

  // --- Effects ---

  // Timer Effect & Timeout AutoPlay Logic
  useEffect(() => {
    if (gameState.gameStatus === 'playing') {
      const timer = setInterval(() => {
        setGameState(prev => {
          // If time runs out
          if (prev.turnTimeLeft <= 0) {
              // If it's MY turn and I am not already auto-played, enable auto-play
              const currentPlayer = prev.players[prev.currentTurnIndex];
              if (currentPlayer.id === myPlayerId && !isSpectator && !currentPlayer.isAutoPlayed && currentPlayer.isHuman) {
                   return {
                       ...prev,
                       players: prev.players.map(p => p.id === myPlayerId ? { ...p, isAutoPlayed: true } : p),
                       turnTimeLeft: 0 // Keep at 0 to trigger move logic
                   };
              }
              return prev; 
          }
          return { ...prev, turnTimeLeft: prev.turnTimeLeft - 1 };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState.gameStatus, gameState.currentTurnIndex, myPlayerId, isSpectator]);

  // Turn Handling Effect
  useEffect(() => {
    if (gameState.gameStatus === 'playing') {
      // Logic triggers if it's not a human turn OR if time runs out
      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      const isAuto = currentPlayer.id === myPlayerId && currentPlayer.isAutoPlayed;
      const isHumanTurn = currentPlayer.id === myPlayerId && currentPlayer.isConnected && !isSpectator && !isAuto;
      
      // If human and time > 0, wait. If time <= 0, force auto move.
      if (isHumanTurn && gameState.turnTimeLeft > 0) return;

      if (botIntervalRef.current) clearTimeout(botIntervalRef.current);
      botIntervalRef.current = setTimeout(() => {
        handleTurn();
      }, 500);
    }
    return () => {
      if (botIntervalRef.current) clearTimeout(botIntervalRef.current);
    };
  }, [gameState.currentTurnIndex, gameState.gameStatus, gameState.turnTimeLeft, handleTurn, myPlayerId, isSpectator, gameState.players]);

  // Win Condition Effect
  useEffect(() => {
    // Check if one COMPLETE TEAM has finished
    const finishedPlayers = gameState.players.filter(p => p.isFinished);
    const teamAFinishedCount = finishedPlayers.filter(p => p.team === 'A').length;
    const teamBFinishedCount = finishedPlayers.filter(p => p.team === 'B').length;

    if (gameState.gameStatus === 'playing' && (teamAFinishedCount === 3 || teamBFinishedCount === 3)) {
        // Determine Winner (The team that finished all 3)
        // If both somehow finish same time (impossible sequentially), prioritize A.
        const winningTeam = teamAFinishedCount === 3 ? 'A' : 'B';
        
        // Find the "Head Winner" for the record (usually first person who went out from winning team)
        const winningTeamPlayers = finishedPlayers.filter(p => p.team === winningTeam).sort((a,b) => (a.finishOrder || 99) - (b.finishOrder || 99));
        const headWinnerName = winningTeamPlayers[0]?.name || "Unknown";

        const newScore: ScoreRecord = {
            round: gameState.currentRound,
            winnerTeam: winningTeam,
            teamAScore: winningTeam === 'A' ? 1 : 0,
            teamBScore: winningTeam === 'B' ? 1 : 0,
            details: `头游: ${headWinnerName} (全队完胜)`
        };

        // Update Stats
        const myPlayer = gameState.players.find(p => p.id === myPlayerId);
        if (myPlayer) {
            const myTeam = myPlayer.team;
            const isWin = winningTeam === myTeam;
            saveStats(isWin, room?.roomId === 'LOCAL');
        }

        setGameState(prev => ({
            ...prev, 
            gameStatus: 'roundOver',
            scores: [...prev.scores, newScore]
        }));
        setView('score_summary');
    }
  }, [gameState.players, gameState.gameStatus]);

  // --- Render Helpers ---

  const myPlayer = gameState.players[myPlayerId];
  const isAuto = myPlayer?.isAutoPlayed;
  
  // Calculate if it's user turn based on current index AND game state validity
  const activePlayersCount = gameState.players.filter(p => !p.isFinished).length;
  let threshold = activePlayersCount - 1;
  if (gameState.handHistory.length > 0) {
      const lastHandPlayerId = gameState.handHistory[gameState.handHistory.length - 1].playerId;
      if (gameState.players[lastHandPlayerId].isFinished) {
          threshold = activePlayersCount;
      }
  }
  const isFreeTurn = gameState.passCount >= threshold || gameState.handHistory.length === 0;

  const isUserTurn = gameState.currentTurnIndex === myPlayerId && gameState.gameStatus === 'playing' && !gameState.players[myPlayerId].isFinished && !isSpectator && !isAuto;


  const requestSinglePlayer = () => {
      if (!userName) {
          setPendingAction('single');
          setShowNameModal(true);
          return;
      }
      startSinglePlayer();
  };

  const startSinglePlayer = () => {
      // Check for save
      const saveStr = localStorage.getItem('za6_save');
      if (saveStr) {
          const confirmLoad = window.confirm("发现未完成的单机游戏，是否继续？(取消则开始新游戏)");
          if (confirmLoad) {
              const save = JSON.parse(saveStr);
              setRoom(save.room);
              setGameState(save.gameState);
              setMyPlayerId(save.myPlayerId);
              setIsSpectator(false);
              setView('game');
              return;
          } else {
              localStorage.removeItem('za6_save');
          }
      }

      const spRoom: RoomInfo = {
          roomId: 'LOCAL',
          hostId: 0,
          isStarted: true,
          players: Array(6).fill(null).map((_, i) => ({
            id: i,
            name: i === 0 ? userName : `电脑 ${i}`,
            team: TEAM_A_INDICES.includes(i) ? 'A' : 'B',
            hand: [],
            isHuman: i === 0, 
            isFinished: false,
            finishOrder: null,
            isReady: true,
            isConnected: true,
            isAutoPlayed: false,
            seatIndex: i
          }))
      };
      setRoom(spRoom);
      setMyPlayerId(0);
      setIsSpectator(false);
      setTimeout(() => setView('room_waiting'), 100);
  };

  const continueGame = () => {
      setGameState(prev => ({ ...prev, currentRound: prev.currentRound + 1 }));
      startGame();
  };

  const toggleDisconnect = (pid: number) => {
      if (pid === myPlayerId) return;
      setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === pid ? { ...p, isConnected: !p.isConnected, isHuman: false } : p),
          logs: [`系统: ${prev.players[pid].name} ${prev.players[pid].isConnected ? '断开连接，电脑托管' : '重新连接'}`, ...prev.logs]
      }));
  };

  return (
    <div className="w-full h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden flex flex-col relative select-none">
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

      {/* --- MODALS --- */}
      
      {/* Name Input Modal */}
      {showNameModal && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-blue-500 w-80">
                  <h3 className="text-2xl font-bold mb-4 text-center">请输入您的昵称</h3>
                  <input 
                    autoFocus
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-700 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-center mb-4 text-xl"
                    placeholder="例如: 赌神"
                    onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit(e.currentTarget.value)}
                  />
                  <div className="flex gap-2">
                      <button 
                        onClick={() => setShowNameModal(false)}
                        className="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-500"
                      >
                          取消
                      </button>
                      <button 
                        onClick={() => handleNameSubmit(document.querySelector<HTMLInputElement>('input[type="text"]')?.value || '')}
                        className="flex-1 py-2 bg-blue-600 rounded hover:bg-blue-500 font-bold"
                      >
                          确定
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Stats Modal (Personal Info) */}
      {showStatsModal && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowStatsModal(false)}>
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-yellow-500 w-80 text-center" onClick={e => e.stopPropagation()}>
                  <h3 className="text-2xl font-bold mb-4 text-yellow-400">个人信息</h3>
                  
                  {/* Name Edit Input */}
                  <div className="mb-6 text-left">
                      <label className="text-xs text-gray-400 uppercase font-bold ml-1">昵称</label>
                      <input 
                          type="text" 
                          value={userName} 
                          onChange={(e) => {
                              setUserName(e.target.value);
                              localStorage.setItem('za6_username', e.target.value);
                          }}
                          className="w-full mt-1 px-4 py-2 bg-slate-700 rounded border border-slate-600 focus:outline-none focus:border-yellow-400 text-lg font-bold text-center text-white placeholder-gray-500"
                          placeholder="请输入您的昵称"
                      />
                  </div>

                  <div className="mb-6">
                      <h4 className="text-gray-400 text-sm uppercase mb-2">单机挑战</h4>
                      <div className="text-3xl font-mono">{userStats.singlePlayer.wins} <span className="text-base text-gray-500">胜</span> / {userStats.singlePlayer.played} <span className="text-base text-gray-500">局</span></div>
                      <div className="text-xs text-gray-400 mt-1">胜率: {userStats.singlePlayer.played ? Math.round((userStats.singlePlayer.wins/userStats.singlePlayer.played)*100) : 0}%</div>
                  </div>
                  <div className="mb-8 border-t border-gray-700 pt-6">
                      <h4 className="text-gray-400 text-sm uppercase mb-2">线上联机</h4>
                      <div className="text-3xl font-mono">{userStats.multiPlayer.wins} <span className="text-base text-gray-500">胜</span> / {userStats.multiPlayer.played} <span className="text-base text-gray-500">局</span></div>
                      <div className="text-xs text-gray-400 mt-1">胜率: {userStats.multiPlayer.played ? Math.round((userStats.multiPlayer.wins/userStats.multiPlayer.played)*100) : 0}%</div>
                  </div>
                  <button onClick={() => setShowStatsModal(false)} className="w-full py-2 bg-gray-600 rounded hover:bg-gray-500">
                      关闭
                  </button>
              </div>
          </div>
      )}

      {/* --- HOME SCREEN --- */}
      {view === 'home' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-50">
              <h1 className="text-6xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 drop-shadow-lg">砸六家</h1>
              <div className="flex flex-col md:flex-row gap-6 mb-8">
                  <button onClick={requestSinglePlayer} className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-xl font-bold shadow-lg transform transition hover:-translate-y-1 active:scale-95 w-48">
                      单机挑战
                  </button>
                  <button onClick={() => userName ? setView('lobby') : (setPendingAction('join'), setShowNameModal(true))} className="px-8 py-4 bg-green-600 hover:bg-green-500 rounded-xl text-xl font-bold shadow-lg transform transition hover:-translate-y-1 active:scale-95 w-48">
                      线上联机
                  </button>
              </div>
              <button onClick={() => setShowStatsModal(true)} className="text-gray-400 hover:text-white flex items-center gap-2 px-4 py-2 border border-gray-700 rounded-full hover:bg-slate-800 transition-colors">
                  <span className="text-xl">📊</span> 我的信息
              </button>
              <div className="absolute bottom-4 text-gray-500 text-sm">
                  作者: <a href="https://haoj.in" target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 underline">haoj.in</a>
              </div>
          </div>
      )}

      {/* --- LOBBY SELECT --- */}
      {view === 'lobby' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-50">
              <h2 className="text-3xl font-bold mb-8">游戏大厅</h2>
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-96 space-y-4 border border-slate-700">
                  <button onClick={handleCreateRoom} className="w-full py-3 bg-indigo-600 rounded-lg font-bold hover:bg-indigo-500">
                      创建房间
                  </button>
                  <div className="border-t border-slate-600 my-4 relative">
                      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 px-2 text-sm text-gray-400">或者</span>
                  </div>
                  <div className="space-y-2">
                      <input 
                        type="text" 
                        placeholder="输入房间号 (如: 1234)" 
                        value={inputRoomId}
                        onChange={e => setInputRoomId(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-700 rounded border border-slate-600 focus:outline-none focus:border-indigo-500 text-center"
                        maxLength={4}
                      />
                      <input 
                        type="password" 
                        placeholder="房间密码 (选填)" 
                        value={inputPassword}
                        onChange={e => setInputPassword(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-700 rounded border border-slate-600 focus:outline-none focus:border-indigo-500 text-center"
                      />
                      <button onClick={handleJoinRoom} className="w-full py-3 bg-emerald-600 rounded-lg font-bold hover:bg-emerald-500">
                          加入房间
                      </button>
                  </div>
                  <button onClick={() => setView('home')} className="w-full py-2 text-gray-400 hover:text-white text-sm">
                      返回主页
                  </button>
              </div>
          </div>
      )}

      {/* --- ROOM WAITING (LOBBY) --- */}
      {view === 'room_waiting' && room && (
          <div className="absolute inset-0 flex flex-col items-center pt-10 md:pt-20 bg-slate-800 z-50">
              <div className="text-center mb-4 md:mb-8">
                  <h2 className="text-3xl font-bold text-white">房间: {room.roomId} {isSpectator && "(观战)"}</h2>
                  {room.password && <p className="text-gray-400">密码: {room.password}</p>}
                  {!isSpectator && (
                     <div className="mt-2 flex gap-2 justify-center">
                         <button onClick={copyInviteLink} className="text-blue-400 text-sm hover:text-blue-300 underline bg-blue-900/30 px-3 py-1 rounded">
                             🔗 邀请好友
                         </button>
                     </div>
                  )}
                  <p className="text-yellow-400 mt-4 text-sm font-bold">
                      {isSpectator ? "您只能观看" : (room.players.every(p => !p.isHuman || p.isReady) ? '所有人都准备好了！' : '等待玩家准备...')}
                  </p>
              </div>

              {/* Player Grid */}
              <div className="grid grid-cols-3 gap-2 md:gap-8 mb-4">
                  {room.players.map((p, i) => {
                      // Find active emote for this player in waiting room
                      const pEmote = gameState.activeEmotes.find(e => e.senderId === p.id);
                      return (
                          <div key={i} className={`
                              w-20 h-28 md:w-24 md:h-32 rounded-lg border-2 flex flex-col items-center justify-center relative transition-all
                              ${p.team === 'A' ? 'border-blue-500/30 bg-blue-900/20' : 'border-red-500/30 bg-red-900/20'}
                              ${p.id === myPlayerId ? 'ring-2 ring-yellow-400' : ''}
                          `}>
                              {pEmote && (
                                  <div className="absolute -top-10 bg-white text-black text-xs px-2 py-1 rounded-lg shadow-lg whitespace-nowrap z-10 animate-bounce">
                                      {pEmote.content}
                                  </div>
                              )}
                              <div className={`w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-lg mb-2 ${p.isReady ? 'bg-green-500' : 'bg-gray-600'}`}>
                                  {p.name[0]}
                              </div>
                              <span className="text-xs truncate max-w-full px-1">{p.name}</span>
                              <span className="text-[10px] text-gray-400">{p.team === 'A' ? 'A队' : 'B队'}</span>
                              
                              {p.isReady && <span className="absolute top-2 right-2 text-green-400 text-xs">✔</span>}
                          </div>
                      );
                  })}
              </div>

              {/* Lobby Quick Chat */}
              {!isSpectator && (
                  <div className="flex gap-2 mb-8 flex-wrap justify-center px-4">
                      {LOBBY_MESSAGES.map(msg => (
                          <button 
                            key={msg} 
                            onClick={() => sendLobbyMessage(msg)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-full text-xs md:text-sm border border-slate-600"
                          >
                              {msg}
                          </button>
                      ))}
                  </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                  {!isSpectator && (
                    <button onClick={toggleReady} className={`px-8 py-3 rounded-xl font-bold transition-all min-w-[120px] ${room.players[myPlayerId].isReady ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-500'}`}>
                        {room.players[myPlayerId].isReady ? '取消准备' : '准备'}
                    </button>
                  )}
                  
                  {room.hostId === myPlayerId && !isSpectator && (
                      <button 
                        onClick={startGame} 
                        disabled={!room.players.every(p => !p.isHuman || p.isReady)} 
                        className={`px-8 py-3 bg-yellow-600 rounded-xl font-bold transition-all min-w-[120px] ${!room.players.every(p => !p.isHuman || p.isReady) ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:bg-yellow-500'}`}
                      >
                          开始游戏
                      </button>
                  )}
                  
                  <button onClick={() => setView('home')} className="px-6 py-3 bg-red-800 rounded-xl text-sm hover:bg-red-700">
                      离开
                  </button>
              </div>
          </div>
      )}

      {/* --- SCORE SUMMARY --- */}
      {view === 'score_summary' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
               <div className="bg-slate-800 p-8 rounded-2xl max-w-lg w-full text-center border border-yellow-600/50">
                   <h2 className="text-3xl font-bold mb-4 text-yellow-400">本局结算</h2>
                   <div className="mb-6 space-y-2">
                       {gameState.scores.slice(-1).map((s, i) => (
                           <div key={i} className="text-xl">
                               {s.winnerTeam === 'Draw' ? '平局' : `队伍 ${s.winnerTeam} 获胜!`}
                               <div className="text-sm text-gray-400 mt-1">{s.details}</div>
                           </div>
                       ))}
                   </div>

                   <div className="mb-8">
                       <h3 className="font-bold border-b border-gray-600 pb-2 mb-2">历史战绩</h3>
                       <div className="max-h-40 overflow-y-auto text-sm space-y-1">
                           {gameState.scores.map((s, i) => (
                               <div key={i} className="flex justify-between px-4">
                                   <span>第 {s.round} 局</span>
                                   <span>{s.winnerTeam === 'A' ? 'A队胜' : s.winnerTeam === 'B' ? 'B队胜' : '平'}</span>
                               </div>
                           ))}
                       </div>
                   </div>
                   
                   <div className="flex gap-4 justify-center">
                        <button onClick={() => handleLeaveGame(true)} className="px-6 py-2 bg-gray-600 rounded">退出房间</button>
                        {(!room || room.roomId === 'LOCAL' || room.hostId === myPlayerId) ? (
                            <button onClick={continueGame} className="px-6 py-2 bg-green-600 rounded font-bold">下一局</button>
                        ) : (
                            <div className="text-gray-400 flex items-center px-4">等待房主继续...</div>
                        )}
                   </div>
               </div>
          </div>
      )}


      {/* --- HUD --- */}
      {view === 'game' && (
        <div className="absolute top-0 left-0 w-full p-2 md:p-4 flex justify-between items-start z-40 pointer-events-none">
            <div className="flex flex-col gap-2 pointer-events-auto">
                <button onClick={() => handleLeaveGame(false)} className="bg-red-900/80 border border-red-500 text-xs px-2 py-1 rounded hover:bg-red-800 text-white w-fit">
                    退出游戏
                </button>
                <div 
                    onClick={copyRoomInfo}
                    className="bg-black/60 p-2 rounded-lg backdrop-blur-md border border-gray-700 cursor-pointer hover:bg-black/80 transition-colors active:scale-95"
                >
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-sm md:text-lg font-bold text-yellow-400">
                            {room?.roomId === 'LOCAL' ? '单机' : room?.roomId} {isSpectator ? '(观战)' : ''}
                        </h1>
                        <span className="text-[10px] bg-blue-900 px-1 rounded">R{gameState.currentRound}</span>
                        {room?.roomId !== 'LOCAL' && <span className="text-[10px] text-gray-400 ml-1">📋</span>}
                    </div>
                    <div className="flex gap-2 text-[10px] md:text-sm">
                        <span className="text-blue-400 font-bold">A队: {gameState.players.filter(p => p.team === 'A' && p.isFinished).length} 完</span>
                        <span className="text-red-400 font-bold">B队: {gameState.players.filter(p => p.team === 'B' && p.isFinished).length} 完</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-2">
                <div className="w-24 md:w-48 bg-black/40 p-1 rounded text-[8px] md:text-[10px] h-auto pointer-events-none border-none z-0">
                    {gameState.logs.slice(0, 3).map((log, i) => (
                        <div key={i} className="mb-0.5 text-gray-300 opacity-80">{log}</div>
                    ))}
                </div>
                
                {/* Debug Tools (Hidden on mobile usually, keeping for functionality) */}
                <div className="pointer-events-auto flex flex-col gap-1 bg-black/40 p-1 rounded hidden md:flex">
                    <span className="text-[10px] text-gray-500 uppercase text-center">Admin</span>
                    {gameState.players.map(p => p.id !== myPlayerId && (
                         <button 
                            key={p.id} 
                            onClick={() => toggleDisconnect(p.id)}
                            className={`text-[10px] px-2 py-1 rounded ${p.isConnected ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'}`}
                         >
                            {p.isConnected ? `断${p.id}` : `连${p.id}`}
                         </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* --- GAME BOARD --- */}
      {view === 'game' && gameState.players.length > 0 && (
         <div className="flex-grow relative w-full h-full">
             <GameBoard 
               players={gameState.players} 
               currentTurnIndex={gameState.currentTurnIndex}
               handHistory={gameState.handHistory}
               activeEmotes={gameState.activeEmotes}
               onEmoteSend={sendEmote}
               myPlayerId={myPlayerId}
               turnTimeLeft={gameState.turnTimeLeft}
             />
         </div>
      )}

      {/* --- CONTROLS --- */}
      {view === 'game' && gameState.players.length > 0 && !isSpectator && (
        <div className="absolute bottom-0 left-0 h-32 md:h-48 w-full flex flex-col items-center justify-end pb-2 md:pb-4 z-40 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
           
           {/* Auto Play Overlay/Button */}
           {isAuto && (
               <div className="absolute bottom-24 md:bottom-32 z-50 pointer-events-auto animate-bounce">
                   <button 
                       onClick={cancelAutoPlay}
                       className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-full shadow-lg border-2 border-red-400 text-sm md:text-base flex items-center gap-2"
                   >
                       <span>🤖 托管中</span>
                       <span className="bg-white/20 px-2 rounded text-xs">点击恢复</span>
                   </button>
               </div>
           )}

           {/* Actions */}
           <div className={`mb-2 md:mb-4 flex gap-4 h-10 md:h-12 pointer-events-auto transition-opacity duration-300 ${isAuto ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
              {isUserTurn && (
                  <>
                    <button 
                        onClick={handleUserPlay}
                        disabled={selectedCards.length === 0}
                        className={`
                            px-4 md:px-8 py-1 md:py-2 rounded-full font-bold shadow-lg transition-transform active:scale-95 border-2 text-sm md:text-base
                            ${selectedCards.length > 0 
                                ? 'bg-green-600 hover:bg-green-500 border-green-400 text-white' 
                                : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}
                        `}
                    >
                        出牌
                    </button>
                    <button 
                        onClick={handleUserPass}
                        disabled={isFreeTurn}
                        className={`
                            px-4 md:px-8 py-1 md:py-2 rounded-full font-bold shadow-lg transition-transform active:scale-95 border-2 text-sm md:text-base
                            ${!isFreeTurn 
                                ? 'bg-yellow-600 hover:bg-yellow-500 border-yellow-400 text-white' 
                                : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'}
                        `}
                    >
                        不出
                    </button>
                  </>
              )}
           </div>

           {/* Hand - Scrollable on mobile if needed but centered */}
           <div className="flex pointer-events-auto overflow-x-visible items-end pb-1 w-full justify-center">
               <div className={`flex -space-x-5 md:-space-x-8 hover:-space-x-4 transition-all duration-300 px-4 pb-2 ${isAuto ? 'grayscale opacity-80' : ''}`}>
                  {gameState.players[myPlayerId].hand.map((card) => (
                      <CardComponent 
                        key={card.id} 
                        card={card} 
                        selected={selectedCards.some(c => c.id === card.id)}
                        onClick={() => !isAuto && isUserTurn && toggleSelectCard(card)}
                      />
                  ))}
               </div>
           </div>
        </div>
      )}
      
      {/* --- SPECTATOR MESSAGE --- */}
      {view === 'game' && isSpectator && (
          <div className="absolute bottom-10 left-0 w-full text-center text-yellow-400 font-bold bg-black/50 py-2 animate-pulse pointer-events-none z-40">
              当前为观战模式
          </div>
      )}
    </div>
  );
};

export default App;