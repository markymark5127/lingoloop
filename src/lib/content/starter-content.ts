import type { StoryScript, VideoScript } from "./schemas";

export interface StarterStory extends StoryScript {
  cefr: string;
  series: string;
  series_order: number;
}
export interface StarterVideo extends VideoScript {
  cefr: string;
}

export const STARTER_STORIES: StarterStory[] = [
  {
    title: "El misterio del café",
    series: "El misterio del café",
    series_order: 1,
    cefr: "A1",
    genre: "mystery",
    summary: "Every morning someone leaves a mysterious letter at Clara's café.",
    body: {
      characters: ["Clara", "Tomás", "Luna (la gata)"],
      chapters: [
        {
          title: "Una carta en la mesa",
          paragraphs: [
            { es: "Clara tiene un café pequeño en Madrid. Cada mañana abre la puerta a las siete.", en: "Clara has a small café in Madrid. Every morning she opens the door at seven." },
            { es: "Hoy, en una mesa, hay una carta. La carta dice: «Busca la llave roja».", en: "Today, on a table, there is a letter. The letter says: \"Look for the red key.\"" },
            { es: "Clara mira a su gata, Luna. Luna mira la puerta de la cocina.", en: "Clara looks at her cat, Luna. Luna looks at the kitchen door." },
            { es: "«¿Dónde está la llave?», pregunta Clara. Luna no habla, pero corre a la cocina.", en: "\"Where is the key?\" asks Clara. Luna doesn't talk, but she runs to the kitchen." },
          ],
          questions: [
            { q: "Where is Clara's café?", options: ["In Madrid", "In Seville", "In Mexico City"], answer: 0 },
            { q: "What does the letter say?", options: ["Open the door", "Look for the red key", "Drink coffee"], answer: 1 },
          ],
        },
        {
          title: "La cocina",
          paragraphs: [
            { es: "En la cocina hay pan, queso y un pastel grande. No hay llave.", en: "In the kitchen there is bread, cheese and a big cake. There is no key." },
            { es: "Entonces llega Tomás, su amigo. «Hola, Clara. ¿Qué buscas?»", en: "Then Tomás, her friend, arrives. \"Hi, Clara. What are you looking for?\"" },
            { es: "«Busco una llave roja», dice Clara. Tomás mira el pastel. «¿Y esto?»", en: "\"I'm looking for a red key,\" says Clara. Tomás looks at the cake. \"And this?\"" },
            { es: "Dentro del pastel hay una llave roja. ¡Y otra carta!", en: "Inside the cake there is a red key. And another letter!" },
          ],
          questions: [
            { q: "Who arrives at the café?", options: ["Luna", "Tomás", "A detective"], answer: 1 },
            { q: "Where is the red key?", options: ["Under the table", "In the cake", "In the cat's bed"], answer: 1 },
          ],
        },
      ],
    },
  },
  {
    title: "La segunda carta",
    series: "El misterio del café",
    series_order: 2,
    cefr: "A1",
    genre: "mystery",
    summary: "The red key opens something unexpected — and a new clue points to the market.",
    body: {
      characters: ["Clara", "Tomás", "Luna (la gata)"],
      chapters: [
        {
          title: "Al mercado",
          paragraphs: [
            { es: "La segunda carta dice: «Ve al mercado. Compra tres naranjas».", en: "The second letter says: \"Go to the market. Buy three oranges.\"" },
            { es: "Clara y Tomás van al mercado. Hace sol y hay mucha gente.", en: "Clara and Tomás go to the market. It's sunny and there are a lot of people." },
            { es: "Un hombre con un sombrero grande vende fruta. «Tres naranjas, por favor», dice Clara.", en: "A man with a big hat sells fruit. \"Three oranges, please,\" says Clara." },
            { es: "El hombre sonríe. «Tú eres Clara, ¿verdad? Tengo algo para ti.»", en: "The man smiles. \"You're Clara, right? I have something for you.\"" },
          ],
          questions: [
            { q: "What must Clara buy?", options: ["Three apples", "Three oranges", "Bread"], answer: 1 },
            { q: "What does the man know?", options: ["Clara's name", "Where the key is", "Tomás's address"], answer: 0 },
          ],
        },
      ],
    },
  },
  {
    title: "Robi en Marte",
    series: "Robi en Marte",
    series_order: 1,
    cefr: "A1",
    genre: "sci-fi",
    summary: "A lonely robot on Mars tries to make a friend.",
    body: {
      characters: ["Robi", "Estrella"],
      chapters: [
        {
          title: "Un robot solo",
          paragraphs: [
            { es: "Robi es un robot pequeño. Vive en Marte. Marte es rojo y muy grande.", en: "Robi is a small robot. He lives on Mars. Mars is red and very big." },
            { es: "Cada día Robi busca agua. Cada noche mira las estrellas.", en: "Every day Robi looks for water. Every night he looks at the stars." },
            { es: "Robi no tiene amigos. «Necesito un amigo», dice Robi.", en: "Robi doesn't have friends. \"I need a friend,\" says Robi." },
            { es: "Una noche, una luz azul baja del cielo. ¿Qué es?", en: "One night, a blue light comes down from the sky. What is it?" },
          ],
          questions: [
            { q: "What does Robi look for every day?", options: ["Water", "Food", "A key"], answer: 0 },
            { q: "What color is the light?", options: ["Red", "Blue", "Green"], answer: 1 },
          ],
        },
      ],
    },
  },
  {
    title: "Un verano en Valencia",
    series: "Un verano en Valencia",
    series_order: 1,
    cefr: "A2",
    genre: "travel",
    summary: "Sam spends a summer in Valencia and keeps bumping into the same person.",
    body: {
      characters: ["Sam", "Elena"],
      chapters: [
        {
          title: "La playa",
          paragraphs: [
            { es: "Sam llega a Valencia en tren. Tiene una maleta azul y mucho calor.", en: "Sam arrives in Valencia by train. He has a blue suitcase and he's very hot." },
            { es: "Primero va a la playa. Compra un helado y mira el mar.", en: "First he goes to the beach. He buys an ice cream and looks at the sea." },
            { es: "Una chica corre detrás de un perro. ¡El perro tiene su sombrero!", en: "A girl runs after a dog. The dog has her hat!" },
            { es: "Sam ayuda a la chica. «Gracias. Me llamo Elena», dice ella. «¿Eres turista?»", en: "Sam helps the girl. \"Thanks. My name is Elena,\" she says. \"Are you a tourist?\"" },
          ],
          questions: [
            { q: "How does Sam arrive in Valencia?", options: ["By plane", "By train", "By car"], answer: 1 },
            { q: "What does the dog have?", options: ["Elena's hat", "Sam's suitcase", "An ice cream"], answer: 0 },
          ],
        },
      ],
    },
  },
];

