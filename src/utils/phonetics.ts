// ReadStar — Phonetic Analysis Utilities
// Syllable counting, Soundex phonetic similarity, function word detection,
// synonym map for semantic substitution detection, POS detection.

export function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

export function countSyllablesInText(text: string): number {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, w) => sum + countSyllables(w), 0);
}

export function soundex(word: string): string {
  if (!word) return '0000';
  const upper = word.toUpperCase();
  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };
  let result = upper[0];
  let prev = codes[upper[0]] ?? '0';
  for (let i = 1; i < upper.length && result.length < 4; i++) {
    const code = codes[upper[i]] ?? '0';
    if (code !== '0' && code !== prev) result += code;
    prev = code;
  }
  return result.padEnd(4, '0').slice(0, 4);
}

export function phoneticallySimilar(a: string, b: string): boolean {
  const sa = soundex(a);
  const sb = soundex(b);
  return sa === sb && sa !== '0000';
}

// Visual similarity: character bigram overlap (Dice coefficient)
export function visuallySimilar(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 3) return false;
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a.toLowerCase());
  const bb = bigrams(b.toLowerCase());
  if (ba.size === 0 || bb.size === 0) return false;
  let common = 0;
  ba.forEach(g => { if (bb.has(g)) common++; });
  const dice = (2 * common) / (ba.size + bb.size);
  return dice >= 0.5;
}

export const FUNCTION_WORDS = new Set([
  'a','an','the','and','but','or','nor','for','yet','so',
  'in','on','at','by','for','with','about','against','between',
  'into','through','during','before','after','above','below',
  'to','from','up','down','of','off','over','under',
  'is','are','was','were','be','been','being','am',
  'has','have','had','do','does','did','will','would',
  'could','should','may','might','shall','can','must',
  'that','which','who','whom','whose','this','these','those',
  'i','me','my','myself','we','our','ours','ourselves',
  'you','your','yours','yourself','yourselves',
  'he','him','his','himself','she','her','hers','herself',
  'it','its','itself','they','them','their','theirs','themselves',
  'what','when','where','why','how','all','both','each','few','more',
  'most','other','some','such','no','not','only','same','than',
  'too','very','just','also','as','if',
]);

export function isFunctionWord(word: string): boolean {
  return FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''));
}

// 200-word synonym map for semantic substitution detection
export const SYNONYM_MAP: Record<string, string[]> = {
  big: ['large','huge','great','giant','enormous','vast'],
  small: ['little','tiny','mini','minute','petite','compact'],
  fast: ['quick','rapid','swift','speedy','hasty','brisk'],
  slow: ['sluggish','gradual','leisurely','unhurried'],
  happy: ['glad','joyful','pleased','content','cheerful','delighted'],
  sad: ['unhappy','sorrowful','gloomy','melancholy','downcast'],
  smart: ['clever','intelligent','bright','wise','sharp','brilliant'],
  bad: ['poor','terrible','awful','dreadful','horrible','nasty'],
  good: ['great','excellent','fine','wonderful','superb','splendid'],
  walk: ['stroll','march','stride','wander','trek','hike'],
  run: ['sprint','dash','race','jog','rush','hurry'],
  look: ['see','watch','observe','gaze','glance','view','peek'],
  say: ['tell','speak','state','declare','mention','remark','utter'],
  make: ['create','build','construct','form','produce','craft'],
  get: ['obtain','acquire','receive','gain','fetch','retrieve'],
  go: ['move','travel','proceed','head','advance','depart'],
  come: ['arrive','approach','appear','emerge','reach','near'],
  want: ['desire','wish','crave','need','seek'],
  think: ['believe','consider','feel','suppose','reckon','imagine'],
  know: ['understand','realize','recognize','grasp','comprehend'],
  like: ['enjoy','love','prefer','appreciate','favor','adore'],
  start: ['begin','commence','initiate','launch','open'],
  stop: ['end','finish','cease','halt','conclude','terminate'],
  old: ['ancient','aged','elderly','vintage','antique'],
  new: ['fresh','recent','modern','current','novel'],
  cold: ['cool','chilly','frigid','icy','freezing'],
  hot: ['warm','burning','scorching','heated','fiery'],
  hard: ['difficult','tough','challenging','demanding','complex'],
  easy: ['simple','effortless','straightforward','light'],
  bright: ['shiny','gleaming','radiant','vivid','brilliant'],
  dark: ['dim','gloomy','shadowy','murky','dusky'],
  loud: ['noisy','thunderous','booming','deafening'],
  quiet: ['silent','still','peaceful','hushed','calm'],
  pretty: ['beautiful','lovely','attractive','gorgeous','stunning'],
  ugly: ['hideous','unpleasant','unattractive','grim'],
  strong: ['powerful','mighty','sturdy','robust','muscular'],
  weak: ['frail','feeble','delicate','fragile'],
  high: ['tall','elevated','lofty','towering'],
  low: ['short','shallow','below','beneath'],
  near: ['close','nearby','adjacent','next'],
  far: ['distant','remote','away','removed'],
};

