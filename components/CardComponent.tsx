import React from 'react';
import { Card, Suit } from '../types';

interface CardProps {
  card: Card;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
  hidden?: boolean; // For opponents
}

export const CardComponent: React.FC<CardProps> = ({ card, onClick, selected, small, hidden }) => {
  const isRed = card.isRed;
  
  // Responsive sizing classes
  // Normal (Player): w-16 h-24 on mobile, w-20 h-28 on desktop
  // Small (Opponents/History): w-8 h-12 on mobile, w-10 h-14 on desktop
  
  if (hidden) {
    return (
      <div 
        className={`
          ${small ? 'w-8 h-11 md:w-10 md:h-14' : 'w-14 h-20 md:w-20 md:h-28'} 
          bg-blue-800 border md:border-2 border-white rounded md:rounded-lg shadow-sm
          flex items-center justify-center
          card-shadow relative
        `}
      >
        <div className="w-full h-full bg-opacity-10 bg-white pattern-dots" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        ${small ? 'w-8 h-11 md:w-10 md:h-14 text-[10px] md:text-xs' : 'w-14 h-20 md:w-20 md:h-28 text-sm md:text-xl'} 
        ${selected ? '-translate-y-2 md:-translate-y-4 ring-2 ring-yellow-400' : ''}
        bg-white rounded md:rounded-lg shadow-sm cursor-pointer select-none
        flex flex-col items-center justify-between p-0.5 md:p-1
        transition-all duration-200 card-shadow border border-gray-300
        ${isRed ? 'text-red-600' : 'text-gray-900'}
        relative
      `}
    >
      <div className="self-start font-bold leading-none pl-0.5 pt-0.5">
        <div>{card.rank}</div>
        <div className="text-[10px] md:text-sm">{card.suit}</div>
      </div>
      
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 ${small ? 'text-lg md:text-2xl' : 'text-3xl md:text-5xl'}`}>
         {card.suit}
      </div>

      {card.isWild && (
        <div className="absolute top-0 right-0">
           <span className="bg-yellow-300 text-yellow-900 text-[6px] md:text-[8px] px-1 rounded-bl-md font-bold uppercase tracking-tighter">混</span>
        </div>
      )}

      {/* Do not rotate if small (history cards), so they are readable */}
      <div className={`self-end font-bold leading-none pr-0.5 pb-0.5 ${small ? '' : 'rotate-180'}`}>
         <div>{card.rank}</div>
         <div className="text-[10px] md:text-sm">{card.suit}</div>
      </div>
    </div>
  );
};