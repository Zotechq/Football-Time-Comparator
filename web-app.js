// web-app.js - Super simple web dashboard with 30-minute scraper interval
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const os = require('os');

// Import your scrapers - FIXED IMPORTS
const FlashscoreScraper = require('./flashscore_scraper');
const OdibetsScraper = require('./odibets_scraper').OdibetsScraper;

const app = express();
const PORT = process.env.PORT || 8080;

// Track when the app started
const START_TIME = Date.now();

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Flag to prevent overlapping scraper runs
let isRunning = false;

// Ensure conflict_log.json exists before starting
async function ensureFiles() {
    try {
        await fs.access('./conflict_log.json');
        console.log('✅ conflict_log.json exists');
    } catch {
        await fs.writeFile('./conflict_log.json', '[]');
        console.log('✅ Created empty conflict_log.json');
    }
}

// Function to log system info
function logSystemInfo() {
    console.log('🖥️ System Info:');
    console.log(`   - Hostname: ${os.hostname()}`);
    console.log(`   - Platform: ${os.platform()} ${os.release()}`);
    console.log(`   - Memory: ${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB total`);
    console.log(`   - CPUs: ${os.cpus().length}`);
    console.log(`   - Uptime: ${Math.round(os.uptime() / 60)} minutes`);
}

// Wake-up check function
app.use((req, res, next) => {
    const now = new Date();
    const uptime = Math.round((Date.now() - START_TIME) / 1000);

    console.log(`🔔 WAKE-UP CHECK [${now.toISOString()}]`);
    console.log(`   - Request: ${req.method} ${req.url}`);
    console.log(`   - App Uptime: ${uptime} seconds`);
    console.log(`   - Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);

    if (uptime < 60) {
        console.log(`   ⚠️ App just started/woke up ${uptime} seconds ago`);
    }

    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const uptimeSeconds = Math.floor(uptime % 60);

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
        uptimeSeconds: uptime,
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve a simple HTML page
app.get('/', async (req, res) => {
    try {
        const conflicts = await fs.readFile('./conflict_log.json', 'utf8')
            .then(data => JSON.parse(data))
            .catch(() => []);

        const recentConflicts = conflicts.slice(-5).reverse();

        let lastScrapeTime = 'Never';
        try {
            const stats = await fs.stat('./conflict_log.json');
            lastScrapeTime = stats.mtime.toLocaleString();
        } catch (e) {}

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
                .footer-small { color: #999; font-size: 10px; margin-top: 5px; }
                h1 { margin: 0; }
                .badge { background: #ff4757; color: white; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
                .stats { background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px; }
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
                <div class="card">
                    <h3>📊 App Status</h3>
                    <div class="stats">
                        <p><strong>Last updated:</strong> ${lastScrapeTime}</p>
                        <p><strong>Scraper schedule:</strong> Every 30 minutes</p>
                        <p><strong>App uptime:</strong> ${Math.floor(process.uptime() / 60)} minutes</p>
                        <p><strong>Wake-up checks:</strong> Active (check logs)</p>
                    </div>
                </div>
                <div class="footer">
                    Your scrapers run automatically every <strong>30 minutes</strong><br>
                    <span class="footer-small">Wake-up logging enabled - every request is logged</span>
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

// Manual trigger endpoint
app.get('/run-scrapers', async (req, res) => {
    const apiKey = req.query.key;
    if (apiKey !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔄 Manual scraper run triggered at', new Date().toISOString());

    runScrapers().catch(console.error);

    res.json({ status: 'started', timestamp: new Date().toISOString() });
});

// Function to run all scrapers
async function runScrapers() {
    if (isRunning) {
        console.log('⚠️ Scrapers already running, skipping this scheduled run...');
        return;
    }

    isRunning = true;
    console.log('🔄 Starting scrapers at', new Date().toLocaleString());
    console.log('📊 App uptime:', Math.round(process.uptime() / 60), 'minutes');

    try {
        // Run Flashscore scraper
        console.log('📊 Running Flashscore scraper...');
        const flashscore = new FlashscoreScraper();
        await flashscore.init();
        await flashscore.navigateToScheduled();
        await flashscore.expandAllSections();
        const flashMatches = await flashscore.extractAllMatches();
        await flashscore.browser.close();
        console.log(`✅ Flashscore found ${flashMatches.length} matches`);

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Run Odibets scraper
        console.log('📊 Running Odibets scraper...');
        const odibets = new OdibetsScraper();
        await odibets.init();
        await odibets.navigateToSoccer();
        await odibets.expandLeaguesInBatches();
        const odiMatches = await odibets.extractAllMatches();
        await odibets.browser.close();
        console.log(`✅ Odibets found ${odiMatches.length} matches`);

        // Update conflict_log.json modification time
        const currentLog = await fs.readFile('./conflict_log.json', 'utf8')
            .then(data => JSON.parse(data))
            .catch(() => []);
        await fs.writeFile('./conflict_log.json', JSON.stringify(currentLog, null, 2));

        console.log('✅ All scrapers completed successfully at', new Date().toLocaleString());

    } catch (error) {
        console.error('❌ Error running scrapers:', error);
    } finally {
        isRunning = false;
    }
}

// Start server with error handling
async function startServer() {
    console.log('🚀 APP STARTING UP at', new Date().toISOString());
    console.log('='.repeat(60));

    logSystemInfo();

    console.log('='.repeat(60));
    console.log('📋 Environment:');
    console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   - PORT: ${PORT}`);
    console.log(`   - CRON_SECRET: ${process.env.CRON_SECRET ? '✅ Set' : '❌ Not set'}`);

    await ensureFiles();

    const server = app.listen(PORT, '0.0.0.0')
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
            } else {
                console.error('❌ Server error:', err);
            }
            process.exit(1);
        })
        .on('listening', () => {
            console.log('='.repeat(60));
            console.log(`🌐 Web dashboard running at http://0.0.0.0:${PORT}`);
            console.log('✅ Server is running and will stay alive');
            console.log('🔔 Wake-up logging enabled - every request will be logged');
            console.log('='.repeat(60));

            console.log('⏰ Scheduling scrapers to run every 30 minutes');
            cron.schedule('*/30 * * * *', () => {
                console.log('⏰ CRON TRIGGER at', new Date().toLocaleString());
                console.log('📊 Current uptime:', Math.round(process.uptime() / 60), 'minutes');
                runScrapers().catch(console.error);
            });

            setTimeout(() => {
                console.log('🔄 Running initial scrapers on startup');
                runScrapers().catch(console.error);
            }, 5000);
        });
}

startServer().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});