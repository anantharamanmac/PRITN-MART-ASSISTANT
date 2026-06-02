"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { 
  submitFeedback, 
  getAllFeedback, 
  toggleUpvoteFeedback, 
  updateFeedbackStatus, 
  deleteFeedback,
  UserFeedback,
  ChangelogRecord,
  getChangelogs,
  createChangelog,
  deleteChangelog
} from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function DeveloperPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'feedback'>('timeline');

  // Dynamic Changelog State
  const [changelogs, setChangelogs] = useState<ChangelogRecord[]>([]);
  const [loadingChangelogs, setLoadingChangelogs] = useState(false);
  
  // Admin Changelog Form State
  const [showCreateChangelog, setShowCreateChangelog] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBadge, setNewBadge] = useState('Feature Release');
  const [newBadgeColor, setNewBadgeColor] = useState('var(--accent)');
  const [newItemsText, setNewItemsText] = useState('');
  const [creatingChangelog, setCreatingChangelog] = useState(false);

  // Feedback State
  const [feedbacks, setFeedbacks] = useState<UserFeedback[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'suggestions' | 'bugs' | 'my'>('all');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  
  // Submission Form State
  const [fbType, setFbType] = useState<'suggestion' | 'bug'>('suggestion');
  const [fbTitle, setFbTitle] = useState('');
  const [fbDescription, setFbDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load Changelogs dynamically from Git API (local development) with Firestore fallback (production)
  const loadChangelogs = async () => {
    setLoadingChangelogs(true);
    try {
      // 1. Try loading automatic Git history and workspace status
      const res = await fetch('/api/git-logs');
      const apiData = await res.json();
      if (apiData.success && apiData.changelogs && apiData.changelogs.length > 0) {
        setChangelogs(apiData.changelogs);
        return;
      }
    } catch (apiError) {
      console.warn("Git logs API unavailable, falling back to database:", apiError);
    }

    // 2. Database Fallback (auto-seeds default versions if empty)
    try {
      const dbData = await getChangelogs();
      setChangelogs(dbData);
    } catch (dbError) {
      console.error("Failed to load database changelogs:", dbError);
      toast.error("Failed to load release timeline.");
    } finally {
      setLoadingChangelogs(false);
    }
  };

  // Load Feedbacks from DB
  const loadFeedbacks = async () => {
    setLoadingFeedback(true);
    try {
      const data = await getAllFeedback();
      setFeedbacks(data);
    } catch (error) {
      console.error("Failed to load feedbacks:", error);
      toast.error("Failed to load feedback board.");
    } finally {
      setLoadingFeedback(false);
    }
  };

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'pending') {
        router.push('/pending');
      } else {
        setUser(appUser);
        setLoading(false);
        loadChangelogs();
        loadFeedbacks();
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleCreateChangelog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== 'admin') return;

    if (!newVersion.trim() || !newTitle.trim() || !newItemsText.trim()) {
      toast.error("Please fill in version, title, and release details.");
      return;
    }

    const items = newItemsText
      .split('\n')
      .map(item => item.trim())
      .filter(item => item.length > 0);

    if (items.length === 0) {
      toast.error("Please enter at least one release update detail point.");
      return;
    }

    setCreatingChangelog(true);
    try {
      // Get formatted date e.g. "June 2, 2026"
      const formattedDate = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      await createChangelog(
        newVersion.trim(),
        formattedDate,
        newTitle.trim(),
        newBadge,
        newBadgeColor,
        items
      );

      toast.success("Release timeline update published!");
      setNewVersion('');
      setNewTitle('');
      setNewItemsText('');
      setShowCreateChangelog(false);
      loadChangelogs(); // Reload list
    } catch (error) {
      console.error("Failed to create changelog:", error);
      toast.error("Failed to publish release timeline update.");
    } finally {
      setCreatingChangelog(false);
    }
  };

  const handleDeleteChangelog = async (id: string) => {
    if (!confirm("Are you sure you want to delete this release update?")) return;
    try {
      await deleteChangelog(id);
      toast.success("Release update deleted.");
      setChangelogs(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error("Failed to delete changelog:", error);
      toast.error("Failed to delete release update.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fbTitle.trim() || !fbDescription.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(
        user.uid,
        user.displayName,
        user.email,
        user.photoURL || '',
        fbType,
        fbTitle.trim(),
        fbDescription.trim()
      );
      toast.success(`${fbType === 'suggestion' ? 'Suggestion' : 'Bug report'} submitted successfully!`);
      setFbTitle('');
      setFbDescription('');
      loadFeedbacks(); // Reload feed
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      toast.error("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvote = async (feedbackId: string) => {
    if (!user) return;
    try {
      await toggleUpvoteFeedback(feedbackId, user.uid);
      // Optimistic UI update
      setFeedbacks(prev => 
        prev.map(f => {
          if (f.id === feedbackId) {
            const hasUpvoted = f.upvotes.includes(user.uid);
            const nextUpvotes = hasUpvoted
              ? f.upvotes.filter(id => id !== user.uid)
              : [...f.upvotes, user.uid];
            return { ...f, upvotes: nextUpvotes };
          }
          return f;
        })
      );
    } catch (error) {
      console.error("Upvote toggle failed:", error);
      toast.error("Failed to update upvote status.");
    }
  };

  const handleStatusChange = async (feedbackId: string, status: 'pending' | 'in-progress' | 'completed' | 'declined') => {
    try {
      await updateFeedbackStatus(feedbackId, status);
      toast.success("Feedback status updated!");
      setFeedbacks(prev => 
        prev.map(f => (f.id === feedbackId ? { ...f, status } : f))
      );
    } catch (error) {
      console.error("Status update failed:", error);
      toast.error("Failed to update status.");
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    if (!confirm("Are you sure you want to delete this feedback item?")) return;
    try {
      await deleteFeedback(feedbackId);
      toast.success("Feedback item deleted.");
      setFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete item.");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!user || loading) return <PrinterLoader text="Loading Developer Center..." fullscreen />;

  // Filter feedbacks
  const filteredFeedbacks = feedbacks.filter(f => {
    if (feedbackFilter === 'suggestions') return f.type === 'suggestion';
    if (feedbackFilter === 'bugs') return f.type === 'bug';
    if (feedbackFilter === 'my') return f.userId === user.uid;
    return true;
  });

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in" style={{ paddingBottom: '4rem' }}>
        
        {/* Page Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="title !text-4xl">Developer Center</h1>
          <p className="subtitle max-w-2xl">
            Track Print Mart Assistant portal updates, submit ideas to build next, or report operational bugs in the system.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex justify-center mb-8 gap-4">
          <button 
            className={`btn ${activeTab === 'timeline' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('timeline')}
            style={{ width: '180px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            System Changelog
          </button>
          <button 
            className={`btn ${activeTab === 'feedback' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setActiveTab('feedback');
              loadFeedbacks();
            }}
            style={{ width: '180px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Feedback Board
          </button>
        </div>

        {/* Active Tab Content */}
        {activeTab === 'timeline' ? (
          /* Timeline Content */
          <div className="max-w-2xl mx-auto">
            
            {/* Admin Release Update Button */}
            {user.role === 'admin' && (
              <div className="mb-6 flex justify-end">
                <button
                  onClick={() => setShowCreateChangelog(prev => !prev)}
                  className="btn btn-primary !py-2 !text-xs !font-bold"
                >
                  {showCreateChangelog ? 'Cancel Form' : '➕ Publish Release Log'}
                </button>
              </div>
            )}

            {/* Admin Publish Release Form */}
            {showCreateChangelog && user.role === 'admin' && (
              <div className="glass-card mb-8">
                <h3 className="text-lg font-bold text-white mb-2">Publish New Release</h3>
                <form onSubmit={handleCreateChangelog} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="input-group mb-0">
                      <label className="input-label text-xs font-semibold">Version</label>
                      <input
                        type="text"
                        className="input-field w-full !text-sm"
                        placeholder="e.g. v1.7"
                        value={newVersion}
                        onChange={(e) => setNewVersion(e.target.value)}
                      />
                    </div>
                    <div className="input-group mb-0">
                      <label className="input-label text-xs font-semibold">Title</label>
                      <input
                        type="text"
                        className="input-field w-full !text-sm"
                        placeholder="e.g. Dynamic Changelogs"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="input-group mb-0">
                      <label className="input-label text-xs font-semibold">Badge Text</label>
                      <input
                        type="text"
                        className="input-field w-full !text-sm"
                        placeholder="e.g. Feature Release"
                        value={newBadge}
                        onChange={(e) => setNewBadge(e.target.value)}
                      />
                    </div>
                    <div className="input-group mb-0">
                      <label className="input-label text-xs font-semibold">Badge Color Theme</label>
                      <select
                        className="input-field w-full !text-sm"
                        value={newBadgeColor}
                        onChange={(e) => setNewBadgeColor(e.target.value)}
                      >
                        <option value="var(--primary)">Purple (Primary)</option>
                        <option value="var(--accent)">Cyan (Accent)</option>
                        <option value="var(--success)">Green (Success)</option>
                        <option value="var(--secondary)">Pink (Secondary)</option>
                        <option value="var(--warning)">Yellow (Warning)</option>
                        <option value="#6b7280">Gray (Launch)</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-group mb-0">
                    <label className="input-label text-xs font-semibold">Release Details (one point per line)</label>
                    <textarea
                      className="input-field w-full !text-sm min-h-[100px] resize-y"
                      placeholder="e.g. Created database collections for releases&#10;Added UI components for changelog editing"
                      value={newItemsText}
                      onChange={(e) => setNewItemsText(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={creatingChangelog}
                    className="btn btn-success !py-2 text-xs font-bold w-full"
                  >
                    {creatingChangelog ? 'Publishing...' : 'Publish Update'}
                  </button>
                </form>
              </div>
            )}

            {/* Timeline Stream */}
            {loadingChangelogs && changelogs.length === 0 ? (
              <div className="flex justify-center p-12">
                <div className="cmyk-ink-dots">
                  <div className="cmyk-dot cmyk-cyan"></div>
                  <div className="cmyk-dot cmyk-magenta"></div>
                  <div className="cmyk-dot cmyk-yellow"></div>
                  <div className="cmyk-dot cmyk-key"></div>
                </div>
              </div>
            ) : changelogs.length === 0 ? (
              <div className="glass-card text-center p-12">
                <span className="text-3xl block mb-2">📜</span>
                <h4 className="text-white font-bold mb-1">No release updates found</h4>
                <p className="text-xs text-secondary">Click 'Publish Release Log' above to write the first changelog.</p>
              </div>
            ) : (
              <div className="dev-timeline">
                {changelogs.map((log, index) => (
                  <div key={log.id || index} className="dev-timeline-item">
                    {/* Timeline bullet line and point */}
                    <div className="dev-timeline-line"></div>
                    <div className="dev-timeline-bullet" style={{ borderColor: log.badgeColor }}></div>

                    {/* Log Card */}
                    <div className="glass-card dev-timeline-card">
                      <div className="flex justify-between items-start gap-4 mb-3 flex-wrap">
                        <div>
                          <span className="text-xs font-bold font-display tracking-widest uppercase mr-2" style={{ color: log.badgeColor }}>
                            {log.version}
                          </span>
                          <span className="text-xs text-secondary">{log.date}</span>
                          <h3 className="text-lg font-bold text-white mt-1">{log.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className="badge dev-log-badge"
                            style={{ 
                              backgroundColor: `${log.badgeColor}20`, 
                              borderColor: `${log.badgeColor}40`,
                              color: log.badgeColor,
                              border: '1px solid'
                            }}
                          >
                            {log.badge}
                          </span>
                          {user.role === 'admin' && log.id && log.id.length > 12 && (
                            <button
                              onClick={() => handleDeleteChangelog(log.id!)}
                              className="btn btn-outline border-none hover:bg-danger/10 hover:text-danger !p-1 h-[24px] w-[24px] flex items-center justify-center"
                              title="Delete Release Update"
                              style={{ color: 'var(--danger)', borderRadius: '4px' }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <ul className="dev-timeline-list">
                        {log.items && log.items.map((item, idx) => (
                          <li key={idx} className="text-sm text-secondary flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Feedback Board Content */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left: Feedback Submission Form */}
            <div className="lg:col-span-1">
              <div className="glass-card sticky-top-form">
                <h3 className="text-xl font-bold text-white mb-2">Submit Feedback</h3>
                <p className="text-xs text-secondary mb-6">
                  Have an idea for a new feature? Found a bug? Let us know and track its implementation!
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* Type Selector */}
                  <div>
                    <label className="text-xs text-secondary mb-2 block font-semibold">Feedback Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFbType('suggestion')}
                        className={`btn !py-2 !text-xs !font-bold ${
                          fbType === 'suggestion' 
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/45' 
                            : 'btn-outline border-transparent bg-white/5'
                        }`}
                      >
                        💡 Suggestion
                      </button>
                      <button
                        type="button"
                        onClick={() => setFbType('bug')}
                        className={`btn !py-2 !text-xs !font-bold ${
                          fbType === 'bug' 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/45' 
                            : 'btn-outline border-transparent bg-white/5'
                        }`}
                      >
                        🐛 Bug Report
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <div className="input-group mb-0">
                    <label className="input-label text-xs font-semibold">Title</label>
                    <input
                      type="text"
                      className="input-field w-full !text-sm"
                      placeholder={fbType === 'suggestion' ? 'e.g. Add dark theme option' : 'e.g. Geolocation error on punch out'}
                      value={fbTitle}
                      onChange={(e) => setFbTitle(e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  {/* Description */}
                  <div className="input-group mb-0">
                    <label className="input-label text-xs font-semibold">Description</label>
                    <textarea
                      className="input-field w-full !text-sm min-h-[120px] resize-y"
                      placeholder={
                        fbType === 'suggestion'
                          ? 'Explain what you want to add and why it would be helpful...'
                          : 'Provide details, steps to reproduce, or any error messages you saw...'
                      }
                      value={fbDescription}
                      onChange={(e) => setFbDescription(e.target.value)}
                      maxLength={1000}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary mt-2 w-full text-sm font-bold"
                  >
                    {submitting ? (
                      <>
                        <span className="btn-spinner"></span>
                        Submitting...
                      </>
                    ) : (
                      'Submit Ticket'
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Feedback List & Filter */}
            <div className="lg:col-span-2">
              
              {/* Filter Controls */}
              <div className="glass-card mb-6 !py-3 !px-4 flex justify-between items-center gap-4 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFeedbackFilter('all')}
                    className={`btn !py-1 !px-3 !text-xs !font-bold ${feedbackFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFeedbackFilter('suggestions')}
                    className={`btn !py-1 !px-3 !text-xs !font-bold ${feedbackFilter === 'suggestions' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Suggestions
                  </button>
                  <button
                    onClick={() => setFeedbackFilter('bugs')}
                    className={`btn !py-1 !px-3 !text-xs !font-bold ${feedbackFilter === 'bugs' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Bugs
                  </button>
                  <button
                    onClick={() => setFeedbackFilter('my')}
                    className={`btn !py-1 !px-3 !text-xs !font-bold ${feedbackFilter === 'my' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    My Submissions
                  </button>
                </div>
                <button
                  onClick={loadFeedbacks}
                  className="btn btn-outline !py-1 !px-2.5 h-[30px] flex items-center justify-center"
                  title="Refresh Board"
                  disabled={loadingFeedback}
                >
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className={loadingFeedback ? 'animate-spin' : ''}
                  >
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                </button>
              </div>

              {/* Feed Content */}
              {loadingFeedback && feedbacks.length === 0 ? (
                <div className="flex justify-center p-12">
                  <div className="cmyk-ink-dots">
                    <div className="cmyk-dot cmyk-cyan"></div>
                    <div className="cmyk-dot cmyk-magenta"></div>
                    <div className="cmyk-dot cmyk-yellow"></div>
                    <div className="cmyk-dot cmyk-key"></div>
                  </div>
                </div>
              ) : filteredFeedbacks.length === 0 ? (
                <div className="glass-card text-center p-12">
                  <span className="text-3xl block mb-2">📭</span>
                  <h4 className="text-white font-bold mb-1">No feedback tickets found</h4>
                  <p className="text-xs text-secondary">
                    {feedbackFilter === 'my' 
                      ? "You haven't submitted any logs or tickets yet."
                      : "Be the first to submit a suggestion or report a bug!"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredFeedbacks.map((fb) => {
                    const hasUpvoted = fb.upvotes?.includes(user.uid);
                    
                    return (
                      <div key={fb.id} className="glass-card feedback-item-card transition-all duration-300">
                        {/* Upper Header Row */}
                        <div className="flex justify-between items-start gap-4 mb-4 flex-wrap">
                          
                          {/* User Reporter Profile */}
                          <div className="flex items-center gap-3">
                            <div className="feedback-user-avatar">
                              {fb.userPhoto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={fb.userPhoto} alt={fb.userName} />
                              ) : (
                                <span className="text-[10px] font-bold text-secondary">
                                  {fb.userName.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-white leading-tight">{fb.userName}</div>
                              <div className="text-[10px] text-secondary">{formatDate(fb.createdAt)}</div>
                            </div>
                          </div>

                          {/* Ticket Type & Status */}
                          <div className="flex items-center gap-2">
                            <span 
                              className="badge dev-log-badge"
                              style={{
                                backgroundColor: fb.type === 'bug' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                borderColor: fb.type === 'bug' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)',
                                color: fb.type === 'bug' ? '#fca5a5' : '#a5b4fc',
                                border: '1px solid'
                              }}
                            >
                              {fb.type === 'bug' ? '🐛 Bug' : '💡 Idea'}
                            </span>
                            
                            <span className={`badge dev-log-badge ${
                              fb.status === 'in-progress' ? 'badge-pending' : // Orange/Yellow
                              fb.status === 'completed' ? 'badge-worker' : // Green
                              fb.status === 'declined' ? 'badge-leave' : // Red
                              'badge-admin' // Default Purple for Pending
                            }`}>
                              {fb.status === 'in-progress' ? 'In Progress' :
                               fb.status === 'completed' ? 'Completed' :
                               fb.status === 'declined' ? 'Declined' :
                               'Pending'}
                            </span>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div className="mb-4">
                          <h4 className="text-base font-bold text-white mb-2">{fb.title}</h4>
                          <p className="text-sm text-secondary whitespace-pre-wrap leading-relaxed">{fb.description}</p>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex justify-between items-center border-t border-white/5 pt-3 flex-wrap gap-4">
                          {/* Upvote Button */}
                          <button
                            onClick={() => handleUpvote(fb.id)}
                            className={`btn !py-1.5 !px-3.5 !text-xs !font-bold ${
                              hasUpvoted 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                                : 'btn-outline'
                            }`}
                            style={{ borderRadius: '8px' }}
                          >
                            <svg 
                              width="12" 
                              height="12" 
                              viewBox="0 0 24 24" 
                              fill={hasUpvoted ? 'currentColor' : 'none'} 
                              stroke="currentColor" 
                              strokeWidth="2.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="mr-1.5 inline align-middle"
                            >
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                            </svg>
                            Upvote ({fb.upvotes?.length || 0})
                          </button>

                          {/* Admin Dashboard / Status Controller */}
                          {user.role === 'admin' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-secondary font-semibold uppercase">Admin:</span>
                              <select
                                value={fb.status}
                                onChange={(e) => handleStatusChange(fb.id, e.target.value as any)}
                                className="input-field !py-1 !px-2.5 !text-xs"
                                style={{ borderRadius: '6px', height: '28px', backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                              >
                                <option value="pending">Pending</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="declined">Declined</option>
                              </select>
                              <button
                                onClick={() => handleDeleteFeedback(fb.id)}
                                className="btn btn-outline border-none hover:bg-danger/10 hover:text-danger !py-1 !px-2 h-[28px] w-auto flex items-center justify-center"
                                title="Delete Item"
                                style={{ borderRadius: '6px', color: 'var(--danger)' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </main>
    </>
  );
}
