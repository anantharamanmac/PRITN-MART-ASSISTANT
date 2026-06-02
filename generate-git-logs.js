const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function main() {
  console.log("Generating git history JSON at build time...");
  const changelogs = [];

  try {
    // Fetch recent commits history
    const { stdout: logOut } = await execAsync('git log -n 12 --pretty=format:"%h|%s|%an|%ad" --date=short');
    const logLines = logOut.split('\n').filter(Boolean);

    for (const line of logLines) {
      const [hash, subject, author, date] = line.split('|');

      // Fetch list of modified files in this commit
      let files = [];
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
        createdAt: {
          seconds: Math.floor(dateObj.getTime() / 1000),
          nanoseconds: 0
        }
      });
    }

    const outputPath = path.join(__dirname, 'src', 'lib', 'git-history.json');
    
    // Ensure parent directories exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(changelogs, null, 2));
    console.log(`Successfully generated git history containing ${changelogs.length} commits at ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate git logs at build time:", error);
    // Write empty array to avoid importing issues
    const outputPath = path.join(__dirname, 'src', 'lib', 'git-history.json');
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify([], null, 2));
  }
}

main();