export const STARTER_VIDEOS: StarterVideo[] = [
  {
    title: "El gato chef",
    genre: "comedy",
    cefr: "A1",
    summary: "A cat tries to cook breakfast. It does not go well.",
    body: {
      scenes: [
        { text: "Este es Michi. Michi es un gato chef.", translation: "This is Michi. Michi is a chef cat.", emoji: "🐱👨‍🍳", bg: "candy" },
        { text: "Hoy Michi quiere hacer un pastel.", translation: "Today Michi wants to make a cake.", emoji: "🎂", bg: "sunset" },
        { text: "Necesita huevos, leche y queso.", translation: "He needs eggs, milk and cheese.", emoji: "🥚🥛🧀", bg: "candy" },
        { text: "¿Queso? ¡Un pastel con queso no es normal!", translation: "Cheese? A cake with cheese isn't normal!", emoji: "😹", bg: "sunset" },
        { text: "Al final, Michi come el queso y duerme.", translation: "In the end, Michi eats the cheese and sleeps.", emoji: "🐱💤", bg: "night" },
      ],
      questions: [
        { q: "What does Michi want to make?", options: ["A pizza", "A cake", "A salad"], answer: 1 },
        { q: "What does Michi do at the end?", options: ["Eats the cheese and sleeps", "Sells the cake", "Goes to the market"], answer: 0 },
      ],
    },
  },
  {
    title: "¿Dónde está mi llave?",
    genre: "mystery",
    cefr: "A1",
    summary: "A detective searches the house for a missing key.",
    body: {
      scenes: [
        { text: "Son las ocho. No encuentro la llave.", translation: "It's eight o'clock. I can't find the key.", emoji: "🔑❓", bg: "night" },
        { text: "¿Está en la mesa? No.", translation: "Is it on the table? No.", emoji: "🪑", bg: "city" },
        { text: "¿Está en la cama? No.", translation: "Is it in the bed? No.", emoji: "🛏️", bg: "night" },
        { text: "El perro me mira. El perro está muy feliz.", translation: "The dog looks at me. The dog is very happy.", emoji: "🐶😁", bg: "sunset" },
        { text: "¡El perro tiene la llave en la boca!", translation: "The dog has the key in its mouth!", emoji: "🐶🔑", bg: "candy" },
      ],
      questions: [
        { q: "What is missing?", options: ["The phone", "The key", "The dog"], answer: 1 },
        { q: "Who has it?", options: ["The cat", "The dog", "Nobody"], answer: 1 },
      ],
    },
  },
  {
    title: "Robi encuentra agua",
    genre: "sci-fi",
    cefr: "A1",
    summary: "A small robot on Mars makes a big discovery.",
    body: {
      scenes: [
        { text: "Hola. Soy Robi. Vivo en Marte.", translation: "Hello. I'm Robi. I live on Mars.", emoji: "🤖🪐", bg: "space" },
        { text: "Marte es rojo. No hay agua.", translation: "Mars is red. There is no water.", emoji: "🏜️", bg: "desert" },
        { text: "Busco agua cada día.", translation: "I look for water every day.", emoji: "🔎💧", bg: "desert" },
        { text: "¡Hoy encuentro agua azul!", translation: "Today I find blue water!", emoji: "💧✨", bg: "ocean" },
        { text: "Y en el agua... ¡un pez!", translation: "And in the water... a fish!", emoji: "🐟😮", bg: "space" },
      ],
      questions: [
        { q: "Where does Robi live?", options: ["On the Moon", "On Mars", "In the ocean"], answer: 1 },
        { q: "What is in the water?", options: ["A fish", "A cat", "A key"], answer: 0 },
      ],
    },
  },
  {
    title: "Mi día en el mercado",
    genre: "food",
    cefr: "A1",
    summary: "A quick trip to a Spanish market to buy fruit.",
    body: {
      scenes: [
        { text: "Hoy voy al mercado.", translation: "Today I'm going to the market.", emoji: "🛒", bg: "sunset" },
        { text: "Compro tres naranjas y dos manzanas.", translation: "I buy three oranges and two apples.", emoji: "🍊🍎", bg: "candy" },
        { text: "Las fresas son muy grandes.", translation: "The strawberries are very big.", emoji: "🍓", bg: "candy" },
        { text: "El señor dice: «Son cinco euros».", translation: "The man says: \"That's five euros.\"", emoji: "👨‍🌾💶", bg: "city" },
        { text: "¡Oh no! No tengo dinero.", translation: "Oh no! I don't have money.", emoji: "😱", bg: "night" },
      ],
      questions: [
        { q: "How many oranges does the speaker buy?", options: ["Two", "Three", "Five"], answer: 1 },
        { q: "What's the problem at the end?", options: ["No money", "No fruit", "The market is closed"], answer: 0 },
      ],
    },
  },
  {
    title: "Un viaje en tren",
    genre: "travel",
    cefr: "A1",
    summary: "A train ride to the beach with an unexpected passenger.",
    body: {
      scenes: [
        { text: "Tomo el tren a la playa.", translation: "I take the train to the beach.", emoji: "🚆🏖️", bg: "ocean" },
        { text: "Tengo mi maleta y mi libro.", translation: "I have my suitcase and my book.", emoji: "🧳📖", bg: "sunset" },
        { text: "Un caballo entra en el tren.", translation: "A horse gets on the train.", emoji: "🐴", bg: "forest" },
        { text: "El caballo quiere mi manzana.", translation: "The horse wants my apple.", emoji: "🐴🍎", bg: "candy" },
        { text: "¡Ahora el caballo es mi amigo!", translation: "Now the horse is my friend!", emoji: "🐴❤️", bg: "sunset" },
      ],
      questions: [
        { q: "Where is the train going?", options: ["To the beach", "To the market", "To Mars"], answer: 0 },
        { q: "What does the horse want?", options: ["The book", "The apple", "The suitcase"], answer: 1 },
      ],
    },
  },
  {
    title: "El fantasma de la cocina",
    genre: "mystery",
    cefr: "A2",
    summary: "Strange noises in the kitchen at night. Is it a ghost?",
    body: {
      scenes: [
        { text: "Es de noche. Hay un ruido en la cocina.", translation: "It's night. There's a noise in the kitchen.", emoji: "🌃🔊", bg: "night" },
        { text: "¿Es un fantasma? Tengo mucho miedo.", translation: "Is it a ghost? I'm very scared.", emoji: "👻😨", bg: "night" },
        { text: "Abro la puerta muy despacio.", translation: "I open the door very slowly.", emoji: "🚪", bg: "night" },
        { text: "Veo una sombra pequeña cerca del pan.", translation: "I see a small shadow near the bread.", emoji: "🍞👀", bg: "city" },
        { text: "No es un fantasma. ¡Es un ratón con queso!", translation: "It's not a ghost. It's a mouse with cheese!", emoji: "🐭🧀", bg: "candy" },
      ],
      questions: [
        { q: "Where is the noise?", options: ["In the kitchen", "In the bedroom", "Outside"], answer: 0 },
        { q: "What makes the noise?", options: ["A ghost", "A mouse", "A dog"], answer: 1 },
      ],
    },
  },
];
