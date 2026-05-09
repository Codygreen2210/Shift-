import { DICTIONARY, diffByOne } from "./dictionary";

export type Puzzle = {
  start: string;
  target: string;
  par: number;
  theme: string;
  solution: string[];
};

// Every puzzle below has been mechanically verified:
// - every word exists in the dictionary
// - every step changes exactly one letter
// - solution[0] === start, solution[last] === target
const RAW: Puzzle[] = [
  { start: "COLD", target: "WARM", par: 4, theme: "Temperature", solution: ["COLD","CORD","CARD","WARD","WARM"] },
  { start: "LEAD", target: "GOLD", par: 3, theme: "Alchemy", solution: ["LEAD","LOAD","GOAD","GOLD"] },
  { start: "DARK", target: "DAWN", par: 2, theme: "Daybreak", solution: ["DARK","DARN","DAWN"] },
  { start: "HEAD", target: "TAIL", par: 5, theme: "Anatomy", solution: ["HEAD","HEAL","HELL","HALL","HAIL","TAIL"] },
  { start: "WORD", target: "GAME", par: 5, theme: "Wordplay", solution: ["WORD","CORD","CARD","CARE","CAME","GAME"] },
  { start: "FOOD", target: "COOK", par: 3, theme: "Kitchen", solution: ["FOOD","FOOL","COOL","COOK"] },
  { start: "LOVE", target: "HATE", par: 3, theme: "Opposites", solution: ["LOVE","HOVE","HAVE","HATE"] },
  { start: "MICE", target: "RATS", par: 4, theme: "Vermin", solution: ["MICE","MACE","MATE","MATS","RATS"] },
  { start: "WORM", target: "BIRD", par: 4, theme: "Food chain", solution: ["WORM","WARM","WARD","BARD","BIRD"] },
  { start: "RACE", target: "MILE", par: 3, theme: "Track", solution: ["RACE","MACE","MALE","MILE"] },
  { start: "NOTE", target: "SONG", par: 4, theme: "Melody", solution: ["NOTE","DOTE","DONE","DONG","SONG"] },
  { start: "STEP", target: "RUNS", par: 5, theme: "Forward", solution: ["STEP","SEEP","SEES","SUES","RUES","RUNS"] },
  { start: "DUSK", target: "DAWN", par: 5, theme: "Hours", solution: ["DUSK","DUNK","DANK","DARK","DARN","DAWN"] },
  { start: "MOON", target: "STAR", par: 5, theme: "Night sky", solution: ["MOON","BOON","BOOR","BOAR","SOAR","STAR"] },
  { start: "WIND", target: "RAIN", par: 4, theme: "Storm", solution: ["WIND","RIND","RAND","RAID","RAIN"] },
  { start: "SLOW", target: "FAST", par: 6, theme: "Speed", solution: ["SLOW","FLOW","FLAW","FLAT","FEAT","FEST","FAST"] },
  { start: "TIME", target: "PAST", par: 5, theme: "Memory", solution: ["TIME","TAME","CAME","CASE","CAST","PAST"] },
  { start: "SOUL", target: "MIND", par: 6, theme: "Inner", solution: ["SOUL","FOUL","FOOL","FOOD","FOND","FIND","MIND"] },
  { start: "BOOK", target: "READ", par: 5, theme: "Library", solution: ["BOOK","BOOM","ROOM","ROAM","REAM","READ"] },
  { start: "SAND", target: "DUNE", par: 4, theme: "Desert", solution: ["SAND","SANE","SINE","DINE","DUNE"] },
  { start: "MILK", target: "WINE", par: 3, theme: "Pour", solution: ["MILK","MILE","MINE","WINE"] },
  { start: "FISH", target: "BAIT", par: 5, theme: "Angling", solution: ["FISH","FIST","FAST","WAST","WAIT","BAIT"] },
  { start: "LION", target: "TAME", par: 4, theme: "Beast", solution: ["LION","LIMN","LIME","LAME","TAME"] },
  { start: "LIVE", target: "DEAD", par: 6, theme: "Mortality", solution: ["LIVE","HIVE","HIRE","HERE","HERD","HEAD","DEAD"] },
  { start: "RICH", target: "POOR", par: 6, theme: "Reversal", solution: ["RICH","RICK","ROCK","ROOK","BOOK","BOOR","POOR"] },
  { start: "LATE", target: "EARN", par: 4, theme: "Past tense", solution: ["LATE","DATE","DARE","DARN","EARN"] },
  { start: "BARE", target: "WORE", par: 2, theme: "Dressed", solution: ["BARE","BORE","WORE"] },
  { start: "DOOR", target: "ROOM", par: 2, theme: "Threshold", solution: ["DOOR","DOOM","ROOM"] },
  { start: "GOLD", target: "COIN", par: 4, theme: "Treasure", solution: ["GOLD","COLD","CORD","CORN","COIN"] },
  { start: "BLUE", target: "GLOW", par: 4, theme: "Hue", solution: ["BLUE","FLUE","FLOE","FLOW","GLOW"] },
  { start: "MASK", target: "FACE", par: 3, theme: "Masquerade", solution: ["MASK","MACK","MACE","FACE"] },
  { start: "HEAT", target: "WAVE", par: 6, theme: "Summer", solution: ["HEAT","BEAT","BENT","WENT","WANT","WANE","WAVE"] },
  { start: "RAGE", target: "CALM", par: 4, theme: "Mood", solution: ["RAGE","PAGE","PALE","PALM","CALM"] },
  { start: "FOOL", target: "WISE", par: 6, theme: "Sage", solution: ["FOOL","FOOD","FOLD","WOLD","WILD","WILE","WISE"] },
  { start: "KING", target: "PAWN", par: 5, theme: "Chess", solution: ["KING","PING","PANG","PANS","PAWS","PAWN"] },
  { start: "BACK", target: "FORE", par: 4, theme: "Position", solution: ["BACK","BARK","BARE","BORE","FORE"] },
  { start: "SAFE", target: "RISK", par: 5, theme: "Stakes", solution: ["SAFE","SANE","SANK","RANK","RINK","RISK"] },
  { start: "GIVE", target: "TAKE", par: 4, theme: "Exchange", solution: ["GIVE","GAVE","CAVE","CAKE","TAKE"] },
  { start: "RAIN", target: "POUR", par: 6, theme: "Downfall", solution: ["RAIN","FAIN","FAIL","FOIL","FOUL","FOUR","POUR"] },
  { start: "BORN", target: "DEAD", par: 5, theme: "Cycle", solution: ["BORN","MORN","MOAN","MEAN","DEAN","DEAD"] },
  { start: "YEAR", target: "DATE", par: 6, theme: "Calendar", solution: ["YEAR","PEAR","PEAS","PETS","PATS","PATE","DATE"] },
  { start: "LOST", target: "FIND", par: 5, theme: "Search", solution: ["LOST","LEST","LENT","LEND","FEND","FIND"] },
  { start: "DUST", target: "DIRT", par: 3, theme: "Earth", solution: ["DUST","DUET","DIET","DIRT"] },
  { start: "FAKE", target: "REAL", par: 6, theme: "Truth", solution: ["FAKE","HAKE","HALE","HALL","HELL","HEAL","REAL"] },
  { start: "GIRL", target: "BOYS", par: 6, theme: "Youth", solution: ["GIRL","GILL","BILL","BOLL","BOWL","BOWS","BOYS"] },
  { start: "BARK", target: "BITE", par: 4, theme: "Dog", solution: ["BARK","BARE","BADE","BIDE","BITE"] },
  { start: "SAIL", target: "PORT", par: 5, theme: "Voyage", solution: ["SAIL","WAIL","WAIT","WART","PART","PORT"] },
  { start: "TALK", target: "HEAR", par: 5, theme: "Convo", solution: ["TALK","TALL","HALL","HELL","HEAL","HEAR"] },
  { start: "BOLD", target: "MEEK", par: 5, theme: "Bravery", solution: ["BOLD","BOLT","BELT","BEET","MEET","MEEK"] },
];

function verify(p: Puzzle): boolean {
  if (p.solution[0] !== p.start) return false;
  if (p.solution[p.solution.length - 1] !== p.target) return false;
  for (let i = 0; i < p.solution.length; i++) {
    const w = p.solution[i].toLowerCase();
    if (!DICTIONARY.has(w)) return false;
    if (i > 0 && !diffByOne(p.solution[i - 1], p.solution[i])) return false;
  }
  return true;
}

export const PUZZLES: Puzzle[] = RAW.filter(verify);

export function getDailyIndex(): number {
  const epoch = new Date(2026, 0, 1).getTime();
  const days = Math.floor((Date.now() - epoch) / 86400000);
  return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
}

export function getDayNumber(): number {
  const epoch = new Date(2026, 0, 1).getTime();
  return Math.max(1, Math.floor((Date.now() - epoch) / 86400000) + 1);
}

export function getDailyPuzzle(): Puzzle {
  return PUZZLES[getDailyIndex()];
}
