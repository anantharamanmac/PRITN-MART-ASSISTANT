import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { UserFeedback } from '@/lib/db';

interface TopSuggestion {
  title: string;
  impact: string;
}

interface CriticalBug {
  title: string;
  severity: string;
}

interface AISummaryData {
  overallSummary: string;
  topSuggestions: TopSuggestion[];
  criticalBugs: CriticalBug[];
}

interface AIFeedbackSummaryProps {
  feedbacks: UserFeedback[];
}

export default function AIFeedbackSummary({ feedbacks }: AIFeedbackSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<AISummaryData | null>(null);

  const handleGenerateSummary = async () => {
    if (!feedbacks || feedbacks.length === 0) {
      toast.error("No feedback available to summarize.");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("AI is analyzing employee feedback logs...");

    try {
      const response = await fetch('/api/ai/summarize-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbacks }),
      });

      const data = await response.json();

      if (response.ok && data.overallSummary) {
        setSummaryData(data as AISummaryData);
        toast.success("AI Insights generated successfully!", { id: toastId });
      } else {
        toast.error(data.error || "Failed to generate AI insights summary.", { id: toastId });
      }
    } catch (err) {
      console.error("AI feedback summary error:", err);
      toast.error("Error connecting to AI service.", { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSummaryData(null);
  };

  return (
    <div className="glass-card mb-6 border border-indigo-500/20 bg-gradient-to-br from-indigo-950/10 via-slate-900/10 to-purple-950/10 shadow-[0_4px_30px_rgba(99,102,241,0.05)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>✨</span> AI Feedback Insights
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            Use Llama 3.3 to analyze and categorize bugs and feature suggestions.
          </p>
        </div>
        
        <div className="flex gap-2">
          {summaryData && (
            <button
              onClick={handleClear}
              className="btn btn-outline !py-1.5 !px-3 !text-xs !font-bold"
              style={{ borderRadius: '8px' }}
            >
              Clear
            </button>
          )}
          <button
            onClick={handleGenerateSummary}
            disabled={loading || feedbacks.length === 0}
            className="btn btn-primary !py-1.5 !px-3.5 !text-xs !font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none'
            }}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing...
              </>
            ) : (
              <>🤖 Analyze {feedbacks.length} Tickets</>
            )}
          </button>
        </div>
      </div>

      {summaryData && (
        <div className="mt-4 border-t border-white/5 pt-4 animate-fade-in">
          {/* Overall Summary paragraph */}
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-4 mb-4">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span>📋</span> Executive Summary
            </h4>
            <p className="text-sm text-secondary leading-relaxed">
              {summaryData.overallSummary}
            </p>
          </div>

          {/* Grid for bugs and suggestions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Suggestions Column */}
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
              <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span>💡</span> Key Opportunities
              </h4>
              {summaryData.topSuggestions && summaryData.topSuggestions.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {summaryData.topSuggestions.map((item, idx) => (
                    <div key={idx} className="border-l-2 border-emerald-500/20 pl-3">
                      <div className="text-sm font-bold text-white leading-snug">{item.title}</div>
                      <div className="text-xs text-secondary mt-0.5 leading-relaxed">{item.impact}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-secondary italic">No major suggestions highlighted by AI.</p>
              )}
            </div>

            {/* Critical Bugs Column */}
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4">
              <h4 className="text-xs font-bold text-rose-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span>🐛</span> Critical Attention Needed
              </h4>
              {summaryData.criticalBugs && summaryData.criticalBugs.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {summaryData.criticalBugs.map((item, idx) => (
                    <div key={idx} className="border-l-2 border-rose-500/20 pl-3">
                      <div className="text-sm font-bold text-white leading-snug flex items-center justify-between gap-2">
                        <span>{item.title}</span>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                          item.severity.toLowerCase().includes('high') 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35' 
                            : item.severity.toLowerCase().includes('medium')
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                            : 'bg-slate-500/20 text-slate-300 border border-slate-500/35'
                        }`}>
                          {item.severity.toLowerCase().includes('high') ? 'High' : item.severity.toLowerCase().includes('medium') ? 'Medium' : 'Low'}
                        </span>
                      </div>
                      <div className="text-xs text-secondary mt-0.5 leading-relaxed">{item.severity}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-secondary italic">No outstanding critical bugs identified by AI.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
