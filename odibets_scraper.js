// odibets-scraper-optimized.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class OdibetsScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://www.odibets.com/sports/soccer';
        this.allMatches = []; // Store all matches
        this.peakVisibleMatches = 0;
        this.finalVisibleMatches = 0;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('⚽ ODIBETS SOCCER MATCH SCRAPER - OPTIMIZED');
        console.log('='.repeat(80));

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();
    }

    async navigateToSoccer() {
        console.log('\n📡 Loading Odibets soccer page...');
        await this.page.goto(this.baseUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ Page loaded');
        await this.delay(5000);
    }

    async getVisibleMatchCount() {
        return await this.page.evaluate(() => {
            return document.querySelectorAll('a.t').length;
        });
    }

    async expandAllLeagues() {
        console.log('\n🔍 Expanding all leagues to reveal matches...');

        let clickCount = 0;

        // Scroll to load content
        await this.page.evaluate(() => {
            window.scrollBy(0, 500);
        });
        await this.delay(2000);

        // Find and click ALL collapsed leagues in one go
        const clicked = await this.page.evaluate(() => {
            let count = 0;
            const elements = document.querySelectorAll('div, span, h3, h4, h5, a');

            elements.forEach(el => {
                const text = el.innerText?.trim() || '';
                const match = text.match(/(.+?)\s*\((\d+)\)$/);

                if (match && !text.includes('vs') && !text.includes(':')) {
                    const leagueName = match[1].trim();
                    const matchCount = parseInt(match[2]);

                    // Check if this league is already expanded
                    let isExpanded = false;
                    let parent = el.parentElement;
                    if (parent) {
                        let next = parent.nextElementSibling;
                        for (let i = 0; i < 3 && next; i++) {
                            if (next.querySelector('a.t')) {
                                isExpanded = true;
                                break;
                            }
                            next = next.nextElementSibling;
                        }
                    }

                    if (!isExpanded && matchCount > 0) {
                        try {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.click();
                            count++;
                        } catch (e) {}
                    }
                }
            });

            return count;
        });

        console.log(`   ✅ Clicked ${clicked} leagues to expand`);
        await this.delay(3000); // Wait for matches to load

        return clicked;
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
        this.finalVisibleMatches = visibleCount;

        console.log(`   📊 Found ${matches.length} matches (site shows ${visibleCount})`);

        return matches;
    }

    async run() {
        try {
            await this.init();
            await this.navigateToSoccer();

            // Get initial match count
            const initialCount = await this.getVisibleMatchCount();
            console.log(`\n📊 Initially visible matches: ${initialCount}`);

            // ONE expansion to reveal all matches
            await this.expandAllLeagues();

            // Extract ALL matches after expansion
            const allMatches = await this.extractAllMatches();

            // Display results
            console.log('\n' + '='.repeat(100));
            console.log(`📋 ODIBETS MATCHES - ${new Date().toLocaleDateString()}`);
            console.log('='.repeat(100));
            console.log(`📊 Site shows: ${this.finalVisibleMatches} matches`);
            console.log(`📊 Extracted: ${allMatches.length} matches`);
            console.log('-'.repeat(100));

            // Group by date
            const byDate = {};
            allMatches.forEach(m => {
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
                byDate[date].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
                byDate[date].forEach(match => {
                    console.log(`${globalIndex.toString().padStart(3)}. ${match.home.padEnd(30)} vs ${match.away.padEnd(30)} @ ${match.kickoff}`);
                    globalIndex++;
                });
            }

            console.log('='.repeat(100));
            console.log(`Total matches: ${allMatches.length}`);

            // Save to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const filename = `odibets_matches_${timestamp}.json`;

            await fs.writeFile(filename, JSON.stringify({
                timestamp: new Date().toISOString(),
                url: this.baseUrl,
                stats: {
                    siteShows: this.finalVisibleMatches,
                    extracted: allMatches.length
                },
                matches: allMatches
            }, null, 2));

            console.log(`\n💾 Saved ${allMatches.length} matches to ${filename}`);

            // Save as CSV
            const csvFilename = filename.replace('.json', '.csv');
            let csvContent = 'Home Team,Away Team,Kickoff,Date\n';
            allMatches.forEach(m => {
                csvContent += `${m.home},${m.away},${m.kickoff},${m.date}\n`;
            });

            await fs.writeFile(csvFilename, csvContent);
            console.log(`💾 Saved ${allMatches.length} matches to ${csvFilename}`);

            console.log('\n' + '='.repeat(80));
            console.log('📊 SCRAPING COMPLETE');
            console.log('='.repeat(80));
            console.log(`📊 Initial matches: ${initialCount}`);
            console.log(`📊 Final matches: ${allMatches.length}`);
            console.log(`📊 Site shows: ${this.finalVisibleMatches} matches`);

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await this.delay(5000);
            await this.browser.close();
        }
    }
}

// Run the scraper
new OdibetsScraper().run().catch(console.error);