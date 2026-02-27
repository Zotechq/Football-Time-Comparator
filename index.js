// index.js
const fs = require('fs').promises;
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * Run a scraper file and get its output
 */
async function runScraper(scraperFile) {
    try {
        console.log(`\n📡 Running ${scraperFile}...`);
        const { stdout, stderr } = await execPromise(`node ${scraperFile}`);

        if (stderr) {
            console.log(`⚠️  ${scraperFile} warnings:`, stderr);
        }

        // Look for the saved JSON file in the output
        const match = stdout.match(/Saved \d+ matches to ([\w\-\.]+\.json)/);
        if (match) {
            const filename = match[1];
            console.log(`✅ Found output file: ${filename}`);

            // Read the JSON file
            const data = await fs.readFile(filename, 'utf8');
            return JSON.parse(data);
        }

        // Try alternative pattern for Flashscore
        const flashscoreMatch = stdout.match(/💾 Matches saved to ([\w\-\.]+\.json)/);
        if (flashscoreMatch) {
            const filename = flashscoreMatch[1];
            console.log(`✅ Found output file: ${filename}`);

            const data = await fs.readFile(filename, 'utf8');
            return JSON.parse(data);
        }

        // Try alternative pattern for Odibets
        const odibetsMatch = stdout.match(/💾 Saved \d+ matches to ([\w\-\.]+\.json)/);
        if (odibetsMatch) {
            const filename = odibetsMatch[1];
            console.log(`✅ Found output file: ${filename}`);

            const data = await fs.readFile(filename, 'utf8');
            return JSON.parse(data);
        }

        console.log(`⚠️  Could not find output file in ${scraperFile} output`);
        return null;
    } catch (error) {
        console.log(`❌ Error running ${scraperFile}:`, error.message);
        return null;
    }
}

/**
 * Extract matches from Flashscore JSON (handles different structures)
 */
function extractFlashscoreMatches(data) {
    if (!data) return [];

    // Case 1: Direct matches array
    if (data.matches && Array.isArray(data.matches)) {
        return data.matches;
    }

    // Case 2: Matches inside allMatches or matches property
    if (data.allMatches && Array.isArray(data.allMatches)) {
        return data.allMatches;
    }

    // Case 3: Matches inside a nested structure
    if (data.matchesByHour) {
        const allMatches = [];
        Object.values(data.matchesByHour).forEach(hourMatches => {
            if (Array.isArray(hourMatches)) {
                allMatches.push(...hourMatches);
            }
        });
        return allMatches;
    }

    // Case 4: Data itself is an array of matches
    if (Array.isArray(data)) {
        return data;
    }

    return [];
}

/**
 * Extract matches from Odibets JSON
 */
function extractOdibetsMatches(data) {
    if (!data) return [];

    // Case 1: Direct matches array
    if (data.matches && Array.isArray(data.matches)) {
        return data.matches;
    }

    // Case 2: Data itself is an array
    if (Array.isArray(data)) {
        return data;
    }

    // Case 3: Matches inside allMatches
    if (data.allMatches && Array.isArray(data.allMatches)) {
        return data.allMatches;
    }

    return [];
}

/**
 * Normalize team name for matching across different websites
 */