export function semanticallySimilar(a: string, b: string): boolean {
  const wa = a.toLowerCase();
  const wb = b.toLowerCase();
  const synA = SYNONYM_MAP[wa] ?? [];
  const synB = SYNONYM_MAP[wb] ?? [];
  return synA.includes(wb) || synB.includes(wa);
}

export type POS = 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';

export function guessPartOfSpeech(word: string): POS {
  const w = word.toLowerCase();
  if (/ly$/.test(w)) return 'adverb';
  if (/tion$|ness$|ment$|ity$|ism$|ance$|ence$/.test(w)) return 'noun';
  if (/ing$|ify$|ize$|ise$/.test(w)) return 'verb';
  if (/ed$/.test(w) && w.length > 4) return 'verb';
  if (/ful$|less$|ous$|ive$|able$|ible$|al$|ic$/.test(w)) return 'adjective';
  return 'other';
}

export function samePOS(a: string, b: string): boolean {
  const pa = guessPartOfSpeech(a);
  const pb = guessPartOfSpeech(b);
  return pa !== 'other' && pb !== 'other' && pa === pb;
}

export const CONSONANT_BLENDS = [
  'str','spr','scr','spl','squ',
  'bl','br','cl','cr','dr','fl','fr','gl','gr',
  'pl','pr','sl','sm','sn','sp','st','sw','tr','tw',
];
export const DIGRAPHS = ['ch','sh','th','wh','ph','ng','nk','ck'];

export function hasConsonantBlend(word: string): boolean {
  const w = word.toLowerCase();
  return CONSONANT_BLENDS.some(b => w.startsWith(b) || w.includes(b));
}

export function hasDigraph(word: string): boolean {
  const w = word.toLowerCase();
  return DIGRAPHS.some(d => w.includes(d));
}

export interface PhonemeProfile {
  initial: string;
  final: string;
  hasBlend: boolean;
  hasDigraph: boolean;
}

export function getPhonemeProfile(word: string): PhonemeProfile {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  return {
    initial: w.slice(0, 2),
    final: w.length >= 2 ? w.slice(-2) : w,
    hasBlend: hasConsonantBlend(w),
    hasDigraph: hasDigraph(w),
  };
}

export const WPM_BENCHMARKS = {
  grade3: { slow: 70, developing: 90, proficient: 110, fluent: 130 },
  grade4: { slow: 90, developing: 110, proficient: 130, fluent: 150 },
  grade5: { slow: 100, developing: 120, proficient: 140, fluent: 160 },
  grade6plus: { slow: 110, developing: 130, proficient: 150, fluent: 175 },
} as const;

export type GradeBenchmark = typeof WPM_BENCHMARKS.grade3;

export function getGradeBenchmark(grade: number): GradeBenchmark {
  if (grade <= 3) return WPM_BENCHMARKS.grade3;
  if (grade === 4) return WPM_BENCHMARKS.grade4;
  if (grade === 5) return WPM_BENCHMARKS.grade5;
  return WPM_BENCHMARKS.grade6plus;
}

export function wpmCategory(wpm: number, grade: number): 'slow' | 'developing' | 'proficient' | 'fluent' {
  const b = getGradeBenchmark(grade);
  if (wpm >= b.fluent) return 'fluent';
  if (wpm >= b.proficient) return 'proficient';
  if (wpm >= b.developing) return 'developing';
  return 'slow';
}
