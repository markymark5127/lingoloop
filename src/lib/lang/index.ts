/**
 * Target languages (what the learner is learning) — distinct from the UI locale (what they speak).
 *
 * Japanese target text is stored with spaces between words ("猫 は ベッド で 寝ています。"), and an
 * optional parallel `reading` in kana with the same word boundaries. Spaces are hidden on screen
 * (see displayText) but drive word tapping, vocabulary matching and word-order games.
 */
import type { Locale } from "@/lib/i18n/core";

export const TARGET_LANGUAGES = ["es", "ja"] as const;
export type TargetLang = (typeof TARGET_LANGUAGES)[number];

export const TARGET_INFO: Record<TargetLang, { name: string; endonym: string; flag: string; bcp47: string; espeak: string; hello: string }> = {
  es: { name: "Spanish", endonym: "Español", flag: "🇪🇸", bcp47: "es-ES", espeak: "es", hello: "¡Hola!" },
  ja: { name: "Japanese", endonym: "日本語", flag: "🇯🇵", bcp47: "ja-JP", espeak: "ja", hello: "こんにちは！" },
};

export function isTargetLang(v: unknown): v is TargetLang {
  return typeof v === "string" && (TARGET_LANGUAGES as readonly string[]).includes(v);
}
export function toTarget(v: unknown): TargetLang {
  return isTargetLang(v) ? v : "es";
}

/** Which languages a learner can study from their native language (no Japanese → Japanese). */
export function allowedTargets(native: Locale): TargetLang[] {
  return native === "ja" ? ["es"] : ["es", "ja"];
}

// ---------------------------------------------------------------- Japanese script helpers
const JA_CHAR = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ々〆ー]/;
const JA_CHAR_G = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ々〆ー]/g;
const KANJI = /[㐀-䶿一-鿿々]/;

export const isJapaneseText = (s: string) => JA_CHAR.test(s);
export const hasKanji = (s: string) => KANJI.test(s);
export const langOfText = (s: string): TargetLang => (isJapaneseText(s) ? "ja" : "es");

/** Remove the word-separating spaces from stored Japanese text. Leaves Latin-script spacing alone. */
export function displayText(s: string): string {
  if (!isJapaneseText(s)) return s;
  // Drop a space unless it sits between two Latin/number characters (e.g. "Wi-Fi password").
  return s.replace(/(\S)\s+(?=(\S))/g, (m, a: string, b: string) => (/[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b) ? `${a} ` : a)).trim();
}

/** Strip all whitespace (for comparing Japanese answers). */
export const collapse = (s: string) => s.replace(/\s+/g, "");

/** Katakana → hiragana (leaves ー and other characters alone). */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const DIGRAPHS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho", ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo", ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo", じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  // loanword sounds
  てぃ: "ti", でぃ: "di", ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", うぃ: "wi", うぇ: "we", うぉ: "wo",
  しぇ: "she", じぇ: "je", ちぇ: "che", とぅ: "tu", どぅ: "du", ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
};
const MONO: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
  "。": ".", "、": ",", "！": "!", "？": "?", "「": "\"", "」": "\"", "・": " ", "　": " ", "〜": "~",
};

/**
 * Hepburn romaji for a kana string. Particles written as separate words (は, へ, を) are read
 * wa / e / o. Long vowels (ー) repeat the previous vowel. Non-kana characters pass through.
 */
export function kanaToRomaji(kana: string): string {
  return kana
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word)) return word;
      const h = toHiragana(word);
      const particle = h.match(/^([はへを])([、。！？]*)$/);
      if (particle) return { は: "wa", へ: "e", を: "o" }[particle[1]]! + [...particle[2]].map((c) => MONO[c] ?? c).join("");
      let out = "";
      for (let i = 0; i < h.length; i++) {
        const two = h.slice(i, i + 2);
        if (DIGRAPHS[two]) {
          out += DIGRAPHS[two];
          i++;
          continue;
        }
        const c = h[i];
        if (c === "っ") {
          const next = DIGRAPHS[h.slice(i + 1, i + 3)] ?? MONO[h[i + 1]] ?? "";
          out += next.startsWith("ch") ? "t" : next.charAt(0).match(/[a-z]/) ? next.charAt(0) : "";
          continue;
        }
        if (c === "ー") {
          const v = out.match(/[aeiou](?=[^aeiou]*$)/)?.[0];
          out += v ?? "";
          continue;
        }
        if (c === "ん" && /^[あいうえおやゆよ]/.test(h[i + 1] ?? "")) {
          out += "n'";
          continue;
        }
        out += MONO[c] ?? c;
      }
      return out;
    })
    .join("");
}

/** Count Japanese characters (used for level-appropriateness checks). */
export const japaneseCharCount = (s: string) => (s.match(JA_CHAR_G) ?? []).length;
