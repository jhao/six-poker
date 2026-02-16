import React, { useState } from 'react';
import { Player, PlayedHand, EmoteMessage } from '../types';
import { CardComponent } from './CardComponent';
import { TEAM_A_INDICES, EMOTE_LIST } from '../constants';

interface GameBoardProps {
  players: Player[];
  currentTurnIndex: number;
  handHistory: PlayedHand[];
  activeEmotes: EmoteMessage[];
  onEmoteSend: (targetId: number, content: string) => void;
  myPlayerId: number;
  turnTimeLeft: number;
}

export const GameBoard: React.FC<GameBoardProps> = ({ 
  players, 
  currentTurnIndex, 
  handHistory,
  activeEmotes,
  onEmoteSend,
  myPlayerId,
  turnTimeLeft
}) => {
  const [emoteMenuOpenId, setEmoteMenuOpenId] = useState<number | null>(null);

  // Render everyone around the table relative to my seat (me stays at bottom-center).
  const getRelativeSeatClass = (seatIndex: number) => {
    const relativeSeat = ((seatIndex - myPlayerId) % players.length + players.length) % players.length;

    const circularPositions = [
      'bottom-20 md:bottom-28 left-1/2 -translate-x-1/2', // Me
      'bottom-24 md:bottom-32 right-3 md:right-10',       // Bottom-right
      'top-1/2 right-2 md:right-8 -translate-y-1/2',      // Right
      'top-4 md:top-8 left-1/2 -translate-x-1/2',         // Top
      'top-1/2 left-2 md:left-8 -translate-y-1/2',        // Left
      'bottom-24 md:bottom-32 left-3 md:left-10'          // Bottom-left
    ];

    return circularPositions[relativeSeat] ?? circularPositions[0];
  };

  const handleAvatarClick = (targetId: number) => {
    setEmoteMenuOpenId(targetId);
  };


  const renderEmoteContent = (content: string) => {
    const match = content.match(/^【(.+?)】：(.*)$/);
    if (!match) return content;

    return (
      <>
        <span className="text-red-500 font-bold">【{match[1]}】</span>：{match[2]}
      </>
    );
  };

  const sendEmote = (targetId: number, msg: string) => {
    onEmoteSend(targetId, msg);
    setEmoteMenuOpenId(null);
  };

  // Show recent six plays in the pool, latest one as current focus
  const recentPool = handHistory.slice(-6);
  const historyToDisplay = recentPool.length > 1 ? recentPool.slice(0, recentPool.length - 1) : [];
  const currentHand = recentPool.length > 0 ? recentPool[recentPool.length - 1] : null;

  return (
    <div className="w-full h-full">
      
      {/* --- CENTER STAGE AREA --- */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-none gap-4 md:gap-8">
          
          {/* HISTORY STACK (Left of Center) */}
          {historyToDisplay.length > 0 && (
             <div className="flex flex-col items-end opacity-70 scale-75 md:scale-90 origin-right transition-all">
                 <div className="text-[10px] text-gray-400 mb-1">近六手牌池</div>
                 <div className="relative h-16 w-16 md:h-24 md:w-24">
                    {historyToDisplay.map((hand, i) => {
                         // Stack effect - increased offset for visibility
                         const offset = i * 25; // Increased from 4 to 25
                         return (
                            <div 
                                key={i} 
                                className="absolute top-0 right-0 flex transition-all duration-300 shadow-lg"
                                style={{ transform: `translate(${-offset}px, ${-offset/2}px)`, zIndex: i }}
                            >
                                <div className="flex -space-x-4 md:-space-x-6">
                                    {hand.cards.map(c => <CardComponent key={c.id} card={c} small />)}
                                </div>
                            </div>
                         );
                    })}
                 </div>
             </div>
          )}

          {/* CURRENT PLAYED HAND (Center) */}
          <div className="flex flex-col items-center justify-center">
              {currentHand ? (
                  <div className="flex flex-col items-center animate-pop-in">
                      <div className={`
                          text-xs md:text-sm mb-2 font-mono drop-shadow-md px-3 py-1 rounded-full border border-white/30 font-bold
                          ${currentHand.playerTeam === 'A' ? 'bg-blue-900/80 text-blue-200' : 'bg-red-900/80 text-red-200'}
                      `}>
                           {currentHand.playerName} ({currentHand.playerTeam}队)
                      </div>
                      <div className="flex gap-1 justify-center shadow-2xl scale-110 md:scale-125 transition-transform duration-300">
                          {currentHand.cards.map(c => (
                              <CardComponent key={c.id} card={c} small={false} />
                          ))}
                      </div>
                      <div className="mt-2 text-white font-bold text-xs md:text-sm bg-blue-600/90 px-3 py-0.5 rounded-full shadow-lg">
                          {currentHand.type}
                      </div>
                  </div>
              ) : (
                 <div className="text-white/10 font-bold text-4xl md:text-6xl tracking-widest uppercase select-none pointer-events-none">
                     砸六家
                 </div>
              )}
          </div>
      </div>

      {/* --- EMOTE MODAL (Centered) --- */}
      {emoteMenuOpenId !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEmoteMenuOpenId(null)}>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-600 shadow-2xl animate-bounce-in max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-center text-white font-bold mb-4">
                    对 {players[emoteMenuOpenId].name} 说:
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {EMOTE_LIST.map(msg => (
                        <button 
                            key={msg}
                            onClick={() => sendEmote(emoteMenuOpenId, msg)}
                            className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 rounded text-sm transition-colors border border-slate-600"
                        >
                            {msg}
                        </button>
                    ))}
                </div>
                <button 
                    onClick={() => setEmoteMenuOpenId(null)}
                    className="mt-4 w-full py-2 text-gray-400 text-xs hover:text-white"
                >
                    取消
                </button>
            </div>
        </div>
      )}

      {/* --- PLAYERS --- */}
      {players.map((p, idx) => {
        const isCurrentTurn = idx === currentTurnIndex;
        const isTeammate = TEAM_A_INDICES.includes(myPlayerId) === TEAM_A_INDICES.includes(p.id);
        const playerEmote = activeEmotes.find(e => e.senderId === p.id);
        
        return (
          <div 
            key={p.id} 
            className={`absolute ${getRelativeSeatClass(p.seatIndex)} flex flex-col items-center transition-all duration-300 z-20`}
          >
            {/* Emote Bubble */}
            {playerEmote && (
                <div className="absolute -top-12 md:-top-16 bg-white text-black px-3 py-2 rounded-2xl rounded-bl-none shadow-lg animate-bounce z-50 whitespace-nowrap text-xs md:text-sm font-bold border-2 border-gray-200 max-w-[150px] overflow-hidden text-ellipsis">
                    {renderEmoteContent(playerEmote.content)}
                </div>
            )}
            
            {/* Player Avatar/Info */}
            <div 
                onClick={() => handleAvatarClick(p.id)}
                className={`
                    relative flex flex-col items-center p-1 md:p-2 rounded-xl border-2 backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors
                    ${isCurrentTurn ? 'border-yellow-400 bg-yellow-900/40 scale-105 md:scale-110 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'border-transparent bg-black/40'}
                    ${!p.isConnected ? 'grayscale opacity-70 border-dashed border-gray-500' : ''}
                `}
            >
                {/* Timer for Active Player */}
                {isCurrentTurn && !p.isFinished && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-black/80 border-2 border-yellow-400 flex items-center justify-center z-50 animate-pulse">
                        <span className={`text-sm font-bold font-mono ${turnTimeLeft <= 5 ? 'text-red-500' : 'text-yellow-400'}`}>
                            {turnTimeLeft}
                        </span>
                    </div>
                )}

                <div className={`
                    w-7 h-7 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-xs md:text-lg border-2 shadow-inner
                    ${isTeammate ? 'bg-blue-600 border-blue-400' : 'bg-red-600 border-red-400'}
                    ${p.isFinished ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 border-white' : ''}
                `}>
                    {p.isFinished ? '🏆' : p.name.charAt(0)}
                </div>
                
                <div className="mt-1 text-[10px] md:text-xs font-bold text-white shadow-black drop-shadow-md text-center leading-tight max-w-[68px] md:max-w-[100px] truncate">
                    {p.name} {p.isFinished && `(#${p.finishOrder})`}
                    {!p.isConnected && <span className="block text-[8px] text-red-300">(掉线)</span>}
                </div>
                <div className="text-[8px] md:text-[10px] text-gray-300">
                    {p.hand.length} 张
                </div>

                {isCurrentTurn && !p.isFinished && (
                    <div className="absolute -top-4 md:-top-6 animate-pulse text-yellow-400 text-[10px] md:text-xs font-bold whitespace-nowrap opacity-50">
                        思考中...
                    </div>
                )}
            </div>

            {/* Opponent Hand Display (Hidden Cards) */}
            {p.id !== myPlayerId && !p.isFinished && (
                <div className="mt-1 md:mt-2 flex -space-x-7 md:-space-x-8 scale-[0.62] md:scale-100 origin-top">
                    {p.hand.map((c, i) => (
                        <CardComponent key={c.id} card={c} small hidden />
                    ))}
                </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
