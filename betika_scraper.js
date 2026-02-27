// betika_scraper.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class BetikaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://www.betika.com/en-ke/s/soccer';
        this.matches = [];
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('⚽ BETIKA SOCCER MATCH SCRAPER');
        console.log('='.repeat(80));

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();

        await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }

    async navigateToSoccer() {
        console.log('\n📡 Loading Betika soccer page...');
        await this.page.goto(this.baseUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ Page loaded');
        await this.delay(8000); // Wait for dynamic content
    }

    async closePopupIfExists() {
        try {
            const closeButton = await this.page.$('button:contains("Close")');
            if (closeButton) {
                await closeButton.click();
                console.log('✅ Closed popup');
                await this.delay(2000);
            }
        } catch (error) {
            // No popup
        }
    }

    async scrollToLoadAll() {
        console.log('\n📜 Scrolling to load all matches...');

        let previousHeight = 0;
        let sameCount = 0;

        while (sameCount < 3) {
            // Scroll to bottom
            previousHeight = await this.page.evaluate('document.body.scrollHeight');
            await this.page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await this.delay(3000);

            const newHeight = await this.page.evaluate('document.body.scrollHeight');

            if (newHeight === previousHeight) {
                sameCount++;
                console.log(`   No new content loaded (${sameCount}/3)`);
            } else {
                sameCount = 0;
                console.log(`   Content height increased, continuing...`);
            }
        }

        console.log('✅ Reached bottom of page');
    }

    async extractMatches() {
        console.log('\n📋 Extracting matches using Betika pattern...');

        const matches = await this.page.evaluate(() => {
            const results = [];

            // Get all text from the page
            const text = document.body.innerText;
            const lines = text.split('\n').filter(line => line.trim().length > 0);

            // Process lines looking for the pattern:
            // Line with • (league)
            // Next line with date/time (DD/MM, HH:MM)
            // Next line with home team (may end with ...)
            // Next line with away team

            for (let i = 0; i < lines.length - 3; i++) {
                const leagueLine = lines[i].trim();
                const dateLine = lines[i + 1].trim();
                const homeLine = lines[i + 2].trim();
                const awayLine = lines[i + 3].trim();

                // Check if this is a match block
                // 1. League line should contain • and not be too long
                // 2. Date line should match DD/MM, HH:MM pattern
                // 3. Home and away should be team names (not odds)

                const dateMatch = dateLine.match(/(\d{2}\/\d{2}),?\s*(\d{2}:\d{2})/);

                if (leagueLine.includes('•') && dateMatch) {
                    const date = dateMatch[1];
                    const gmtTime = dateMatch[2]; // Original time (likely UTC/GMT)

                    // Clean home team name (remove trailing ...)
                    const home = homeLine.replace(/\.\.\.$/, '').trim();
                    const away = awayLine.trim();

                    // Validate we have real team names
                    if (home && away && home.length > 2 && away.length > 2) {
                        // Check that these aren't odds lines
                        if (!home.match(/^\d+\.\d+$/) && !away.match(/^\d+\.\d+$/)) {

                            // Convert GMT to Kenya time (GMT+3)
                            let kenyaTime = gmtTime;
                            try {
                                const [hours, minutes] = gmtTime.split(':').map(Number);
                                let kenyaHours = hours + 3;
                                if (kenyaHours >= 24) kenyaHours -= 24;
                                kenyaTime = `${kenyaHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                            } catch (e) {
                                // Keep original if conversion fails
                            }

                            results.push({
                                home: home,
                                away: away,
                                kickoff: kenyaTime, // Kenya time
                                originalGmt: gmtTime, // Original for reference
                                date: date,
                                league: leagueLine,
                                bookie: 'Betika'
                            });

                            // Skip ahead 4 lines to avoid reprocessing
                            i += 3;
                        }
                    }
                }
            }

            return results;
        });

        this.matches = matches;
        console.log(`✅ Found ${matches.length} matches`);
        return matches;
    }

    async saveMatches() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `betika_matches_${timestamp}.json`;

        await fs.writeFile(filename, JSON.stringify({
            timestamp: new Date().toISOString(),
            url: this.baseUrl,
            totalMatches: this.matches.length,
            matches: this.matches
        }, null, 2));

        console.log(`\n💾 Saved ${this.matches.length} matches to ${filename}`);

        // Save as CSV
        const csvFilename = filename.replace('.json', '.csv');
        let csvContent = 'Home Team,Away Team,Kickoff (EAT),Original GMT,Date,League,Bookie\n';
        this.matches.forEach(m => {
            csvContent += `${m.home},${m.away},${m.kickoff},${m.originalGmt},${m.date},"${m.league}",${m.bookie}\n`;
        });

        await fs.writeFile(csvFilename, csvContent);
        console.log(`💾 Saved ${this.matches.length} matches to ${csvFilename}`);
    }

    async displayMatches() {
        if (this.matches.length === 0) {
            console.log('\n📭 No matches found');
            return;
        }

        console.log('\n' + '='.repeat(100));
        console.log(`📋 BETIKA MATCHES - ${new Date().toLocaleDateString()}`);
        console.log('='.repeat(100));

        // Group by date
        const byDate = {};
        this.matches.forEach(m => {
            if (!byDate[m.date]) byDate[m.date] = [];
            byDate[m.date].push(m);
        });

        const sortedDates = Object.keys(byDate).sort((a, b) => {
            const [dayA, monthA] = a.split('/').map(Number);
            const [dayB, monthB] = b.split('/').map(Number);
            if (monthA !== monthB) return monthA - monthB;
            return dayA - dayB;
        });

        let globalIndex = 1;
        for (const date of sortedDates) {
            console.log(`\n📅 ${date} (${byDate[date].length} matches)`);

            // Group by league within date
            const byLeague = {};
            byDate[date].forEach(m => {
                if (!byLeague[m.league]) byLeague[m.league] = [];
                byLeague[m.league].push(m);
            });

            const sortedLeagues = Object.keys(byLeague).sort();

            for (const league of sortedLeagues) {
                console.log(`\n   🏆 ${league}`);
                byLeague[league].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
                byLeague[league].forEach(match => {
                    console.log(`   ${globalIndex.toString().padStart(3)}. ${match.home.padEnd(30)} vs ${match.away.padEnd(30)} @ ${match.kickoff} (GMT: ${match.originalGmt})`);
                    globalIndex++;
                });
            }
        }

        console.log('='.repeat(100));
        console.log(`Total matches: ${this.matches.length}`);
    }

    async run() {
        try {
            await this.init();
            await this.navigateToSoccer();
            await this.closePopupIfExists();
            await this.scrollToLoadAll();
            await this.extractMatches();
            await this.displayMatches();
            await this.saveMatches();

            console.log('\n' + '='.repeat(80));
            console.log('📊 SCRAPING COMPLETE');
            console.log('='.repeat(80));

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await this.delay(5000);
            await this.browser.close();
        }
    }
}

// Run the scraper
if (require.main === module) {
    new BetikaScraper().run().catch(console.error);
}

module.exports = { BetikaScraper };