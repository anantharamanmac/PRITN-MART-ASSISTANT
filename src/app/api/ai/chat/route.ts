import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_build_key',
});

export async function POST(req: Request) {
  try {
    const { userId, userProfile, logs, messages } = await req.json();

    if (!userId || !userProfile || !logs) {
      return NextResponse.json(
        { error: 'User ID, profile, and attendance logs are required.' },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Conversation history is required.' },
        { status: 400 }
      );
    }

    // Sort in descending order by date in JavaScript (avoiding Firebase index rules)
    const rawLogs = logs
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 60);

    // 3. Pre-calculate statistics for absolute mathematical precision
    let presentCount = 0;
    let leaveCount = 0;
    let halfDayCount = 0;
    let totalHours = 0;
    let totalOvertime = 0;

    const formattedLogs = rawLogs.map((log: any) => {
      const hours = log.totalHours || 0;
      const ot = log.overtimeHours || 0;

      totalHours += hours;
      totalOvertime += ot;

      if (log.status === 'present') presentCount++;
      else if (log.status === 'half-day') halfDayCount++;
      else if (log.status === 'leave') leaveCount++;

      return {
        date: log.date,
        status: log.status,
        totalHours: Number(hours.toFixed(1)),
        overtimeHours: Number(ot.toFixed(1)),
        hasPunchIn: !!log.punchIn,
        hasPunchOut: !!log.punchOut,
      };
    });

    const overtimeRate = 100; // ₹100 per hour
    const projectedOtPay = Math.round(totalOvertime * overtimeRate);

    // 4. Assemble the system prompt with context and JSON instructions
    const systemPrompt = `You are the Print Mart Assistant AI, a helpful, conversational virtual chatbot helper.
You are chatting with employee: ${userProfile.displayName || 'Worker'} (Role: ${userProfile.role || 'worker'}).
You have direct, read-only access to their profile and their past attendance logs.

Employee Profile:
- Name: ${userProfile.displayName}
- Email: ${userProfile.email}
- Designation: ${userProfile.designation || 'Not specified'}
- Work Mode: ${userProfile.workMode || 'Office'}
- Salary Cycle Start Day: ${userProfile.salaryStartDay || 1} (cycle spans from day ${userProfile.salaryStartDay || 1} to day ${userProfile.salaryStartDay || 1} of next month)

Summary stats of the last 60 days (use these figures for mathematical accuracy):
- Present Days: ${presentCount}
- Leaves: ${leaveCount}
- Half-days: ${halfDayCount}
- Cumulative Logged Work Hours: ${totalHours.toFixed(1)} hrs
- Cumulative Overtime Hours: ${totalOvertime.toFixed(1)} hrs
- Projected Overtime Pay: ₹${projectedOtPay.toLocaleString('en-IN')} (calculated at standard overtime rate of ₹100/hour)

Detailed Shift Logs (last 60 days, sorted descending):
${JSON.stringify(formattedLogs, null, 2)}

Context Rules & Shift Policy:
1. Standard shift hours: 9 hours per day. Shifts start at 9:00 AM and end at 6:00 PM.
2. Left early? Leaving before 6:00 PM and after 1:00 PM is marked as 'half-day'. Leaving before 1:00 PM is marked as 'leave'.
3. Overtime rate is ₹100 per hour, applied for hours worked exceeding 9 hours in a single present day.
4. Breaks/pauses are automatically subtracted from total hours.
5. If the user asks about payout, leaves, or hours, refer to the precise pre-calculated stats above.

AI Action & Navigation Control:
You have the power to trigger a client-side navigation action ONLY when the user explicitly commands you to redirect them by using specific navigation phrases: "go to", "navigate to", "take me to", "open", "visit", "show me", or "redirect to" followed by a page name or keyword.

Strict Rules:
1. ONLY set "action" = "navigate" and "route" to the path if the user's latest message explicitly contains one of these command phrases (e.g., "go to settings", "open my calculator", "navigate to history", "take me to dashboard", "visit admin").
2. DO NOT trigger navigation if the user is just asking a question, discussing, or referencing a keyword or page name in conversation. E.g.,
   - User says: "What is my overtime pay?" -> "action" must be null. Simply calculate and reply.
   - User says: "Summarize my history logs" or "What does my history look like?" -> "action" must be null. Do not redirect them, just write the summary in the reply!
   - User says: "How does the developer board work?" -> "action" must be null.
   - User says: "Can you open history for me?" or "go to history" -> "action" = "navigate" and "route" = "/history".
3. If there is no explicit navigation verb like "go to", "navigate to", "take me to", "open", "visit", "show me", or "redirect to" in the user's latest query, "action" MUST be null and "route" MUST be null. When in doubt, do NOT navigate.

Available Routes:
- Dashboard (Home): "/dashboard"
- Attendance History Logs: "/history"
- Overtime Calculator: "/overtime-calculator"
- Salary Settings: "/salary-settings"
- Dev Logs & Feedback Suggestions: "/developer"
- Admin Panel: "/admin" (ONLY allowed if employee Role is "admin". Current employee Role is: "${userProfile.role || 'worker'}")
- Admin Shift Hours: "/admin/hours" (ONLY allowed if employee Role is "admin". Current employee Role is: "${userProfile.role || 'worker'}")

Security Constraint:
- If a standard worker requests to visit "/admin" or "/admin/hours" but their role is not "admin", do NOT trigger the navigate action. Instead, politely explain in the "reply" that they do not have administrative permissions.

Output JSON Structure:
You must output exactly a single, valid JSON object with the following keys:
1. "reply": A friendly, helpful conversational response answering the user. If navigating, mention where you are redirecting them (e.g. "Opening your Overtime Calculator..."). Keep it under 2-3 sentences.
2. "action": "navigate" (string) if redirecting, or null (if no redirection is needed).
3. "route": The destination path string (e.g. "/history") if redirecting, or null.

Do NOT include any markdown code blocks (\`\`\`json ...) or conversational text outside of the JSON object.`;

    // 5. Query Groq Chat Completion with JSON mode enabled
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const aiResponseText = completion.choices[0]?.message?.content?.trim() || '{}';

    try {
      const parsedResponse = JSON.parse(aiResponseText);
      let action = parsedResponse.action || null;
      let route = parsedResponse.route || null;

      // Fail-safe check: only navigate if the user's latest message has a navigation keyword/phrase
      if (action === 'navigate') {
        const lastUserMessage = (messages[messages.length - 1]?.content || '').toLowerCase();
        const hasNavPhrase = /\b(go\s*to|navigate\s*to|take\s*me\s*to|open|visit|show\s*me|redirect\s*to)\b/i.test(lastUserMessage);
        if (!hasNavPhrase) {
          action = null;
          route = null;
        }
      }

      return NextResponse.json({
        reply: parsedResponse.reply || '',
        action,
        route
      });
    } catch (parseError) {
      console.warn("Failed to parse chat response as JSON:", aiResponseText);
      return NextResponse.json({
        reply: aiResponseText,
        action: null,
        route: null
      });
    }
  } catch (error: any) {
    console.error('Error in AI Chat API route:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to complete AI response' },
      { status: 500 }
    );
  }
}
