import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import gitHistory from '@/lib/git-history.json';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const changelogs: any[] = [];

    // 1. Check for Uncommitted Working Directory changes using `git status` (development only)
    try {
      const { stdout: statusOut } = await execAsync('git status --porcelain');
      const statusLines = statusOut.split('\n').map(l => l.trim()).filter(Boolean);

      if (statusLines.length > 0) {
        const items = statusLines.map(line => {
          const mode = line.slice(0, 2).trim();
          const file = line.slice(2).trim();
          
          if (mode === 'M') return `Modified: ${file}`;
          if (mode === '??') return `Added (Untracked): ${file}`;
          if (mode === 'D') return `Deleted: ${file}`;
          return `Changed (${mode}): ${file}`;
        });

        // Add a virtual "Pending" card at the top
        changelogs.push({
          id: 'uncommitted',
          version: 'Local Workspace',
          date: 'Live Changes',
          title: 'Uncommitted Local Work',
          badge: 'Unsaved Changes',
          badgeColor: 'var(--warning)',
          items,
          createdAt: { toMillis: () => Date.now() + 10000 } // keep at the absolute top
        });
      }
    } catch (statusError) {
      // Quietly ignore in serverless or environments without git
      console.log("Git status check skipped (non-dev or serverless environment).");
    }

    // 2. Try to fetch live commit history dynamically
    let commitsLoaded = false;
    try {
      const { stdout: logOut } = await execAsync('git log -n 12 --pretty=format:"%h|%s|%an|%ad" --date=short');
      const logLines = logOut.split('\n').filter(Boolean);

      for (const line of logLines) {
        const [hash, subject, author, date] = line.split('|');

        // Format date string
        const dateObj = new Date(date);
        const formattedDate = isNaN(dateObj.getTime())
          ? date
          : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        changelogs.push({
          id: hash,
          version: `v1.8 - ${hash.toUpperCase()}`,
          date: formattedDate,
          title: subject,
          badge: "Git Update",
          badgeColor: "var(--primary)",
          items: [
            `Developer: ${author}`
          ],
          createdAt: { toMillis: () => dateObj.getTime() }
        });
      }
      commitsLoaded = true;
    } catch (logError) {
      console.log("Live git log unavailable, falling back to build-time history.");
    }

    // 3. Fallback: load build-time compiled git-history.json if live git failed
    if (!commitsLoaded) {
      if (gitHistory && gitHistory.length > 0) {
        // Convert build-time format to match expected structures
        const mappedHistory = gitHistory.map((item: any) => ({
          ...item,
          createdAt: { toMillis: () => item.createdAt?.seconds * 1000 || Date.now() }
        }));
        changelogs.push(...mappedHistory);
      } else {
        console.warn("No build-time git history cached.");
      }
    }

    return NextResponse.json({ success: true, changelogs });
  } catch (error: any) {
    console.error("Git logs API failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message, 
      changelogs: [] 
    }, { status: 500 });
  }
}