function normalizeTeamName(name) {
    if (!name) return '';

    return name.toLowerCase()
        .replace(/\s+fc$|\s+f\.c\.$|\s+united$|\s+utd$|\s+city$|\s+cf$|\s+f\.c\.$/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Create a normalized key to match same teams across different websites
 */
function normalizeMatchKey(home, away) {
    const homeNorm = normalizeTeamName(home);
    const awayNorm = normalizeTeamName(away);

    // Sort teams alphabetically to handle home/away mismatches
    const teams = [homeNorm, awayNorm].sort();
    return `${teams[0]}-${teams[1]}`;
}

/**
 * Calculate minutes difference between two times
 */
function calculateTimeDifference(time1, time2) {
    try {
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);

        const minutes1 = h1 * 60 + m1;
        const minutes2 = h2 * 60 + m2;

        return Math.abs(minutes1 - minutes2);
    } catch {
        return 999;
    }
}

/**
 * Compare kickoff times between Flashscore and Odibets
 */
function compareSources(flashscoreData, odibetsData) {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 COMPARING KICKOFF TIMES: FLASHSCORE vs ODIBETS');
    console.log('='.repeat(80));

    // Extract matches from both sources using the helper functions
    const flashscoreMatches = extractFlashscoreMatches(flashscoreData);
    const odibetsMatches = extractOdibetsMatches(odibetsData);

    console.log(`\n📊 Flashscore: ${flashscoreMatches.length} matches`);
    console.log(`📊 Odibets: ${odibetsMatches.length} matches`);

    // Create lookup dictionaries
    const flashscoreDict = {};
    const odibetsDict = {};

    // Handle Flashscore matches
    flashscoreMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        // Flashscore uses 'time' or 'kickoff' property
        const time = m.time || m.kickoff || '';
        const date = m.date || new Date().toLocaleDateString('en-GB').split('/').slice(0,2).join('/');

        if (home && away && time) {
            const key = normalizeMatchKey(home, away);
            flashscoreDict[key] = {
                home,
                away,
                time,
                date,
                original: m
            };
        }
    });

    // Handle Odibets matches
    odibetsMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        const time = m.kickoff || '';
        const date = m.date || new Date().toLocaleDateString('en-GB').split('/').slice(0,2).join('/');

        if (home && away && time) {
            const key = normalizeMatchKey(home, away);
            odibetsDict[key] = {
                home,
                away,
                time,
                date,
                original: m
            };
        }
    });

    // Get all unique match keys
    const allKeys = new Set([
        ...Object.keys(flashscoreDict),
        ...Object.keys(odibetsDict)
    ]);

    console.log(`\n📊 Total unique matches found: ${allKeys.size}`);

    const discrepancies = [];
    const matched = [];
    const onlyInFlashscore = [];
    const onlyInOdibets = [];

    for (const key of allKeys) {
        const flashscoreMatch = flashscoreDict[key];
        const odibetsMatch = odibetsDict[key];

        if (flashscoreMatch && odibetsMatch) {
            // Match appears in both sources
            if (flashscoreMatch.time !== odibetsMatch.time) {
                // Time conflict!
                const conflict = {
                    home: flashscoreMatch.home,
                    away: flashscoreMatch.away,
                    flashscore: flashscoreMatch.time,
                    odibets: odibetsMatch.time,
                    date: flashscoreMatch.date || odibetsMatch.date,
                    timestamp: new Date().toISOString()
                };
                discrepancies.push(conflict);

                console.log('\n' + '!'.repeat(70));
                console.log('🚨 TIME CONFLICT FOUND!');
                console.log('!'.repeat(70));
                console.log(`Match: ${flashscoreMatch.home} vs ${flashscoreMatch.away}`);
                console.log(`Date: ${flashscoreMatch.date || odibetsMatch.date}`);
                console.log(`   Flashscore: ${flashscoreMatch.time}`);
                console.log(`   Odibets: ${odibetsMatch.time}`);

                const diff = calculateTimeDifference(flashscoreMatch.time, odibetsMatch.time);
                console.log(`   Difference: ${diff} minutes`);
                console.log('!'.repeat(70));
            } else {
                matched.push(key);
            }
        } else if (flashscoreMatch && !odibetsMatch) {
            onlyInFlashscore.push(key);
        } else if (!flashscoreMatch && odibetsMatch) {
            onlyInOdibets.push(key);
        }
    }

    console.log(`\n📊 Detailed Summary:`);
    console.log(`   ✅ Matches in both sources with same time: ${matched.length}`);
    console.log(`   ❌ Conflicts found: ${discrepancies.length}`);
    console.log(`   📍 Only in Flashscore: ${onlyInFlashscore.length}`);
    console.log(`   📍 Only in Odibets: ${onlyInOdibets.length}`);

    return discrepancies;
}

/**
 * Save discrepancies to file
 */
