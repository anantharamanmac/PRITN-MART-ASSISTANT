import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { feedbacks } = await req.json();

    if (!feedbacks || !Array.isArray(feedbacks) || feedbacks.length === 0) {
      return NextResponse.json(
        { error: 'A non-empty list of feedbacks is required.' },
        { status: 400 }
      );
    }

    // Prepare a lightweight payload of feedback items for the LLM
    const items = feedbacks.map((fb) => ({
      type: fb.type,
      title: fb.title,
      description: fb.description,
      status: fb.status || 'pending',
    }));

    const systemPrompt = `You are an AI system administrator assistant for Print Mart.
Your goal is to analyze the employee feedback records (suggestions and bugs) and output a structured analysis to help administrators make business decisions.

You must output a single, valid JSON object containing exactly the following keys:
1. "overallSummary": A concise 2-3 sentence paragraph summarizing the current feedback sentiment, what workers are focused on, and any major highlights.
2. "topSuggestions": An array of up to 3 objects, each representing a valuable feature suggestion. Each object must have keys:
   - "title": Title of the suggestion.
   - "impact": A 1-sentence description of the benefit it brings to the print shop.
3. "criticalBugs": An array of up to 3 objects, each representing an urgent bug or recurring issue. Each object must have keys:
   - "title": Title of the bug.
   - "severity": A 1-sentence description of the impact/blockage it causes (High, Medium, or Low severity).

CRITICAL INSTRUCTIONS:
- Do not output any markdown formatting (do not wrap in \`\`\`json or \`\`\`).
- Output ONLY the JSON block. No conversational preambles, introductory sentences, or notes.
- Ensure the JSON is syntactically correct and fully parseable.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(items) },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }, // Instruct Groq to output JSON mode if supported
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim() || '{}';
    
    // Parse it to verify it is valid JSON before returning it
    try {
      const parsedData = JSON.parse(aiResponse);
      return NextResponse.json(parsedData);
    } catch (parseErr) {
      console.error('Failed to parse Groq AI response as JSON:', aiResponse);
      return NextResponse.json(
        { error: 'AI returned an invalid data structure. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in feedback summarizer API:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to summarize feedback' },
      { status: 500 }
    );
  }
}
