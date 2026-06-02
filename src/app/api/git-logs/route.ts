import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const changelogs = [];

    // 1. Check for Uncommitted Working Directory changes using `git status`
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
      console.warn("Git status check failed:", statusError);
    }

    // 2. Fetch recent commits history
    try {
      const { stdout: logOut } = await execAsync('git log -n 12 --pretty=format:"%h|%s|%an|%ad" --date=short');
      const logLines = logOut.split('\n').filter(Boolean);

      for (const line of logLines) {
        const [hash, subject, author, date] = line.split('|');

        // Fetch list of modified files in this commit
        let files: string[] = [];
        try {
          const { stdout: filesOut } = await execAsync(`git show --name-only --pretty=format:"" ${hash}`);
          files = filesOut.split('\n').map(f => f.trim()).filter(Boolean);
        } catch (filesError) {
          console.warn(`Failed to fetch files for commit ${hash}:`, filesError);
        }

        // Format date string
        const dateObj = new Date(date);
        const formattedDate = isNaN(dateObj.getTime())
          ? date
          : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        changelogs.push({
          id: hash,
          version: hash.toUpperCase(),
          date: formattedDate,
          title: subject,
          badge: "Git Update",
          badgeColor: "var(--primary)",
          items: [
            `Developer: ${author}`,
            ...files.map(f => `File: ${f}`)
          ],
          createdAt: { toMillis: () => dateObj.getTime() }
        });
      }
    } catch (logError) {
      console.warn("Git log fetch failed:", logError);
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
