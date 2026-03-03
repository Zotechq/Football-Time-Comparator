// flashscore-scraper-kenya-time-filtered.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class FlashscoreScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.dataDir = path.join(__dirname, 'data', 'flashscore');
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('⚽ FLASHSCORE MATCH SCRAPER - KENYA TIME');
        console.log('='.repeat(80));

        // Create data directory if it doesn't exist
        await fs.mkdir(this.dataDir, { recursive: true });

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1280, height: 800 }
        });

        this.page = await this.browser.newPage();

        // Block new windows
        await this.page.evaluateOnNewDocument(() => {
            window.open = () => null;
        });
    }

    async navigateToScheduled() {
        console.log('\n📡 Loading page...');
        await this.page.goto('https://www.flashscore.co.ke/football/');
        await this.delay(3000);

        console.log('🔍 Clicking SCHEDULED tab...');
        await this.page.evaluate(() => {
            const tabs = document.querySelectorAll('div.filters__text');
            for (let i = 0; i < tabs.length; i++) {
                if (tabs[i]?.innerText?.includes('SCHEDULED')) {
                    tabs[i].click();
                    break;
                }
            }
        });

        await this.delay(3000);
    }

    async expandAllSections() {
        console.log('\n🔍 Expanding all match sections...');

        let totalExpanded = 0;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`\n   Attempt ${attempts}/${maxAttempts}...`);

            const beforeCount = await this.countMatches();

            // Click all "display matches" buttons
            const clicked = await this.page.evaluate(() => {
                const buttons = document.querySelectorAll('span.wcl-scores-simple-text-01_-OvnR');
                let clickCount = 0;

                buttons.forEach(btn => {
                    if (btn.innerText.includes('display matches')) {
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        btn.click();
                        clickCount++;
                    }
                });

                return clickCount;
            });

            console.log(`   Clicked ${clicked} expansion buttons`);
            await this.delay(2000);

            const afterCount = await this.countMatches();
            const newMatches = afterCount - beforeCount;

            if (newMatches > 0) {
                console.log(`   ✅ +${newMatches} new matches`);
                totalExpanded += newMatches;
            }

            // Check if any buttons remain
            const remaining = await this.page.evaluate(() => {
                return document.querySelectorAll('span.wcl-scores-simple-text-01_-OvnR').length;
            });

            if (remaining === 0) {
                console.log('   ✅ All sections expanded!');
                break;
            }
        }

        console.log(`\n📊 Total expanded: +${totalExpanded} matches`);
        return totalExpanded;
    }

    async countMatches() {
        return await this.page.evaluate(() => {
            // Only count actual match elements, not headers or UI elements
            const matches = document.querySelectorAll('.event__match');
            let count = 0;

            matches.forEach(match => {
                // Skip header rows
                if (match.className.includes('header')) return;

                // Check if it has time element (real match)
                const timeEl = match.querySelector('.event__time');
                if (timeEl) {
                    const time = timeEl.innerText.trim();
                    // Count only if it has a valid time format (contains colon)
                    if (time.includes(':')) {
                        count++;
                    }
                }
            });

            return count;
        });
    }

    async extractAllMatches() {
        console.log('\n📋 Extracting all matches...');

        const matches = await this.page.evaluate(() => {
            const results = [];
            const matchElements = document.querySelectorAll('.event__match');

            matchElements.forEach(matchEl => {
                try {
                    // Skip header rows
                    if (matchEl.className.includes('header')) return;

                    const timeEl = matchEl.querySelector('.event__time');
                    const homeEl = matchEl.querySelector('.event__homeParticipant');
                    const awayEl = matchEl.querySelector('.event__awayParticipant');

                    if (timeEl && homeEl && awayEl) {
                        const time = timeEl.innerText.trim();
                        const home = homeEl.innerText.trim();
                        const away = awayEl.innerText.trim();

                        // Only include matches with valid time format (HH:MM)
                        // AND ensure it doesn't have "FRO" or other finished match indicators
                        if (time.includes(':') &&
                            !time.includes('FRO') &&
                            !time.includes('FT') &&
                            !time.includes('-') &&
                            !home.includes('FRO') &&
                            !away.includes('FRO')) {

                            results.push({
                                home: home,
                                away: away,
                                time: time
                            });
                        }
                    }
                } catch (e) {}
            });

            return results;
        });

        console.log(`✅ Found ${matches.length} valid matches`);
        return matches;
    }

    displayMatches(matches) {
        if (matches.length === 0) return;

        console.log('\n' + '='.repeat(80));
        console.log('📊 SCHEDULED MATCHES (Kenya Time - EAT)');
        console.log('='.repeat(80));

        // Sort by time (original time from website - already Kenya time)
        const sorted = [...matches].sort((a, b) => a.time.localeCompare(b.time));

        // Group by hour
        const byHour = {};
        sorted.forEach(m => {
            const hour = m.time.split(':')[0];
            if (!byHour[hour]) byHour[hour] = [];
            byHour[hour].push(m);
        });

        // Display with counts per hour
        const hours = Object.keys(byHour).sort((a, b) => parseInt(a) - parseInt(b));
        hours.forEach(hour => {
            const matchesThisHour = byHour[hour];
            console.log(`\n🕐 ${hour}:00 - ${hour}:59 (${matchesThisHour.length} matches)`);

            matchesThisHour.forEach((m, i) => {
                // Truncate long team names for better alignment
                const home = m.home.length > 25 ? m.home.substring(0, 22) + '...' : m.home;
                const away = m.away.length > 25 ? m.away.substring(0, 22) + '...' : m.away;
                console.log(`   ${(i+1).toString().padStart(2)}. ${home.padEnd(25)} vs ${away.padEnd(25)} @ ${m.time}`);
            });
        });

        console.log('\n' + '='.repeat(80));
        console.log(`📈 TOTAL: ${sorted.length} scheduled matches across ${hours.length} hours`);

        // Add timezone info
        console.log(`⏰ All times are East Africa Time (EAT / UTC+3) - Your local time`);
        console.log(`📍 Source: flashscore.co.ke (Kenyan domain)`);
    }

    async saveMatches(matches) {
        // Sort matches
        const sorted = [...matches].sort((a, b) => a.time.localeCompare(b.time));

        // Group by hour for JSON
        const byHour = {};
        sorted.forEach(m => {
            const hour = m.time.split(':')[0];
            if (!byHour[hour]) byHour[hour] = [];
            byHour[hour].push({
                home: m.home,
                away: m.away,
                time: m.time
            });
        });

        const data = {
            timestamp: new Date().toISOString(),
            url: 'https://www.flashscore.co.ke/football/',
            timezone: 'East Africa Time (EAT / UTC+3)',
            stats: {
                totalMatches: sorted.length,
                hoursWithMatches: Object.keys(byHour).length,
                earliestMatch: sorted[0]?.time,
                latestMatch: sorted[sorted.length-1]?.time
            },
            matchesByHour: byHour,
            allMatches: sorted
        };

        // 1. Save latest version (always overwrites)
        const latestFile = path.join(this.dataDir, 'flashscore_latest.json');
        await fs.writeFile(latestFile, JSON.stringify(data, null, 2));
        console.log(`\n💾 Latest matches saved to ${latestFile}`);

        // 2. Save dated version (for history)
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        const historyDir = path.join(this.dataDir, 'history', year.toString(), month);
        await fs.mkdir(historyDir, { recursive: true });

        const historyFile = path.join(historyDir, `flashscore_${year}-${month}-${day}.json`);
        await fs.writeFile(historyFile, JSON.stringify(data, null, 2));
        console.log(`💾 History saved to ${historyFile}`);

        // 3. Clean up old files (older than 7 days)
        await this.cleanupOldFiles();
    }

    async cleanupOldFiles() {
        try {
            const historyDir = path.join(this.dataDir, 'history');
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;

            // Walk through year/month folders
            const years = await fs.readdir(historyDir).catch(() => []);

            for (const year of years) {
                const yearPath = path.join(historyDir, year);
                const months = await fs.readdir(yearPath).catch(() => []);

                for (const month of months) {
                    const monthPath = path.join(yearPath, month);
                    const files = await fs.readdir(monthPath).catch(() => []);

                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            const filePath = path.join(monthPath, file);
                            const stats = await fs.stat(filePath);

                            // If file is older than 7 days, delete it
                            if (now - stats.mtimeMs > sevenDays) {
                                await fs.unlink(filePath);
                                console.log(`🧹 Deleted old file: ${filePath}`);
                            }
                        }
                    }

                    // Remove empty month folder
                    const remaining = await fs.readdir(monthPath).catch(() => []);
                    if (remaining.length === 0) {
                        await fs.rmdir(monthPath);
                        console.log(`📁 Removed empty folder: ${monthPath}`);
                    }
                }

                // Remove empty year folder
                const remainingMonths = await fs.readdir(yearPath).catch(() => []);
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

    async verifyExtraction() {
        console.log('\n🔍 Verifying extraction...');

        const stats = await this.page.evaluate(() => {
            const allMatchElements = document.querySelectorAll('.event__match');
            let total = 0;
            let valid = 0;
            let finished = 0;

            allMatchElements.forEach(match => {
                if (match.className.includes('header')) return;

                total++;
                const timeEl = match.querySelector('.event__time');
                if (timeEl) {
                    const time = timeEl.innerText.trim();
                    if (time.includes(':')) {
                        // Check if it's a finished match (has FRO, FT, etc.)
                        if (time.includes('FRO') || time.includes('FT') || time.includes('-')) {
                            finished++;
                        } else {
                            valid++;
                        }
                    }
                }
            });

            return { total, valid, finished };
        });

        console.log(`   Total match elements: ${stats.total}`);
        console.log(`   Scheduled matches: ${stats.valid}`);
        console.log(`   Finished matches (filtered out): ${stats.finished}`);

        return stats;
    }

    async run() {
        try {
            await this.init();
            await this.navigateToScheduled();

            // Get initial valid match count
            const initialStats = await this.verifyExtraction();
            console.log(`\n📊 Initially visible scheduled matches: ${initialStats.valid}`);

            // Expand all sections
            const expanded = await this.expandAllSections();

            // Get final valid match count
            const finalStats = await this.verifyExtraction();
            console.log(`\n📊 Final scheduled match count: ${finalStats.valid}`);

            // Extract all matches (filtered)
            const matches = await this.extractAllMatches();
            this.displayMatches(matches);

            // Save matches
            await this.saveMatches(matches);

            // Summary
            console.log('\n' + '='.repeat(80));
            console.log('📊 FINAL SUMMARY');
            console.log('='.repeat(80));
            console.log(`📈 Initial scheduled matches: ${initialStats.valid}`);
            console.log(`📈 Expanded matches: +${expanded}`);
            console.log(`📈 Total scheduled matches: ${finalStats.valid}`);
            console.log(`📊 Extracted matches: ${matches.length}`);
            console.log(`✅ Extraction rate: ${Math.round(matches.length/finalStats.valid*100)}%`);
            console.log(`⏰ Timezone: East Africa Time (EAT / UTC+3) - Kenya local time`);
            console.log(`📁 Data directory: ${this.dataDir}`);

            if (finalStats.finished > 0) {
                console.log(`\n🗑️  Filtered out ${finalStats.finished} finished matches (FRO, FT, etc.)`);
            }

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await this.delay(5000);
            await this.browser.close();
        }
    }
}

// Run the scraper
new FlashscoreScraper().run().catch(console.error);