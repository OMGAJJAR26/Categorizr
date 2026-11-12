// Inline SVG flags. Emoji flags render as plain letters ("US") in Chrome on Windows,
// so we draw them instead to look identical in every browser and OS.
const FLAG_SHAPES = {
  English: (
    <>
      <rect width="24" height="16" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#b22234" />
      ))}
      <rect width="10.5" height={(16 / 13) * 7} fill="#3c3b6e" />
      {[
        [2, 1.8], [5.2, 1.8], [8.4, 1.8],
        [3.6, 3.7], [6.8, 3.7],
        [2, 5.6], [5.2, 5.6], [8.4, 5.6],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.6" fill="#fff" />
      ))}
    </>
  ),
  Spanish: (
    <>
      <rect width="24" height="16" fill="#aa151b" />
      <rect y="4" width="24" height="8" fill="#f1bf00" />
    </>
  ),
  India: (
    <>
      <rect width="24" height="5.34" fill="#ff9933" />
      <rect y="5.33" width="24" height="5.34" fill="#fff" />
      <rect y="10.66" width="24" height="5.34" fill="#138808" />
      <circle cx="12" cy="8" r="2" fill="none" stroke="#000080" strokeWidth="0.45" />
      <circle cx="12" cy="8" r="0.4" fill="#000080" />
    </>
  ),
  Canadian: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="6" height="16" fill="#d52b1e" />
      <rect x="18" width="6" height="16" fill="#d52b1e" />
      <polygon
        fill="#d52b1e"
        points="12,2.5 13.1,5 14.8,4.3 14.3,7.3 16.5,6 16.1,7.2 18,7 17.2,9.3 18.2,10 14.7,12.6 15,13.6 12.6,13.2 12.6,15 11.4,15 11.4,13.2 9,13.6 9.3,12.6 5.8,10 6.8,9.3 6,7 7.9,7.2 7.5,6 9.7,7.3 9.2,4.3 10.9,5"
      />
    </>
  ),
};

const Flag = ({ language, className = "", width = 22, height = 15 }) => {
  const shape = FLAG_SHAPES[language];
  if (!shape) return null;
  return (
    <svg
      role="img"
      aria-label={`${language} flag`}
      viewBox="0 0 24 16"
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid slice"
      className={`block flex-shrink-0 rounded-[3px] ${className}`}
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" }}
    >
      {shape}
    </svg>
  );
};

export default Flag;
