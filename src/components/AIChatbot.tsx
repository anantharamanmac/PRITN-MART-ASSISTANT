import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppUser } from '@/lib/auth';
import { getUserAttendanceHistory } from '@/lib/db';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatbotProps {
  user: AppUser;
}

const QUICK_PROMPTS = [
  "What is my overtime pay?",
  "Summarize my attendance logs",
  "How many leaves did I take?",
  "How many hours have I worked?",
];

export default function AIChatbot({ user }: AIChatbotProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tooltipSeen = localStorage.getItem('printmart_ai_tooltip_seen');
    if (!tooltipSeen) {
      const timer = setTimeout(() => {
        setShowTooltip(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleToggleChat = () => {
    setIsOpen(prev => {
      const nextState = !prev;
      if (nextState) {
        setShowTooltip(false);
        localStorage.setItem('printmart_ai_tooltip_seen', 'true');
      }
      return nextState;
    });
  };

  const handleDismissTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(false);
    localStorage.setItem('printmart_ai_tooltip_seen', 'true');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Pre-fetch logs on client when chat is opened
  useEffect(() => {
    if (isOpen) {
      const fetchLogs = async () => {
        try {
          const userLogs = await getUserAttendanceHistory(user.uid);
          setLogs(userLogs);
        } catch (err) {
          console.error("Failed to load logs on client:", err);
        }
      };
      fetchLogs();
    }
  }, [isOpen, user.uid]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Hi ${user.displayName.split(' ')[0]}! I am your PrintMart AI Assistant.

I can securely calculate your working hours, leaves, and overtime pay (at ₹100/hr) from your timesheets.

What would you like me to check?`
        }
      ]);
    }
  }, [isOpen, messages.length, user.displayName]);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let activeLogs = logs;
      if (!activeLogs) {
        activeLogs = await getUserAttendanceHistory(user.uid);
        setLogs(activeLogs);
      }

      const chatHistory = [...messages, userMessage];

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          userProfile: {
            displayName: user.displayName,
            email: user.email,
            designation: user.designation || '',
            workMode: user.workMode || 'office',
            salaryStartDay: user.salaryStartDay || 1
          },
          logs: (activeLogs || []).slice(0, 60),
          messages: chatHistory,
        }),
      });

      const data = await response.json();

      if (response.ok && data.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);

        // Execute AI-triggered page navigation
        if (data.action === 'navigate' && data.route) {
          setTimeout(() => {
            router.push(data.route);
            setIsOpen(false);
          }, 1500);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: "I apologize, but I am unable to process your request at this moment. Please try again.",
          },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "A network issue is preventing me from fetching your records. Please check your connection.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot-root">
      {/* Scoped CSS for the compact floating chatbot widget layout */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .chatbot-root {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          font-family: 'Inter', system-ui, sans-serif;
        }

        @media (max-width: 767px) {
          .chatbot-root {
            bottom: calc(72px + env(safe-area-inset-bottom));
            right: 16px;
          }
          .chatbot-window {
            width: calc(100vw - 32px);
            max-width: 340px;
            height: 75vh;
            max-height: 480px;
            right: 0;
          }
          .chatbot-tooltip {
            right: 0px;
            bottom: 64px;
            width: calc(100vw - 48px);
            max-width: 280px;
          }
        }

        /* 1. Chat Toggle Button */
        .chatbot-toggle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #C9A227 0%, #A8840E 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          outline: none;
          cursor: pointer;
          color: #0d1220;
          box-shadow: 0 4px 16px rgba(201, 162, 39, 0.4);
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chatbot-toggle:hover {
          transform: scale(1.06);
          box-shadow: 0 6px 22px rgba(201, 162, 39, 0.55);
        }
        .chatbot-toggle:active {
          transform: scale(0.95);
        }

        /* 1b. Chatbot Toggle Pulse Badge */
        .chatbot-badge-container {
          position: relative;
        }
        .chatbot-toggle-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          width: 12px;
          height: 12px;
          background: #ef4444;
          border: 2.5px solid #07090f;
          border-radius: 50%;
          z-index: 10001;
          animation: badge-pulse 2.2s infinite;
        }
        @keyframes badge-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }

        /* 1c. Tooltip Intro popover */
        .chatbot-tooltip {
          position: absolute;
          bottom: 0px;
          right: 64px;
          width: 230px;
          background: linear-gradient(135deg, #0d1220 0%, #111827 100%);
          border: 1px solid rgba(201, 162, 39, 0.25);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
          border-radius: 14px;
          padding: 12px 14px;
          color: white;
          font-size: 12px;
          line-height: 1.45;
          z-index: 9998;
          animation: tooltip-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-sizing: border-box;
          text-align: left;
        }
        @keyframes tooltip-slide-in {
          from {
            opacity: 0;
            transform: translateX(12px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        .chatbot-tooltip-title {
          font-weight: 800;
          color: #C9A227;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
          font-size: 12px;
        }
        .chatbot-tooltip-desc {
          color: #cbd5e1;
          font-size: 11px;
          margin: 0;
        }
        .chatbot-tooltip-close {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .chatbot-tooltip-close:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        /* 2. Chatbot Floating Card (Sits directly above the toggle button) */
        .chatbot-window {
          position: absolute;
          bottom: 64px;
          right: 0;
          width: 310px;
          height: 420px;
          background: #0a0e1a;
          border: 1px solid rgba(201, 162, 39, 0.12);
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 10000;
          animation: chatbot-slide-up 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          transform-origin: bottom right;
        }
        @keyframes chatbot-slide-up {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* 3. Header */
        .chatbot-header {
          background: #0d1220;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .chatbot-header-profile {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .chatbot-header-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(201, 162, 39, 0.1);
          border: 1px solid rgba(201, 162, 39, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
        }
        .chatbot-header-text {
          display: flex;
          flex-direction: column;
        }
        .chatbot-header-title {
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0.1px;
        }
        .chatbot-header-status {
          font-size: 9px;
          color: #34C77A;
          display: flex;
          align-items: center;
          gap: 3px;
          margin-top: 1px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .chatbot-status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #34C77A;
          display: inline-block;
          animation: chatbot-blink 1.5s infinite;
        }
        @keyframes chatbot-blink {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .chatbot-close {
          background: transparent;
          border: none;
          color: #a0a0ab;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 50%;
          transition: color 0.2s, background-color 0.2s;
        }
        .chatbot-close:hover {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.05);
        }

        /* 4. Chat messages stream */
        .chatbot-messages-container {
          flex-grow: 1;
          padding: 12px 14px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: #070b14;
        }
        .chatbot-msg-row {
          display: flex;
          width: 100%;
          align-items: flex-start;
          gap: 6px;
        }
        .chatbot-msg-row.user-row {
          justify-content: flex-end;
        }
        .chatbot-msg-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .chatbot-bubble {
          max-w-[78%] border-radius: 12px;
          padding: 8px 12px;
          font-size: 11.5px;
          line-height: 1.4;
          word-wrap: break-word;
          white-space: pre-wrap;
        }
        .chatbot-bubble.bot-bubble {
          background-color: #0d1627;
          color: #EDF2F7;
          border-bottom-left-radius: 3px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .chatbot-bubble.user-bubble {
          background: linear-gradient(135deg, #1B2A4A 0%, #243558 100%);
          color: #EDF2F7;
          border-bottom-right-radius: 3px;
          border: 1px solid rgba(201, 162, 39, 0.15);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
        }

        /* 5. Typing indicator animation */
        .chatbot-typing {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 3px 6px;
        }
        .chatbot-typing-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #a0a0ab;
          animation: chatbot-bounce 1.2s infinite ease-in-out;
        }
        .chatbot-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .chatbot-typing-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes chatbot-bounce {
          0%, 100%, 80% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }

        /* 6. Quick Prompts suggestions */
        .chatbot-suggestions {
          padding: 10px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: #0a0e1a;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chatbot-suggestions-title {
          font-size: 8.5px;
          font-weight: 700;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .chatbot-suggestions-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .chatbot-chip {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 5px 8px;
          font-size: 10.5px;
          font-weight: 500;
          color: #8896AB;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }
        .chatbot-chip:hover {
          background: rgba(201, 162, 39, 0.08);
          border-color: rgba(201, 162, 39, 0.4);
          color: #E4BE5B;
        }

        /* 7. Footer Input Form */
        .chatbot-footer {
          padding: 10px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: #070b14;
        }
        .chatbot-form {
          display: flex;
          gap: 6px;
          width: 100%;
        }
        .chatbot-input {
          flex-grow: 1;
          background: #0d1220;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 8px 12px;
          color: #EDF2F7;
          font-size: 12px;
          outline: none;
          transition: border-color 0.2s;
        }
        .chatbot-input:focus {
          border-color: rgba(201, 162, 39, 0.5);
          box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.1);
        }
        .chatbot-send {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #C9A227, #A8840E);
          border: none;
          color: #0d1220;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s;
          flex-shrink: 0;
        }
        .chatbot-send:hover {
          filter: brightness(1.1);
        }
        .chatbot-send:disabled {
          background-color: rgba(255, 255, 255, 0.03);
          color: #52525b;
          cursor: not-allowed;
        }

        /* 8. Scrollbar styling */
        .chatbot-messages-container::-webkit-scrollbar {
          width: 3px;
        }
        .chatbot-messages-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .chatbot-messages-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 10px;
        }
      `}} />

      {/* 1. Chat Window Panel (Floating Card) */}
      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-profile">
              <div className="chatbot-header-avatar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--sapphire-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4M8 15h.01M16 15h.01M12 18h.01" />
                </svg>
              </div>
              <div className="chatbot-header-text">
                <h4 className="chatbot-header-title">PrintMart AI Helper</h4>
                <div className="chatbot-header-status">
                  <span className="chatbot-status-dot" />
                  Online
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="chatbot-close"
              title="Minimize Chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Messages Stream */}
          <div className="chatbot-messages-container">
            {messages.map((msg, index) => {
              const isAI = msg.role === 'assistant';
              return (
                <div
                  key={index}
                  className={`chatbot-msg-row ${isAI ? 'bot-row' : 'user-row'}`}
                >
                  {isAI && (
                    <div className="chatbot-msg-avatar">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sapphire-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                        <rect x="3" y="11" width="18" height="10" rx="2" />
                        <circle cx="12" cy="5" r="2" />
                        <path d="M12 7v4M8 15h.01M16 15h.01M12 18h.01" />
                      </svg>
                    </div>
                  )}
                  <div className={`chatbot-bubble ${isAI ? 'bot-bubble' : 'user-bubble'}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="chatbot-msg-row bot-row">
                <div className="chatbot-msg-avatar">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sapphire-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4M8 15h.01M16 15h.01M12 18h.01" />
                  </svg>
                </div>
                <div className="chatbot-bubble bot-bubble">
                  <div className="chatbot-typing">
                    <span className="chatbot-typing-dot" />
                    <span className="chatbot-typing-dot" />
                    <span className="chatbot-typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions chips */}
          {messages.length <= 1 && !loading && (
            <div className="chatbot-suggestions">
              <div className="chatbot-suggestions-title">Ask about:</div>
              <div className="chatbot-suggestions-list">
                {QUICK_PROMPTS.slice(0, 3).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="chatbot-chip"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Footer */}
          <div className="chatbot-footer">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="chatbot-form"
            >
              <input
                type="text"
                placeholder="Ask about overtime, payout..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="chatbot-input"
                required
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="chatbot-send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Tooltip Intro Popover */}
      {showTooltip && !isOpen && (
        <div className="chatbot-tooltip animate-fade-in">
          <button 
            onClick={handleDismissTooltip}
            className="chatbot-tooltip-close"
            title="Dismiss notification"
          >
            &#10005;
          </button>
          <div className="chatbot-tooltip-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--sapphire-light)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            PrintMart AI Assistant
          </div>
          <p className="chatbot-tooltip-desc">
            Try checking your working hours, leaves, or calculate your overtime pay. Try checking things out!
          </p>
        </div>
      )}

      {/* 3. Floating Toggle Button with Pulsing Badge */}
      <div className="chatbot-badge-container">
        {showTooltip && !isOpen && <span className="chatbot-toggle-badge" />}
        <button
          onClick={handleToggleChat}
          className="chatbot-toggle"
          title={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
        >
          {isOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
