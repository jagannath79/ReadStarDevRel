import { Sentence } from '@/db/indexeddb';
import { v4 as uuidv4 } from 'uuid';

export const INITIAL_SENTENCES: Omit<Sentence, 'id' | 'createdAt'>[] = [
  // ─── SIMPLE (Grade 3–4) ───────────────────────────────────────────────────
  { text: "The cat sat on the warm mat.", difficulty: 'simple', topic: 'animals', gradeTarget: 3, wordCount: 7 },
  { text: "My dog loves to run and play.", difficulty: 'simple', topic: 'animals', gradeTarget: 3, wordCount: 7 },
  { text: "The sun is bright and warm today.", difficulty: 'simple', topic: 'weather', gradeTarget: 3, wordCount: 7 },
  { text: "She went to school with her friend.", difficulty: 'simple', topic: 'school', gradeTarget: 3, wordCount: 7 },
  { text: "Birds fly high up in the sky.", difficulty: 'simple', topic: 'animals', gradeTarget: 3, wordCount: 8 },
  { text: "We eat lunch at the big table.", difficulty: 'simple', topic: 'family', gradeTarget: 3, wordCount: 8 },
  { text: "The rain falls softly on the leaves.", difficulty: 'simple', topic: 'weather', gradeTarget: 3, wordCount: 7 },
  { text: "He reads a book every single night.", difficulty: 'simple', topic: 'school', gradeTarget: 3, wordCount: 7 },
  { text: "The little fish swam in the pond.", difficulty: 'simple', topic: 'animals', gradeTarget: 3, wordCount: 8 },
  { text: "Mom made a big cake for us.", difficulty: 'simple', topic: 'family', gradeTarget: 3, wordCount: 8 },
  { text: "The wind blew leaves across the yard.", difficulty: 'simple', topic: 'weather', gradeTarget: 3, wordCount: 7 },
  { text: "We play games after our school day.", difficulty: 'simple', topic: 'school', gradeTarget: 3, wordCount: 8 },
  { text: "The puppy jumped over the small fence.", difficulty: 'simple', topic: 'animals', gradeTarget: 4, wordCount: 7 },
  { text: "My sister helped me tie my shoes.", difficulty: 'simple', topic: 'family', gradeTarget: 3, wordCount: 8 },
  { text: "The stars shine bright on clear nights.", difficulty: 'simple', topic: 'weather', gradeTarget: 4, wordCount: 8 },
  { text: "We grew flowers in our garden today.", difficulty: 'simple', topic: 'family', gradeTarget: 3, wordCount: 8 },
  { text: "The horse ran fast across the field.", difficulty: 'simple', topic: 'animals', gradeTarget: 3, wordCount: 8 },
  { text: "Our teacher reads stories to the class.", difficulty: 'simple', topic: 'school', gradeTarget: 3, wordCount: 8 },
  { text: "The snow made everything soft and white.", difficulty: 'simple', topic: 'weather', gradeTarget: 4, wordCount: 8 },
  { text: "Dad cooked soup for dinner last night.", difficulty: 'simple', topic: 'family', gradeTarget: 3, wordCount: 8 },

  // ─── MEDIUM (Grade 4–5) ───────────────────────────────────────────────────
  { text: "The butterfly collects nectar from colorful flowers in the sunny garden.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 12 },
  { text: "Elephants are the largest land animals and they live in family groups.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 13 },
  { text: "The Amazon River flows through the rainforest and empties into the ocean.", difficulty: 'medium', topic: 'geography', gradeTarget: 4, wordCount: 13 },
  { text: "Maria found a beautiful shell on the beach and brought it home to show her family.", difficulty: 'medium', topic: 'stories', gradeTarget: 4, wordCount: 16 },
  { text: "Scientists study rocks and minerals to learn about the history of our planet.", difficulty: 'medium', topic: 'science', gradeTarget: 5, wordCount: 14 },
  { text: "The library has thousands of books about history, science, and many other topics.", difficulty: 'medium', topic: 'school', gradeTarget: 4, wordCount: 14 },
  { text: "Rainbows appear in the sky when sunlight passes through raindrops in the air.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 14 },
  { text: "Jake practiced playing piano every evening until his fingers moved without thinking.", difficulty: 'medium', topic: 'stories', gradeTarget: 5, wordCount: 13 },
  { text: "The volcano erupted and sent hot lava flowing slowly down the mountainside.", difficulty: 'medium', topic: 'science', gradeTarget: 5, wordCount: 13 },
  { text: "In autumn, the leaves change from green to brilliant shades of red and orange.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 15 },
  { text: "The ancient Egyptians built enormous pyramids as tombs for their powerful kings.", difficulty: 'medium', topic: 'history', gradeTarget: 5, wordCount: 13 },
  { text: "Dolphins communicate with each other using a series of clicks and whistles.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 13 },
  { text: "Sara and her brother planned a surprise birthday party for their mother.", difficulty: 'medium', topic: 'stories', gradeTarget: 4, wordCount: 13 },
  { text: "The planet Mars is known as the red planet because of its dusty surface.", difficulty: 'medium', topic: 'science', gradeTarget: 5, wordCount: 15 },
  { text: "Every winter, many birds migrate to warmer places to find food and shelter.", difficulty: 'medium', topic: 'science', gradeTarget: 4, wordCount: 14 },
  { text: "The school garden project taught students how to grow fresh vegetables themselves.", difficulty: 'medium', topic: 'school', gradeTarget: 4, wordCount: 13 },
  { text: "Bridges are built using strong metals and concrete to carry heavy traffic safely.", difficulty: 'medium', topic: 'science', gradeTarget: 5, wordCount: 14 },
  { text: "Lena read every book in the series and could not wait for the next one.", difficulty: 'medium', topic: 'stories', gradeTarget: 4, wordCount: 16 },
  { text: "The Great Wall of China stretches for thousands of miles across the country.", difficulty: 'medium', topic: 'geography', gradeTarget: 5, wordCount: 14 },
  { text: "Photosynthesis is the process plants use to make food from sunlight and water.", difficulty: 'medium', topic: 'science', gradeTarget: 5, wordCount: 14 },

  // ─── COMPLEX (Grade 5+) ───────────────────────────────────────────────────
  { text: "Although scientists have explored much of the ocean's surface, the deepest parts remain mysterious and full of undiscovered creatures.", difficulty: 'complex', topic: 'science', gradeTarget: 5, wordCount: 22 },
  { text: "The Industrial Revolution, which began in England during the eighteenth century, transformed the way people lived and worked forever.", difficulty: 'complex', topic: 'history', gradeTarget: 6, wordCount: 21 },
  { text: "When the astronauts landed on the moon in 1969, it was considered one of the greatest achievements in all of human history.", difficulty: 'complex', topic: 'history', gradeTarget: 5, wordCount: 24 },
  { text: "Because ecosystems are delicately balanced, the removal of even one species can trigger a cascade of changes throughout the entire food chain.", difficulty: 'complex', topic: 'nature', gradeTarget: 6, wordCount: 25 },
  { text: "Modern computers process billions of calculations every second, making it possible for people to communicate instantly across opposite ends of the earth.", difficulty: 'complex', topic: 'technology', gradeTarget: 6, wordCount: 24 },
  { text: "Shakespeare, who lived in England during the sixteenth century, wrote plays and poems that are still performed and studied around the world today.", difficulty: 'complex', topic: 'literature', gradeTarget: 6, wordCount: 26 },
  { text: "As the drought continued for a third consecutive year, farmers across the region were forced to abandon their fields and search for new ways to survive.", difficulty: 'complex', topic: 'nature', gradeTarget: 6, wordCount: 28 },
  { text: "The human brain, which contains approximately one hundred billion neurons, is capable of storing more information than the largest computers ever built.", difficulty: 'complex', topic: 'science', gradeTarget: 6, wordCount: 24 },
  { text: "Despite the enormous challenges they faced, the explorers pressed on through the frozen wilderness, determined to reach their destination before winter arrived.", difficulty: 'complex', topic: 'history', gradeTarget: 5, wordCount: 26 },
  { text: "Climate change, caused largely by human activities such as burning fossil fuels, is altering weather patterns and raising sea levels around the globe.", difficulty: 'complex', topic: 'nature', gradeTarget: 6, wordCount: 26 },
  { text: "The invention of the printing press in the fifteenth century made it possible to share ideas widely, which eventually led to major changes in society.", difficulty: 'complex', topic: 'history', gradeTarget: 6, wordCount: 28 },
  { text: "By analyzing ancient ice cores drilled from glaciers, scientists can reconstruct the climate of Earth going back hundreds of thousands of years.", difficulty: 'complex', topic: 'science', gradeTarget: 6, wordCount: 24 },
  { text: "Although artificial intelligence has made remarkable progress in recent years, machines still struggle to understand human emotions and creative thinking.", difficulty: 'complex', topic: 'technology', gradeTarget: 6, wordCount: 23 },
  { text: "The coral reefs, often called the rainforests of the sea, support a quarter of all marine species and are now under serious threat from warming waters.", difficulty: 'complex', topic: 'nature', gradeTarget: 5, wordCount: 29 },
  { text: "Throughout history, great civilizations have risen and fallen, leaving behind monuments, writings, and ideas that continue to shape the modern world.", difficulty: 'complex', topic: 'history', gradeTarget: 6, wordCount: 25 },
  { text: "When she finally reached the summit after three days of difficult climbing, the view of the mountains stretching endlessly before her took her breath away.", difficulty: 'complex', topic: 'literature', gradeTarget: 5, wordCount: 28 },
  { text: "The discovery of penicillin by Alexander Fleming in 1928 revolutionized medicine and saved countless millions of lives over the following century.", difficulty: 'complex', topic: 'history', gradeTarget: 6, wordCount: 23 },
  { text: "Because languages evolve constantly over time, words that were common a hundred years ago may sound strange or confusing to people living today.", difficulty: 'complex', topic: 'literature', gradeTarget: 6, wordCount: 26 },
  { text: "The deep ocean trenches, some of which plunge more than thirty thousand feet below the surface, remain among the least explored environments on Earth.", difficulty: 'complex', topic: 'nature', gradeTarget: 6, wordCount: 27 },
  { text: "Through years of careful observation and experimentation, Marie Curie became the first person to win the Nobel Prize in two different scientific fields.", difficulty: 'complex', topic: 'history', gradeTarget: 6, wordCount: 26 },
];

export function buildSentencesForDB(): Sentence[] {
  return INITIAL_SENTENCES.map(s => ({
    ...s,
    id: uuidv4(),
    createdAt: Date.now(),
  }));
}
