export interface Scenario {
  id: string;
  title: string;
  emoji: string;
  character: string;
  role: string;
  goal: string;
  opening: { es: string; en: string };
  /** Offline-engine follow-up prompts, asked in order. */
  turns: { es: string; en: string }[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "restaurant",
    title: "At a restaurant",
    emoji: "🍽️",
    character: "Lucía",
    role: "a friendly waiter at a small café in Madrid",
    goal: "Order food and a drink, then ask for the bill",
    opening: { es: "¡Hola! Bienvenido. ¿Qué quieres comer hoy?", en: "Hi! Welcome. What do you want to eat today?" },
    turns: [
      { es: "Muy bien. ¿Y para beber? Tenemos agua, café y zumo de naranja.", en: "Very good. And to drink? We have water, coffee and orange juice." },
      { es: "Perfecto. ¿Quieres algo de postre?", en: "Perfect. Would you like some dessert?" },
      { es: "¡Excelente elección! ¿Algo más?", en: "Excellent choice! Anything else?" },
      { es: "Son doce euros. ¿Pagas con tarjeta o en efectivo?", en: "It's twelve euros. Are you paying by card or cash?" },
      { es: "¡Gracias! ¡Que tengas un buen día!", en: "Thanks! Have a nice day!" },
    ],
  },
  {
    id: "airport",
    title: "At the airport",
    emoji: "✈️",
    character: "Javier",
    role: "an airline check-in agent in Mexico City",
    goal: "Check in for your flight and find your gate",
    opening: { es: "Buenos días. ¿Adónde viaja hoy?", en: "Good morning. Where are you traveling today?" },
    turns: [
      { es: "Muy bien. ¿Me da su pasaporte, por favor?", en: "Very good. Can you give me your passport, please?" },
      { es: "Gracias. ¿Tiene maletas para facturar?", en: "Thank you. Do you have bags to check?" },
      { es: "Perfecto. ¿Prefiere ventana o pasillo?", en: "Perfect. Do you prefer window or aisle?" },
      { es: "Su puerta es la doce. El vuelo sale a las tres.", en: "Your gate is twelve. The flight leaves at three." },
      { es: "¡Buen viaje!", en: "Have a good trip!" },
    ],
  },
  {
    id: "market",
    title: "Shopping at the market",
    emoji: "🛒",
    character: "Don Pedro",
    role: "a cheerful fruit seller at a market in Seville",
    goal: "Buy some fruit and ask about prices",
    opening: { es: "¡Buenas! Hoy tengo naranjas muy dulces. ¿Qué necesitas?", en: "Hello! Today I have very sweet oranges. What do you need?" },
    turns: [
      { es: "¿Cuántas quieres?", en: "How many do you want?" },
      { es: "Muy bien. ¿Algo más? Las manzanas también están buenas.", en: "Very good. Anything else? The apples are good too." },
      { es: "Son cinco euros en total.", en: "That's five euros in total." },
      { es: "¡Gracias! ¡Hasta la próxima!", en: "Thanks! Until next time!" },
    ],
  },
  {
    id: "date",
    title: "Coffee date",
    emoji: "☕",
    character: "Sofía",
    role: "a fun, curious person you're meeting for coffee in Buenos Aires",
    goal: "Introduce yourself and talk about hobbies",
    opening: { es: "¡Hola! Encantada. ¿Cómo te llamas?", en: "Hi! Nice to meet you. What's your name?" },
    turns: [
      { es: "¡Qué bonito nombre! ¿De dónde eres?", en: "What a nice name! Where are you from?" },
      { es: "¡Qué interesante! ¿Qué te gusta hacer en tu tiempo libre?", en: "How interesting! What do you like to do in your free time?" },
      { es: "A mí me gusta mucho la música y viajar. ¿Te gusta viajar?", en: "I really like music and traveling. Do you like to travel?" },
      { es: "¡Me encanta hablar contigo! ¿Tomamos otro café?", en: "I love talking with you! Shall we have another coffee?" },
    ],
  },
  {
    id: "interview",
    title: "Job interview",
    emoji: "💼",
    character: "Sra. Morales",
    role: "a hiring manager interviewing you for a job at a travel company",
    goal: "Describe yourself, your experience and your strengths",
    opening: { es: "Buenas tardes. Gracias por venir. ¿Puede presentarse?", en: "Good afternoon. Thanks for coming. Can you introduce yourself?" },
    turns: [
      { es: "Muy bien. ¿Por qué quiere trabajar con nosotros?", en: "Very good. Why do you want to work with us?" },
      { es: "¿Cuál es su experiencia?", en: "What is your experience?" },
      { es: "¿Cuál es su mayor fortaleza?", en: "What is your greatest strength?" },
      { es: "Excelente. Le llamaremos pronto. ¡Muchas gracias!", en: "Excellent. We'll call you soon. Thank you very much!" },
    ],
  },
  {
    id: "hotel",
    title: "Hotel check-in",
    emoji: "🏨",
    character: "Andrés",
    role: "a hotel receptionist in Barcelona",
    goal: "Check in, ask about breakfast and the Wi‑Fi",
    opening: { es: "¡Bienvenido al hotel! ¿Tiene una reserva?", en: "Welcome to the hotel! Do you have a reservation?" },
    turns: [
      { es: "Perfecto. ¿Cuántas noches se queda?", en: "Perfect. How many nights are you staying?" },
      { es: "Su habitación es la doscientos cinco. El desayuno es a las ocho.", en: "Your room is two hundred and five. Breakfast is at eight." },
      { es: "La contraseña del wifi está en la tarjeta. ¿Necesita algo más?", en: "The Wi‑Fi password is on the card. Do you need anything else?" },
      { es: "¡Disfrute su estancia!", en: "Enjoy your stay!" },
    ],
  },
];

export function getScenario(id: string) {
  return SCENARIOS.find((s) => s.id === id);
}
