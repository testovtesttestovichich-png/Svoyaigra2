
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERIC_AI_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export type Question = {
  text: string;
  answer: string;
  value: number;
};

export type Category = {
  title: string;
  questions: Question[];
};

export type Round = {
  name: string;
  type?: 'normal' | 'final';
  categories: Category[];
};

export type GameData = {
  rounds: Round[];
};

const SYSTEM_INSTRUCTION = `
Ты — профессиональный составитель викторин для игры "Своя Игра" (Jeopardy). 
Твоя задача — генерировать интересные, разнообразные вопросы.

СТРОГАЯ СТРУКТУРА:
1. Раунд 1: СТРОГО 5 категорий. В каждой категории СТРОГО 5 вопросов (цены: 100, 200, 300, 400, 500).
2. Раунд 2: СТРОГО 5 категорий. В каждой категории СТРОГО 5 вопросов (цены: 200, 400, 600, 800, 1000).
3. Раунд 3: СТРОГО 5 категорий. В каждой категории СТРОГО 5 вопросов (цены: 300, 600, 900, 1200, 1500).
4. Финал: 1 категория, 1 вопрос (цену сделай 0).

ВСЕГО: (5x5) + (5x5) + (5x5) + 1 = 76 вопросов. Не пропускай вопросы!

Формат вывода строго JSON (без Markdown):
{
  "rounds": [
    { 
      "name": "Раунд 1", 
      "categories": [ 
         // ... 5 категорий ...
      ] 
    },
    { 
      "name": "Раунд 2", 
      "categories": [ 
         // ... 5 категорий ...
      ] 
    },
    { 
      "name": "Раунд 3", 
      "categories": [ 
         // ... 5 категорий ...
      ] 
    },
    { 
      "name": "Финал", 
      "type": "final",
      "categories": [ 
        { "title": "...", "questions": [{ "text": "...", "answer": "...", "value": 0 }] } 
      ] 
    }
  ]
}
`;

export async function generateGame(prompt: string = "Сгенерируй игру на общие темы"): Promise<GameData> {
  if (!apiKey) {
    throw new Error("GOOGLE_GENERIC_AI_KEY is not set");
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    systemInstruction: SYSTEM_INSTRUCTION
  });

  const result = await model.generateContent(prompt + " (Сгенерируй ПОЛНУЮ игру, все 76 вопросов)");
  const response = await result.response;

  let text = response.text();

  // Clean up markdown code blocks if present
  if (text.startsWith("```json")) {
    text = text.replace(/^```json/, "").replace(/```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```/, "").replace(/```$/, "");
  }

  try {
    const data = JSON.parse(text) as GameData;
    return data;
  } catch (error) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Failed to parse game data");
  }
}
