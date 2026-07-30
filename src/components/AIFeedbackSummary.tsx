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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg> AI Feedback Insights
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
              <span className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4M8 15h.01M16 15h.01M12 18h.01" />
                </svg>
                Analyze {feedbacks.length} Tickets
              </span>
            )}
          </button>
        </div>
      </div>

      {summaryData && (
        <div className="mt-4 border-t border-white/5 pt-4 animate-fade-in">
          {/* Overall Summary paragraph */}
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-4 mb-4">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> Executive Summary
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6M10 22h4" /></svg> Key Opportunities
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M12 2v3M8 5a4 4 0 0 1 8 0M6 14H4M20 14h-2M6 18H4M20 18h-2" /></svg> Critical Attention Needed
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
