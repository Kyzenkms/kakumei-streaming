export default function KakumeiLogo({ size = 34, showText = true, textClassName = "text-base sm:text-lg" }) {
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 select-none">
      {/* Brand Icon — Bold, Recognizable K with Stream Dynamic */}
      <div 
        className="relative flex items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/50 group-hover:scale-105 transition-all duration-300 border border-purple-500/40 shrink-0"
        style={{ width: size, height: size, background: 'linear-gradient(135deg, #120726 0%, #1e0b42 50%, #0c051a 100%)' }}
      >
        <svg viewBox="0 0 44 44" fill="none" className="w-[82%] h-[82%] drop-shadow-[0_0_8px_rgba(168,85,247,0.75)]">
          <defs>
            <linearGradient id="logo-k-grad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f3e8ff" />
              <stop offset="35%" stopColor="#c084fc" />
              <stop offset="70%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          {/* Vertical Stem of K */}
          <rect x="7" y="5" width="8" height="34" rx="4" fill="url(#logo-k-grad)" />
          {/* Upper Diagonal Arm of K */}
          <path d="M14 23.5L28.8 8.2C29.8 7.2 31.4 7.2 32.4 8.2L34.8 10.6C35.8 11.6 35.8 13.2 34.8 14.2L22.5 26L14 23.5Z" fill="url(#logo-k-grad)" />
          {/* Lower Diagonal Arm of K */}
          <path d="M14 20.5L22.5 18L34.8 29.8C35.8 30.8 35.8 32.4 34.8 33.4L32.4 35.8C31.4 36.8 29.8 36.8 28.8 35.8L14 20.5Z" fill="url(#logo-k-grad)" />
          {/* Glowing Play Stream Accent */}
          <polygon points="19,18.5 19,25.5 25.5,22" fill="#38bdf8" />
          <circle cx="34" cy="22" r="2.2" fill="#38bdf8" className="animate-pulse" />
        </svg>
      </div>

      {/* Brand Text */}
      {showText && (
        <span className={`${textClassName} font-black tracking-tight text-white flex items-center gap-0.5 whitespace-nowrap`}>
          Kakumei<span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">Stream</span>
        </span>
      )}
    </div>
  );
}
