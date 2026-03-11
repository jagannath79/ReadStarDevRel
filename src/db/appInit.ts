import { getDB, createUser, getSentenceCount, addSentence, userExists } from './indexeddb';
import { buildSentencesForDB } from '@/data/sentenceBank';
import { v4 as uuidv4 } from 'uuid';

let initialized = false;

export async function initializeApp(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    // Ensure DB is open
    await getDB();

    // Create default teacher account if no users exist
    const hasUsers = await userExists();
    if (!hasUsers) {
      await createUser({
        id: uuidv4(),
        username: 'teacher',
        email: 'teacher@readstar.edu',
        password: 'ReadStar2024',
        role: 'teacher',
        firstName: 'Default',
        lastName: 'Teacher',
        createdAt: Date.now(),
        lastActive: Date.now(),
        language: 'en-US',
      });
    }

    // Populate sentence bank if empty
    const sentenceCount = await getSentenceCount();
    if (sentenceCount === 0) {
      const sentences = buildSentencesForDB();
      for (const sentence of sentences) {
        await addSentence(sentence);
      }
    }
  } catch (err) {
    console.error('App initialization failed:', err);
  }
}