async function saveDiscrepancies(discrepancies) {
    if (!discrepancies || discrepancies.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `conflicts_${timestamp}.json`;

    await fs.writeFile(filename, JSON.stringify(discrepancies, null, 2));
    console.log(`\n💾 Saved ${discrepancies.length} conflicts to ${filename}`);

    // Also append to running log
    const logFilename = 'conflict_log.json';
    try {
        let log = [];
        try {
            const logData = await fs.readFile(logFilename, 'utf8');
            log = JSON.parse(logData);
        } catch {
            // File doesn't exist yet
        }

        log.push({
            timestamp: new Date().toISOString(),
            conflicts: discrepancies
        });

        await fs.writeFile(logFilename, JSON.stringify(log, null, 2));
        console.log(`📝 Updated running log: ${logFilename}`);
    } catch (error) {
        console.log(`⚠️ Could not update log: ${error.message}`);
    }
}

/**
 * Print summary
 */
function printSummary(flashscoreCount, odibetsCount, discrepancies) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log(`📈 Flashscore matches: ${flashscoreCount}`);
    console.log(`📈 Odibets matches: ${odibetsCount}`);
    console.log(`📈 TOTAL matches: ${flashscoreCount + odibetsCount}`);
    console.log(`🚨 Conflicts found: ${discrepancies.length}`);

    if (discrepancies.length > 0) {
        console.log('\n❌ CONFLICT DETAILS:');
        discrepancies.forEach((d, i) => {
            console.log(`\n   ${i+1}. ${d.home} vs ${d.away}`);
            console.log(`      Date: ${d.date}`);
            console.log(`      Flashscore: ${d.flashscore}`);
            console.log(`      Odibets: ${d.odibets}`);
        });
    } else {
        console.log('\n✅ All kickoff times match between both sources!');
    }
    console.log('='.repeat(80));
}

/**
 * Run once (quick test)
 */
async function quickTest() {
    console.log('\n🔧 QUICK TEST MODE - FLASHSCORE vs ODIBETS');
    console.log('='.repeat(60));

    // Run both scrapers
    console.log('\n📊 STEP 1: Running Flashscore scraper...');
    const flashscoreData = await runScraper('./flashscore_scraper.js');

    console.log('\n📊 STEP 2: Running Odibets scraper...');
    const odibetsData = await runScraper('./odibets_scraper.js');

    if (!flashscoreData || !odibetsData) {
        console.log('\n❌ Failed to get data from one or both scrapers');
        return;
    }

    // Extract match counts
    const flashscoreMatches = extractFlashscoreMatches(flashscoreData);
    const odibetsMatches = extractOdibetsMatches(odibetsData);

    // Compare them
    const discrepancies = compareSources(flashscoreData, odibetsData);

    // Print summary
    printSummary(
        flashscoreMatches.length,
        odibetsMatches.length,
        discrepancies
    );

    // Save conflicts if any
    if (discrepancies.length > 0) {
        await saveDiscrepancies(discrepancies);
    }

    return discrepancies;
}

/**
 * Run continuously at specified interval
 */
async function runContinuous(intervalMinutes) {
    console.log(`\n⏳ Running every ${intervalMinutes} minutes...`);
    console.log('Press Ctrl+C to stop\n');

    let runCount = 0;

    while (true) {
        runCount++;
        console.log(`\n${'#'.repeat(60)}`);
        console.log(`🔄 RUN #${runCount} - ${new Date().toLocaleString()}`);
        console.log(`${'#'.repeat(60)}`);

        try {
            await quickTest();

            console.log(`\n⏳ Waiting ${intervalMinutes} minutes until next run...`);
            await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60000));

        } catch (error) {
            console.log(`❌ Error in run #${runCount}: ${error.message}`);
            console.log('⏳ Waiting 5 minutes before retry...');
            await new Promise(resolve => setTimeout(resolve, 5 * 60000));
        }
    }
}

/**
 * Clean up old files
 */
async function cleanupOldFiles() {
    try {
        const files = await fs.readdir('.');
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        for (const file of files) {
            // Delete flashscore and odibets JSON files older than 1 day
            if ((file.startsWith('flashscore_matches') || file.startsWith('odibets_matches')) && file.endsWith('.json')) {
                const stats = await fs.stat(file);
                if (now - stats.mtimeMs > oneDay) {
                    await fs.unlink(file);
                    console.log(`🧹 Deleted old file: ${file}`);
                }
            }
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}

/**
 * Main function
 */
async function main() {
    console.log('\n⚽ KICKOFF TIME COMPARISON - FLASHSCORE vs ODIBETS');
    console.log('='.repeat(60));
    console.log('1. Run once (quick test)');
    console.log('2. Run continuously (custom interval)');

    // Clean up old files before starting
    await cleanupOldFiles();

    const choice = await question('\nEnter choice (1 or 2): ');

    if (choice === '1') {
        await quickTest();
    } else if (choice === '2') {
        const minutes = await question('Enter interval in minutes: ');
        const interval = parseInt(minutes);

        if (!isNaN(interval) && interval > 0) {
            await runContinuous(interval);
        } else {
            console.log('❌ Invalid number');
        }
    } else {
        console.log('❌ Invalid choice');
    }

    rl.close();
}

// Run the main function
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { compareSources, runScraper, normalizeMatchKey };