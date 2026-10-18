import React from 'react';

// Deterministic avatar tint per username — same user, same color everywhere.
const AVATAR_GRADIENTS = [
  ['#a855f7', '#ec4899'],
  ['#38bdf8', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#38bdf8'],
  ['#ec4899', '#f59e0b'],
  ['#8b5cf6', '#38bdf8'],
];
export const avatarTint = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  const [a, b] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
};

export default function MiniAvatar({ name, size = 20, ring = false, emoji = '' }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-black text-white uppercase"
      style={{
        width: size, height: size, fontSize: emoji ? size * 0.55 : size * 0.46,
        background: avatarTint(name || '?'),
        boxShadow: ring ? '0 0 0 2px rgba(255,255,255,0.15)' : '0 1px 4px rgba(0,0,0,0.4)',
      }}
      aria-hidden="true"
    >
      {emoji || ((name || '?').trim().charAt(0) || '?')}
    </span>
  );
}
