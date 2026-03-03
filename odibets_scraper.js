// odibets_scraper.js - FIXED LOOP VERSION with organized storage
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class OdibetsScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://www.odibets.com/sports/soccer';
        this.allMatches = [];
        this.startTime = Date.now();
        this.dataDir = path.join(__dirname, 'data', 'odibets');
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('⚽ ODIBETS SOCCER MATCH SCRAPER - FIXED LOOP');
        console.log('='.repeat(80));

        // Create data directory if it doesn't exist
        await fs.mkdir(this.dataDir, { recursive: true });

        // 👇 ADD THIS DETECTION CODE
        // Check if running in Docker/Render (via environment variable)
        const isProduction = process.env.NODE_ENV === 'production' ||
            process.env.RENDER === 'true' ||
            process.env.RUNNING_IN_DOCKER === 'true';

        this.browser = await puppeteer.launch({
            // 👇 Use headless mode in production, visible mode locally
            headless: isProduction ? true : false,
            defaultViewport: { width: 1366, height: 768 },
            args: isProduction ? [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ] : [  // Keep your existing args for local
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ]
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }

    async navigateToSoccer() {
        console.log('\n📡 Loading Odibets soccer page...');
        try {
            await this.page.goto(this.baseUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            console.log('✅ Page loaded');
            await this.delay(3000);
        } catch (error) {
            console.log(`⚠️ Navigation warning: ${error.message}`);
            await this.delay(3000);
        }
    }

    async getVisibleMatchCount() {
        try {
            return await this.page.evaluate(() => {
                return document.querySelectorAll('a.t').length;
            });
        } catch (error) {
            return 0;
        }
    }

    async expandLeaguesInBatches() {
        console.log('\n🔍 Expanding leagues in batches (50 per batch)...');

        let totalClicked = 0;
        let batchCount = 0;
        let previousMatchCount = 0;
        let noProgressCount = 0;
        const batchSize = 50;
        const waitTime = 2000;
        const maxBatches = 20; // Safety limit

        while (batchCount < maxBatches) {
            batchCount++;

            const clicked = await this.page.evaluate((limit) => {
                let count = 0;
                const elements = document.querySelectorAll('div, span, h3, h4, h5, a');

                elements.forEach(el => {
                    if (count >= limit) return;

                    const text = el.innerText?.trim() || '';
                    const match = text.match(/(.+?)\s*\((\d+)\)$/);

                    if (match && !text.includes('vs') && !text.includes(':')) {
                        // Check if this league is already expanded
                        let isExpanded = false;
                        let parent = el.parentElement;
                        if (parent) {
                            let next = parent.nextElementSibling;
                            if (next && next.querySelector('a.t')) {
                                isExpanded = true;
                            }
                        }

                        if (!isExpanded) {
                            try {
                                el.scrollIntoView({ block: 'center' });
                                el.click();
                                count++;
                            } catch (e) {}
                        }
                    }
                });

                return count;
            }, batchSize);

            totalClicked += clicked;

            // Show progress
            process.stdout.write(`\r   Batch ${batchCount}: Clicked ${clicked} leagues (total: ${totalClicked})`);

            // If no leagues clicked this batch, we're done
            if (clicked === 0) {
                console.log('\n   ✅ No more leagues to click');
                break;
            }

            // Wait between batches
            await this.delay(waitTime);

            // Check match count every batch
            const currentMatches = await this.getVisibleMatchCount();
            process.stdout.write(` → ${currentMatches} matches`);

            // Check if matches are still increasing
            if (currentMatches === previousMatchCount) {
                noProgressCount++;
                if (noProgressCount >= 3) {
                    console.log('\n   ✅ Match count stable for 3 batches, stopping');
                    break;
                }
            } else {
                noProgressCount = 0;
                previousMatchCount = currentMatches;
            }
        }

        console.log(`\n\n📊 Total leagues clicked: ${totalClicked}`);

        // Final match count
        const finalMatches = await this.getVisibleMatchCount();
        console.log(`📊 Final match count: ${finalMatches}`);

        return totalClicked;
    }

    async extractAllMatches() {
        console.log('\n📋 Extracting all matches...');

        const matches = await this.page.evaluate(() => {
            const results = [];
            const matchLinks = document.querySelectorAll('a.t');

            matchLinks.forEach(link => {
                try {
                    const teamDivs = link.querySelectorAll('div.t-l');

                    if (teamDivs.length >= 2) {
                        const home = teamDivs[0].innerText?.trim() || '';
                        const away = teamDivs[1].innerText?.trim() || '';

                        const timeElement = link.querySelector('div.t-m span.font-bold');

                        if (timeElement && home && away) {
                            const timeText = timeElement.innerText?.trim() || '';
                            const timeMatch = timeText.match(/(\d{2}\/\d{2})\s+(\d{2}:\d{2})/);

                            if (timeMatch) {
                                results.push({
                                    home: home,
                                    away: away,
                                    kickoff: timeMatch[2],
                                    date: timeMatch[1]
                                });
                            }
                        }
                    }
                } catch (e) {}
            });

            return results;
        });

        const visibleCount = await this.getVisibleMatchCount();
        console.log(`   ✅ Extracted ${matches.length} matches (site shows ${visibleCount})`);
        return matches;
    }

    async saveMatches(matches) {
        // Prepare data
        const data = {
            timestamp: new Date().toISOString(),
            totalMatches: matches.length,
            matches: matches
        };

        // 1. Save latest version (always overwrites)
        const latestFile = path.join(this.dataDir, 'odibets_latest.json');
        await fs.writeFile(latestFile, JSON.stringify(data, null, 2));
        console.log(`\n💾 Latest matches saved to ${latestFile}`);

        // 2. Save dated version (for history)
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        const historyDir = path.join(this.dataDir, 'history', year.toString(), month);
        await fs.mkdir(historyDir, { recursive: true });

        const historyFile = path.join(historyDir, `odibets_${year}-${month}-${day}.json`);
        await fs.writeFile(historyFile, JSON.stringify(data, null, 2));
        console.log(`💾 History saved to ${historyFile}`);

        // 3. Save CSV version
        const csvFilename = path.join(this.dataDir, `odibets_${year}-${month}-${day}.csv`);
        let csvContent = 'Home Team,Away Team,Kickoff,Date\n';
        matches.forEach(m => {
            csvContent += `${m.home},${m.away},${m.kickoff},${m.date}\n`;
        });
        await fs.writeFile(csvFilename, csvContent);
        console.log(`💾 CSV saved to ${csvFilename}`);

        // 4. Clean up old files (older than 7 days)
        await this.cleanupOldFiles();
    }

    async cleanupOldFiles() {
        try {
            const historyDir = path.join(this.dataDir, 'history');
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            // Check if history directory exists
            const historyExists = await fs.access(historyDir).then(() => true).catch(() => false);
            if (!historyExists) return;

            // Walk through year/month folders
            const years = await fs.readdir(historyDir);

            for (const year of years) {
                const yearPath = path.join(historyDir, year);
                const yearStat = await fs.stat(yearPath);
                if (!yearStat.isDirectory()) continue;

                const months = await fs.readdir(yearPath);

                for (const month of months) {
                    const monthPath = path.join(yearPath, month);
                    const monthStat = await fs.stat(monthPath);
                    if (!monthStat.isDirectory()) continue;

                    const files = await fs.readdir(monthPath);
                    let deletedCount = 0;

                    for (const file of files) {
                        if (file.endsWith('.json') || file.endsWith('.csv')) {
                            const filePath = path.join(monthPath, file);
                            const stats = await fs.stat(filePath);

                            // If file is older than 7 days, delete it
                            if (now - stats.mtimeMs > sevenDays) {
                                await fs.unlink(filePath);
                                deletedCount++;
                                console.log(`🧹 Deleted old file: ${filePath}`);
                            }
                        }
                    }

                    // Remove empty month folder
                    const remaining = await fs.readdir(monthPath);
                    if (remaining.length === 0) {
                        await fs.rmdir(monthPath);
                        console.log(`📁 Removed empty folder: ${monthPath}`);
                    }
                }

                // Remove empty year folder
                const remainingMonths = await fs.readdir(yearPath);
                if (remainingMonths.length === 0) {
                    await fs.rmdir(yearPath);
                    console.log(`📁 Removed empty folder: ${yearPath}`);
                }
            }
        } catch (error) {
            // Silently handle cleanup errors (don't crash the program)
            console.log(`⚠️ Cleanup warning: ${error.message}`);
        }
    }

    async run() {
        try {
            await this.init();
            await this.navigateToSoccer();

            const initialCount = await this.getVisibleMatchCount();
            console.log(`\n📊 Initially visible matches: ${initialCount}`);

            // Expand leagues
            await this.expandLeaguesInBatches();

            // Short final wait
            await this.delay(3000);

            // Extract matches
            const allMatches = await this.extractAllMatches();

            // Display summary (first 20 matches)
            console.log('\n' + '='.repeat(80));
            console.log(`📋 ODIBETS MATCHES - ${new Date().toLocaleDateString()}`);
            console.log('='.repeat(80));
            console.log(`📊 Total matches: ${allMatches.length}`);
            console.log('-'.repeat(80));

            allMatches.slice(0, 20).forEach((m, i) => {
                console.log(`${(i+1).toString().padStart(3)}. ${m.home.padEnd(25)} vs ${m.away.padEnd(25)} @ ${m.kickoff} ${m.date}`);
            });

            if (allMatches.length > 20) {
                console.log(`   ... and ${allMatches.length - 20} more matches`);
            }

            console.log('='.repeat(80));

            // Save matches with organized structure
            await this.saveMatches(allMatches);

            console.log(`\n⏱️  Total time: ${Math.round((Date.now() - this.startTime)/1000)} seconds`);

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await this.delay(2000);
            await this.browser.close();
        }
    }
}

// Run the scraper
if (require.main === module) {
    new OdibetsScraper().run().catch(console.error);
}

module.exports = { OdibetsScraper };