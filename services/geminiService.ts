
import { GoogleGenAI } from "@google/genai";

// Initialize API client only if key exists to avoid runtime crash on init
const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateGameReward = async (): Promise<string> => {
  if (!ai) {
    // Fallback if no API key is present
    return "Intelligence is the ability to adapt to change. - Stephen Hawking";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Generate a short, profound, and inspiring insight about the future of Artificial Intelligence and Human potential. Maximum 20 words. Do not use quotes.",
      config: {
        maxOutputTokens: 50,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      }
    });

    return response.text || "The future belongs to those who prepare for it today.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Innovation distinguishes between a leader and a follower.";
  }
};
