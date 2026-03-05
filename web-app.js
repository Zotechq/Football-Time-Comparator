// web-app.js - Super simple web dashboard
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ ADD THIS: Ensure conflict_log.json exists before starting
async function ensureFiles() {
    try {
        // Check if conflict_log.json exists
        await fs.access('./conflict_log.json');
        console.log('✅ conflict_log.json exists');
    } catch {
        // File doesn't exist, create it with empty array
        await fs.writeFile('./conflict_log.json', '[]');
        console.log('✅ Created empty conflict_log.json');
    }
}

// Call it before starting the server
ensureFiles().catch(console.error);

// Serve a simple HTML page
app.get('/', async (req, res) => {
    try {
        // Read the latest conflict log
        const conflicts = await fs.readFile('./conflict_log.json', 'utf8')
            .then(data => JSON.parse(data))
            .catch(() => []);

        // Get latest 5 conflicts
        const recentConflicts = conflicts.slice(-5).reverse();

        // Generate HTML
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>⚽ Football Time Comparator</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
                .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                .conflict { border-left: 4px solid #ff4757; padding: 15px; margin: 10px 0; background: #f8f9fa; }
                .time { color: #ff4757; font-weight: bold; }
                .footer { color: #666; font-size: 12px; text-align: center; margin-top: 30px; }
                h1 { margin: 0; }
                .badge { background: #ff4757; color: white; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚽ Football Time Comparator</h1>
                    <p>Tracking kickoff time conflicts between Flashscore & Odibets</p>
                </div>
                
                <div class="card">
                    <h2>🚨 Recent Conflicts</h2>
        `;

        if (recentConflicts.length > 0) {
            recentConflicts.forEach(conflict => {
                conflict.conflicts.forEach(c => {
                    html += `
                    <div class="conflict">
                        <strong>${c.home} vs ${c.away}</strong><br>
                        <span class="time">Flashscore: ${c.flashscore}</span> | 
                        <span class="time">Odibets: ${c.odibets}</span>
                        <span class="badge">${c.difference} min diff</span>
                    </div>
                    `;
                });
            });
        } else {
            html += `<p>✅ No conflicts detected yet!</p>`;
        }

        html += `
                </div>
                <div class="footer">
                    Last updated: ${new Date().toLocaleString()}<br>
                    Your scrapers run automatically every 6 hours
                </div>
            </div>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Error serving homepage:', error);
        res.status(500).send('Error loading data');
    }
});

// API endpoint for JSON data
app.get('/api/conflicts', async (req, res) => {
    try {
        const conflicts = await fs.readFile('./conflict_log.json', 'utf8')
            .then(data => JSON.parse(data))
            .catch(() => []);
        res.json(conflicts);
    } catch (error) {
        console.error('Error serving API:', error);
        res.status(500).json({ error: 'Failed to load conflicts' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web dashboard running at http://0.0.0.0:${PORT}`);
});