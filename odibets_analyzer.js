// odibets-analyzer-fixed.js
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class OdibetsAnalyzer {
    constructor() {
        this.browser = null;
        this.page = null;
        this.analysis = {
            url: 'https://www.odibets.com/sports/soccer',
            timestamp: new Date().toISOString(),
            statistics: {
                totalElements: 0,
                leagues: 0,
                matches: 0,
                expandableButtons: 0
            }
        };
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('🔍 ODIBETS WEBSITE ANALYZER - FIXED');
        console.log('='.repeat(80));

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1366, height: 768 }
        });

        this.page = await this.browser.newPage();
    }

    async navigateToSoccer() {
        console.log('\n📡 Navigating to Odibets soccer page...');
        await this.page.goto('https://www.odibets.com/sports/soccer', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ Page loaded successfully');
        await this.delay(3000);
    }

    async analyzePageStructure() {
        console.log('\n🔬 Analyzing page structure...\n');

        const structure = await this.page.evaluate(() => {
            const results = {
                pageInfo: {
                    title: document.title,
                    elementCount: document.querySelectorAll('*').length,
                    headings: {
                        h1: document.querySelectorAll('h1').length,
                        h2: document.querySelectorAll('h2').length,
                        h3: document.querySelectorAll('h3').length,
                        h4: document.querySelectorAll('h4').length,
                        h5: document.querySelectorAll('h5').length
                    }
                },
                leagues: [],
                matches: [],
                expandableElements: []
            };

            // Find league containers (from the analysis we saw "Top Leagues" and country listings)
            const leagueElements = document.querySelectorAll('[class*="league"], [class*="competition"], [class*="tournament"]');
            leagueElements.forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length < 100 && !text.includes('vs')) {
                    results.leagues.push({
                        text: text.substring(0, 50),
                        classes: el.className,
                        tag: el.tagName
                    });
                }
            });

            // Find match candidates - look for elements with odds patterns
            const allElements = document.querySelectorAll('div, span, tr, td');
            allElements.forEach(el => {
                const text = el.innerText?.trim() || '';

                // Look for odds pattern (numbers like 1.25, 2.10, etc.)
                const oddsMatches = text.match(/\b\d+\.\d{2}\b/g);

                // Look for time pattern (HH:MM)
                const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);

                // Look for team names (words followed by vs/V/-)
                const hasTeams = text.includes(' vs ') || text.includes(' V ') || text.includes(' - ');

                if (oddsMatches && oddsMatches.length >= 2 && (timeMatch || hasTeams)) {
                    results.matches.push({
                        text: text.substring(0, 100),
                        classes: el.className,
                        tag: el.tagName,
                        oddsCount: oddsMatches.length,
                        sampleOdds: oddsMatches.slice(0, 3),
                        time: timeMatch ? timeMatch[1] : 'unknown'
                    });
                }
            });

            // Find expandable elements (chevrons, carets, etc.)
            const expandableSelectors = [
                '[class*="chevron"]',
                '[class*="caret"]',
                '[class*="expand"]',
                '[class*="collapse"]',
                '[class*="accordion"]',
                '[class*="dropdown"]',
                '[class*="toggle"]',
                'button',
                '[role="button"]',
                '[aria-expanded]'
            ];

            expandableSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const text = el.innerText?.trim() || '';
                    if (text && text.length < 50 && !text.includes('vs')) {
                        results.expandableElements.push({
                            text: text.substring(0, 30),
                            classes: el.className,
                            tag: el.tagName,
                            selector: selector
                        });
                    }
                });
            });

            return results;
        });

        this.analysis.structure = structure;
        this.displayStructureAnalysis(structure);
        return structure;
    }

    displayStructureAnalysis(structure) {
        console.log('\n📊 PAGE STRUCTURE ANALYSIS');
        console.log('='.repeat(80));

        console.log(`\n📄 Page Info:`);
        console.log(`   Title: ${structure.pageInfo.title}`);
        console.log(`   Total elements: ${structure.pageInfo.elementCount}`);
        console.log(`   Headings: H3:${structure.pageInfo.headings.h3} H5:${structure.pageInfo.headings.h5}`);

        console.log(`\n🏆 LEAGUES FOUND: ${structure.leagues.length}`);
        console.log('-'.repeat(60));
        structure.leagues.slice(0, 15).forEach((league, i) => {
            console.log(`   ${i+1}. ${league.text}`);
        });

        console.log(`\n⚽ MATCH CANDIDATES FOUND: ${structure.matches.length}`);
        console.log('-'.repeat(60));
        structure.matches.slice(0, 10).forEach((match, i) => {
            console.log(`\n   ${i+1}. ${match.text}`);
            console.log(`      Time: ${match.time}, Odds: ${match.sampleOdds.join(', ')}`);
            console.log(`      Class: ${match.classes.substring(0, 50)}...`);
        });

        console.log(`\n🔽 EXPANDABLE ELEMENTS FOUND: ${structure.expandableElements.length}`);
        console.log('-'.repeat(60));

        // Group by text to see unique expandable elements
        const uniqueExpandable = new Map();
        structure.expandableElements.forEach(el => {
            if (!uniqueExpandable.has(el.text)) {
                uniqueExpandable.set(el.text, el);
            }
        });

        Array.from(uniqueExpandable.values()).slice(0, 15).forEach((el, i) => {
            console.log(`   ${i+1}. "${el.text}" (${el.tag})`);
            console.log(`      Class: ${el.classes || 'none'}`);
        });

        this.analysis.statistics = {
            totalElements: structure.pageInfo.elementCount,
            leagues: structure.leagues.length,
            matches: structure.matches.length,
            expandableButtons: structure.expandableElements.length
        };
    }

    async testExpandableElements() {
        console.log('\n🧪 TESTING EXPANDABLE ELEMENTS');
        console.log('='.repeat(80));

        const beforeMatchCount = await this.page.evaluate(() => {
            return document.querySelectorAll('[class*="match"], [class*="event"], [class*="game"]').length;
        });
        console.log(`\n📊 Matches visible before expansion: ${beforeMatchCount}`);

        // Try to click on league headers and expandable elements
        const clickResults = await this.page.evaluate(() => {
            const results = {
                clicked: [],
                failed: [],
                byCategory: {}
            };

            // Strategy 1: Click on elements that look like league headers
            const leagueHeaders = document.querySelectorAll(
                '[class*="league"] > div, [class*="competition"] > div, h3, h5, ' +
                '[class*="header"]:not(.header-top), [class*="title"]:not(.games-title)'
            );

            leagueHeaders.forEach((el, index) => {
                const text = el.innerText?.trim() || '';
                if (text && text.length < 50 && !text.includes('vs') && !text.includes('deposit')) {
                    try {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.click();
                        results.clicked.push({
                            text: text.substring(0, 30),
                            tag: el.tagName,
                            type: 'league-header'
                        });

                        // Track by category
                        if (text.includes('League') || text.includes('Cup') || text.includes('Liga')) {
                            results.byCategory[text] = (results.byCategory[text] || 0) + 1;
                        }
                    } catch (e) {
                        results.failed.push(text.substring(0, 30));
                    }
                }
            });

            // Strategy 2: Click on chevron/caret elements
            document.querySelectorAll('[class*="chevron"], [class*="caret"]').forEach(el => {
                try {
                    const parent = el.parentElement;
                    if (parent) {
                        parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parent.click();
                        results.clicked.push({
                            text: 'chevron-icon',
                            tag: parent.tagName,
                            type: 'chevron'
                        });
                    }
                } catch (e) {}
            });

            return results;
        });

        console.log(`\n✅ Clicked on ${clickResults.clicked.length} elements`);

        // Show unique categories clicked
        const categories = Object.keys(clickResults.byCategory);
        if (categories.length > 0) {
            console.log('\n📋 Categories clicked:');
            categories.slice(0, 10).forEach(cat => {
                console.log(`   • ${cat}`);
            });
        }

        await this.delay(3000);

        const afterMatchCount = await this.page.evaluate(() => {
            return document.querySelectorAll('[class*="match"], [class*="event"], [class*="game"]').length;
        });

        console.log(`\n📊 Matches visible after expansion: ${afterMatchCount}`);
        console.log(`📈 New matches revealed: ${afterMatchCount - beforeMatchCount}`);

        this.analysis.expansionTest = {
            beforeCount: beforeMatchCount,
            afterCount: afterMatchCount,
            newMatches: afterMatchCount - beforeMatchCount,
            clicksPerformed: clickResults.clicked.length
        };
    }

    async extractMatchPatterns() {
        console.log('\n🔍 EXTRACTING MATCH PATTERNS');
        console.log('='.repeat(80));

        const patterns = await this.page.evaluate(() => {
            const matches = [];

            // Look for rows that contain match information
            const potentialRows = document.querySelectorAll(
                'div[class*="row"], tr, div[class*="item"], div[class*="event"]'
            );

            potentialRows.forEach(row => {
                const html = row.outerHTML;
                const text = row.innerText?.trim() || '';

                // Check if this looks like a match row
                const hasTime = text.match(/\b(\d{1,2}:\d{2})\b/);
                const hasOdds = text.match(/\b\d+\.\d{2}\b/g);
                const hasVs = text.includes(' vs ') || text.includes(' V ');

                if ((hasTime || hasOdds) && hasVs) {
                    // Try to identify team names
                    const teamParts = text.split(/\s+(?:vs|V|VS|-)\s+/);
                    if (teamParts.length === 2) {
                        const home = teamParts[0].trim();
                        const away = teamParts[1].trim();

                        // Try to find odds containers
                        const oddsElements = row.querySelectorAll('button, span[class*="odd"], div[class*="odd"]');
                        const odds = [];
                        oddsElements.forEach(oddEl => {
                            const oddText = oddEl.innerText?.trim();
                            if (oddText && oddText.match(/^\d+\.\d{2}$/)) {
                                odds.push(oddText);
                            }
                        });

                        matches.push({
                            home,
                            away,
                            time: hasTime ? hasTime[1] : 'TBD',
                            odds: odds.slice(0, 3),
                            rowClasses: row.className,
                            sample: text.substring(0, 100)
                        });
                    }
                }
            });

            return matches.slice(0, 20); // Return first 20 matches
        });

        console.log(`\n📊 Found ${patterns.length} match patterns`);

        if (patterns.length > 0) {
            console.log('\n📝 Sample Matches:');
            patterns.slice(0, 5).forEach((match, i) => {
                console.log(`\n   Match ${i+1}:`);
                console.log(`      ${match.home} vs ${match.away}`);
                console.log(`      Time: ${match.time}`);
                console.log(`      Odds: ${match.odds.join(' | ')}`);
                console.log(`      Row class: ${match.rowClasses.substring(0, 50)}...`);
            });

            // Determine common patterns
            const commonClasses = {};
            patterns.forEach(m => {
                const classNames = m.rowClasses.split(' ');
                classNames.forEach(cls => {
                    if (cls) commonClasses[cls] = (commonClasses[cls] || 0) + 1;
                });
            });

            console.log('\n📋 Common row classes:');
            Object.entries(commonClasses)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([cls, count]) => {
                    console.log(`   • .${cls} (${count} occurrences)`);
                });
        }

        this.analysis.matchPatterns = patterns;
    }

    async generateScraperRecommendations() {
        console.log('\n🎯 GENERATING SCRAPER RECOMMENDATIONS');
        console.log('='.repeat(80));

        const recommendations = {
            expansion: [
                '// Click on league headers (look for text containing "League", "Cup", "Championship")',
                '// Click on chevron/caret icons to expand sections',
                '// Click on country headers (e.g., "Austria Amateur", "Romania")'
            ],
            selectors: {
                matchRows: [
                    'div[class*="event"]',
                    'div[class*="match"]',
                    'tr:has(td)'
                ],
                teamNames: [
                    'Extract from text pattern "Team A vs Team B"',
                    'Look for text before and after "vs" or "V"'
                ],
                time: [
                    'Look for HH:MM pattern in the row text',
                    'Check for elements with time-related classes'
                ],
                odds: [
                    'Look for button elements containing decimal numbers (1.25, 2.10, etc.)',
                    'Check spans with odd/odds in class name'
                ]
            },
            workflow: [
                '1. Navigate to page and wait for content to load',
                '2. Click on all league headers to expand matches',
                '3. Click on chevron icons to expand any collapsed sections',
                '4. Wait for content to load after each click',
                '5. Extract match rows using the identified selectors',
                '6. Parse team names from text pattern',
                '7. Extract times using regex',
                '8. Collect odds from button elements'
            ]
        };

        console.log('\n📌 RECOMMENDED SCRAPER APPROACH:\n');
        recommendations.workflow.forEach(step => console.log(`   ${step}`));

        console.log('\n🔍 RECOMMENDED SELECTORS:\n');
        Object.entries(recommendations.selectors).forEach(([key, value]) => {
            console.log(`   ${key}:`);
            value.forEach(v => console.log(`      • ${v}`));
        });

        this.analysis.recommendations = recommendations;
    }

    async saveAnalysis() {
        const filename = `odibets_analysis_${Date.now()}.json`;

        const summary = {
            timestamp: this.analysis.timestamp,
            url: this.analysis.url,
            statistics: this.analysis.statistics,
            expansionTest: this.analysis.expansionTest,
            matchSample: this.analysis.matchPatterns?.slice(0, 5),
            recommendations: this.analysis.recommendations
        };

        await fs.writeFile(filename, JSON.stringify(summary, null, 2));
        console.log(`\n💾 Analysis saved to ${filename}`);
    }

    async run() {
        try {
            await this.init();
            await this.navigateToSoccer();

            await this.analyzePageStructure();
            await this.testExpandableElements();
            await this.extractMatchPatterns();
            await this.generateScraperRecommendations();
            await this.saveAnalysis();

            console.log('\n' + '='.repeat(80));
            console.log('📊 ANALYSIS COMPLETE');
            console.log('='.repeat(80));
            console.log(`\n📈 Summary:`);
            console.log(`   • Total elements: ${this.analysis.statistics.totalElements}`);
            console.log(`   • Leagues detected: ${this.analysis.statistics.leagues}`);
            console.log(`   • Match candidates: ${this.analysis.statistics.matches}`);
            console.log(`   • Expandable elements: ${this.analysis.statistics.expandableButtons}`);
            console.log(`   • New matches revealed: ${this.analysis.expansionTest?.newMatches || 0}`);

            console.log('\n✅ Analysis complete! Check the JSON file for details.');
            console.log('   Use the recommendations above to build your scraper.\n');

        } catch (error) {
            console.error('❌ Analysis error:', error);
        } finally {
            await this.delay(5000);
            await this.browser.close();
        }
    }
}

// Run the analyzer
new OdibetsAnalyzer().run().catch(console.error);