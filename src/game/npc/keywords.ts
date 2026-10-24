/**
 * Words players may say to an NPC in chat, in English, Polish or Brazilian Portuguese (players on one
 * server speak different languages). Saying "hi" / "cześć" / "oi" next to an NPC opens the
 * conversation; "trade" / "handel" / "negociar" opens the shop, "yes" / "tak" / "sim" accepts a task,
 * and so on. The dialogue window (clicking the options) works exactly as before; this only adds the
 * old way of typing to NPCs. Pure data and helpers: Game.say() acts on them.
 */
export type NpcKeyword = 'hi' | 'bye' | 'trade' | 'bank' | 'spells' | 'yes' | 'no' | 'work' | 'deposit' | 'balance' | 'help' | 'back' | 'advice' | 'steal';

/** Every accepted word (lower case, without accents or punctuation) → the keyword it means. */
const WORDS: Record<NpcKeyword, string[]> = {
  hi: ['hi', 'hello', 'hail', 'greetings', 'czesc', 'witaj', 'witam', 'dzien dobry', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'],
  bye: ['bye', 'farewell', 'goodbye', 'do widzenia', 'zegnaj', 'tchau', 'adeus', 'ate logo', 'ate mais'],
  trade: ['trade', 'shop', 'buy', 'sell', 'offer', 'wares', 'handel', 'handlujmy', 'kup', 'kupic', 'sprzedaj', 'sprzedac', 'sklep', 'oferta', 'negociar', 'comprar', 'vender', 'loja', 'troca', 'trocar'],
  bank: ['bank', 'banking', 'bankowac', 'banco'],
  spells: ['spells', 'spell', 'teach', 'learn', 'czary', 'zaklecia', 'naucz', 'magias', 'magia', 'feiticos', 'ensinar', 'aprender'],
  yes: ['yes', 'aye', 'accept', 'tak', 'zgoda', 'przyjmuje', 'sim', 'aceito'],
  no: ['no', 'nope', 'not now', 'nie', 'nie teraz', 'nao', 'agora nao'],
  work: ['quest', 'quests', 'mission', 'task', 'work', 'job', 'zadanie', 'zadania', 'misja', 'praca', 'missao', 'missoes', 'tarefa', 'trabalho'],
  deposit: ['deposit', 'deposit all', 'wplac', 'wplac wszystko', 'depositar', 'depositar tudo'],
  balance: ['balance', 'saldo', 'stan konta'],
  help: ['help', 'hint', 'what now', 'pomoc', 'podpowiedz', 'co teraz', 'ajuda', 'dica', 'e agora'],
  back: ['back', 'wroc', 'cofnij', 'voltar'],
  // trade-skill masters (trades/tradeNpcs.ts): how to train their skill
  advice: ['advice', 'train', 'training', 'skill', 'tips', 'rada', 'porada', 'trening', 'trenuj', 'umiejetnosc', 'conselho', 'treinar', 'treino', 'habilidade'],
  // townsfolk: try to pick their pocket (trades/thieving.ts)
  steal: ['steal', 'pickpocket', 'pick pocket', 'ukradnij', 'kradziez', 'okradnij', 'roubar', 'furtar', 'bater carteira'],
};

const BY_WORD = new Map<string, NpcKeyword>();
for (const [k, list] of Object.entries(WORDS) as Array<[NpcKeyword, string[]]>) for (const w of list) BY_WORD.set(w, k);

/** Lower case, accents and Polish letters folded (ł → l), punctuation dropped, spaces squeezed. */
export function foldWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The keyword a short chat line means ("Cześć!" → 'hi', "negociar" → 'trade'), or null. */
export function npcKeyword(text: string): NpcKeyword | null {
  const w = foldWord(text);
  if (!w || w.length > 24) return null;
  return BY_WORD.get(w) ?? null;
}

/** The English keyword for a word in any of the three languages (tests, help text); unknown words come back unchanged. */
export function aliasKeywords(word: string): string {
  return npcKeyword(word) ?? word;
}
