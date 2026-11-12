import { makeT, type Locale } from "@/lib/i18n/core";
import { contentJa } from "./ja-content";
import type { TargetLang } from "@/lib/lang";
import { SCENARIOS_JA_TARGET } from "./japanese/scenarios";

/** A fixed roleplay line: target-language `text` (Japanese is word-spaced), kana `reading`, English `en`. */
export interface ScenarioLine {
  text: string;
  reading?: string;
  en: string;
}

export interface Scenario {
  id: string;
  language: TargetLang;
  title: string;
  emoji: string;
  character: string;
  role: string;
  goal: string;
  opening: ScenarioLine;
  /** Offline-engine follow-up prompts, asked in order. */
  turns: ScenarioLine[];
}

const SCENARIOS_ES: Scenario[] = [
  {
    language: "es",
    id: "restaurant",
    title: "At a restaurant",
    emoji: "🍽️",
    character: "Lucía",
    role: "a friendly waiter at a small café in Madrid",
    goal: "Order food and a drink, then ask for the bill",
    opening: { text: "¡Hola, buenas! ¿Qué te apetece comer hoy?", en: "Hi! Welcome. What do you want to eat today?" },
    turns: [
      { text: "Muy bien. ¿Y de beber? Tenemos agua, café y zumo de naranja.", en: "Very good. And to drink? We have water, coffee and orange juice." },
      { text: "Perfecto. ¿Te apetece algo de postre?", en: "Perfect. Would you like some dessert?" },
      { text: "¡Buena elección! ¿Algo más?", en: "Excellent choice! Anything else?" },
      { text: "Son doce euros. ¿Pagas con tarjeta o en efectivo?", en: "It's twelve euros. Are you paying by card or cash?" },
      { text: "¡Gracias! ¡Que vaya bien!", en: "Thanks! Have a nice day!" },
    ],
  },
  {
    language: "es",
    id: "airport",
    title: "At the airport",
    emoji: "✈️",
    character: "Javier",
    role: "an airline check-in agent in Mexico City",
    goal: "Check in for your flight and find your gate",
    opening: { text: "Buenos días. ¿Adónde viaja hoy?", en: "Good morning. Where are you traveling today?" },
    turns: [
      { text: "Muy bien. ¿Me da su pasaporte, por favor?", en: "Very good. Can you give me your passport, please?" },
      { text: "Gracias. ¿Tiene maletas para facturar?", en: "Thank you. Do you have bags to check?" },
      { text: "Perfecto. ¿Prefiere ventana o pasillo?", en: "Perfect. Do you prefer window or aisle?" },
      { text: "Su puerta es la doce. El vuelo sale a las tres.", en: "Your gate is twelve. The flight leaves at three." },
      { text: "¡Buen viaje!", en: "Have a good trip!" },
    ],
  },
  {
    language: "es",
    id: "market",
    title: "Shopping at the market",
    emoji: "🛒",
    character: "Don Pedro",
    role: "a cheerful fruit seller at a market in Seville",
    goal: "Buy some fruit and ask about prices",
    opening: { text: "¡Buenas! Hoy tengo unas naranjas dulcísimas. ¿Qué te pongo?", en: "Hello! Today I have very sweet oranges. What do you need?" },
    turns: [
      { text: "¿Cuántas quieres?", en: "How many do you want?" },
      { text: "Vale. ¿Algo más? Las manzanas también están buenísimas.", en: "Very good. Anything else? The apples are good too." },
      { text: "Pues son cinco euros.", en: "That's five euros in total." },
      { text: "¡Gracias! ¡Hasta la próxima!", en: "Thanks! Until next time!" },
    ],
  },
  {
    language: "es",
    id: "date",
    title: "Coffee date",
    emoji: "☕",
    character: "Sofía",
    role: "a fun, curious person you're meeting for coffee in Buenos Aires",
    goal: "Introduce yourself and talk about hobbies",
    opening: { text: "¡Hola! Encantada. ¿Cómo te llamas?", en: "Hi! Nice to meet you. What's your name?" },
    turns: [
      { text: "¡Qué bonito nombre! ¿De dónde eres?", en: "What a nice name! Where are you from?" },
      { text: "¡Anda, qué guay! ¿Y qué te gusta hacer en tu tiempo libre?", en: "How interesting! What do you like to do in your free time?" },
      { text: "A mí me encantan la música y viajar. ¿Tú viajas mucho?", en: "I really like music and traveling. Do you like to travel?" },
      { text: "¡Qué bien me lo estoy pasando! ¿Nos tomamos otro café?", en: "I love talking with you! Shall we have another coffee?" },
    ],
  },
  {
    language: "es",
    id: "interview",
    title: "Job interview",
    emoji: "💼",
    character: "Sra. Morales",
    role: "a hiring manager interviewing you for a job at a travel company",
    goal: "Describe yourself, your experience and your strengths",
    opening: { text: "Buenas tardes. Gracias por venir. ¿Puede presentarse?", en: "Good afternoon. Thanks for coming. Can you introduce yourself?" },
    turns: [
      { text: "Muy bien. ¿Por qué quiere trabajar con nosotros?", en: "Very good. Why do you want to work with us?" },
      { text: "¿Cuál es su experiencia?", en: "What is your experience?" },
      { text: "¿Cuál es su mayor fortaleza?", en: "What is your greatest strength?" },
      { text: "Excelente. Le llamaremos pronto. ¡Muchas gracias!", en: "Excellent. We'll call you soon. Thank you very much!" },
    ],
  },
  {
    language: "es",
    id: "hotel",
    title: "Hotel check-in",
    emoji: "🏨",
    character: "Andrés",
    role: "a hotel receptionist in Barcelona",
    goal: "Check in, ask about breakfast and the Wi‑Fi",
    opening: { text: "¡Bienvenido al hotel! ¿Tiene una reserva?", en: "Welcome to the hotel! Do you have a reservation?" },
    turns: [
      { text: "Perfecto. ¿Cuántas noches va a quedarse?", en: "Perfect. How many nights are you staying?" },
      { text: "Su habitación es la doscientos cinco. El desayuno es a las ocho.", en: "Your room is two hundred and five. Breakfast is at eight." },
      { text: "La contraseña del wifi está en la tarjeta. ¿Necesita algo más?", en: "The Wi‑Fi password is on the card. Do you need anything else?" },
      { text: "¡Disfrute su estancia!", en: "Enjoy your stay!" },
    ],
  },
];

export const SCENARIOS: Scenario[] = [...SCENARIOS_ES, ...SCENARIOS_JA_TARGET];

export function scenariosFor(lang: TargetLang) {
  return SCENARIOS.filter((s) => s.language === lang);
}

export function getScenario(id: string) {
  return SCENARIOS.find((s) => s.id === id);
}

/** What the browser sees: title/goal in the learner's language, no offline-engine turns. */
export function publicScenario(s: Scenario, locale: Locale) {
  const t = makeT(locale);
  return { id: s.id, title: t(s.title), emoji: s.emoji, character: s.character, goal: t(s.goal) };
}

/** Translation of a fixed scenario line into the learner's language. */
export function lineTranslation(line: { en: string }, locale: Locale) {
  return locale === "ja" ? contentJa(line.en) ?? line.en : line.en;
}
