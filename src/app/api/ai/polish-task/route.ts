import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// Initialize Groq client
// It will automatically pick up GROQ_API_KEY from process.env
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_build_key',
});

export async function POST(req: Request) {
  try {
    const { taskText } = await req.json();

    if (!taskText || !taskText.trim()) {
      return NextResponse.json(
        { error: 'Task text is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI assistant for Print Mart, a professional garment printing and screen-printing company.
Your job is to take raw, simple daily work log descriptions written by print shop workers and rewrite/polish them into professional, clear, and structured accomplishments.

Guidelines:
1. Rewrite the tasks to be professional, clear, and business-ready.
2. Use technical print shop, screen-printing, and apparel production terminology where appropriate (e.g., screen registration, curing temperatures, ink mixing, garment prep, squeegee pressure, emulsion exposure, print alignment, quality control check, etc.).
3. DO NOT invent completely new achievements or list machines they didn't mention, but expand their brief notes into professional sentences.
4. Keep the output relatively concise (around 2-4 bullet points or a short professional paragraph, depending on the input).
5. Output ONLY the polished text. Do not include introductory text (like "Here is your polished task:") or conversational filler. Just output the list/accomplishments directly.`;

    const cleanTaskText = (taskText || '').trim().slice(0, 1000);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cleanTaskText },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const polishedText = completion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ polishedText });
  } catch (error: any) {
    console.error('Error in task polisher API:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to polish task text' },
      { status: 500 }
    );
  }
}
