const fs = require('fs');
const path = require('path');

const LAWS_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'laws');

// ★ Safely reads JSON and strips invisible BOM characters that break parsing
function safeReadJSON(filePath) {
    try {
        let fileContent = fs.readFileSync(filePath, 'utf8').trim();
        if (fileContent.charCodeAt(0) === 0xFEFF) {
            fileContent = fileContent.slice(1);
        }
        return JSON.parse(fileContent);
    } catch (e) {
        return null;
    }
}

// ★ NEW Dynamic Routing Logic (Maps keywords to Law Numbers, immune to filenames)
const LAW_KEYWORDS = {
  1: ['pitch', 'field of play', 'dimensions', 'markings', 'goal area', 'crossbar', 'goalpost', 'touchline', 'goal line'],
  2: ['defective ball', 'ball bursts', 'ball pressure', 'ball weight', 'circumference', 'football weigh'],
  3: ['number of players', 'substitute', 'substitution', 'captain', 'extra person', 'minimum players', 'enter the pitch'],
  4: ['equipment', 'jewelry', 'shinguard', 'kit', 'shirt', 'ring', 'tape', 'socks', 'shorts', 'footwear', 'compulsory items'],
  5: ['referee', 'advantage', 'whistle', 'injury', 'caution', 'sent off', 'disciplinary', 'change a decision'],
  6: ['var', 'assistant referee', 'linesman', 'fourth official', 'match official', 'video assistant'],
  7: ['duration', 'half time', 'stoppage time', 'added time', 'abandoned', 'time lost', 'extra time'],
  8: ['kick-off', 'kickoff', 'dropped ball', 'restart of play', 'start of play'],
  9: ['out of play', 'in play', 'wholly crossed', 'touchline', 'goal line', 'referee contact', 'deflects off the referee'],
  10: ['goal scored', 'winning team', 'draw', 'penalty shootout', 'kicks from the penalty mark', 'outcome of the match', 'shootout', 'scoring team'],
  11: ['offside', 'active play', 'deliberate play', 'deflection', 'interfere', 'gaining an advantage'],
  12: ['handball', 'foul', 'misconduct', 'red card', 'yellow card', 'dogso', 'dangerous play', 'tackle', 'strikes', 'kicks', 'sanction', "striker's arm"],
  13: ['free kick', 'direct free kick', 'indirect free kick', 'wall', '10 yards', 'retake'],
  14: ['penalty kick', 'penalty spot', 'encroachment', 'goalkeeper line', 'penalty mark', 'penalty taker', 'saves the penalty'],
  15: ['throw-in', 'throw in', 'throwin'],
  16: ['goal kick', 'goalkick'],
  17: ['corner kick', 'corner arc', 'corner flag', 'cornerkick']
};

function fetchRelevantLawKnowledge(userMessage, allLaws) {
  const msg = userMessage.toLowerCase();
  let routedLawNumbers = new Set();

  for (const [lawNum, keywords] of Object.entries(LAW_KEYWORDS)) {
    if (keywords.some(keyword => msg.includes(keyword))) {
      routedLawNumbers.add(Number(lawNum));
    }
  }

  if (routedLawNumbers.size === 0) return { loaded: false, files: [] };

  let loadedFiles = [];
  for (const lawData of allLaws) {
    if (routedLawNumbers.has(lawData.lawNumber)) {
      loadedFiles.push(`Law ${lawData.lawNumber}`);
    }
  }
  
  return { loaded: true, files: loadedFiles };
}

async function validateKimLocally() {
    console.log('🧠 Starting Kim Local Knowledge Validation (No API Quotas Used)...\n');
    
    if (!fs.existsSync(LAWS_DIR)) {
        console.error(`❌ Laws directory not found at ${LAWS_DIR}`);
        return;
    }

    const lawFiles = fs.readdirSync(LAWS_DIR).filter(file => file.endsWith('.json'));
    const allLaws = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;

    // Load all valid JSON laws into memory first
    for (const file of lawFiles) {
        const filePath = path.join(LAWS_DIR, file);
        const lawData = safeReadJSON(filePath);
        if (lawData) {
            allLaws.push(lawData);
        } else {
            console.error(`\n❌ CRITICAL ERROR: Failed to parse ${file}. Invalid JSON syntax!`);
        }
    }

    for (const lawData of allLaws) {
        console.log(`\n--- Testing ${lawData.title} (Law ${lawData.lawNumber}) ---`);

        if (!lawData.test_cases || lawData.test_cases.length === 0) {
            console.log('⚠️ No test cases found for this law. Skipping...');
            continue;
        }

        for (const test of lawData.test_cases) {
            totalTests++;
            console.log(`\n[Query]: ${test.input}`);
            
            const routingResult = fetchRelevantLawKnowledge(test.input, allLaws);
            
            if (!routingResult.loaded) {
                console.log(`❌ FAILED - Routing did not load any laws for this query!`);
                totalFailed++;
                continue;
            }

            console.log(`[Routed to]: ${routingResult.files.join(', ')}`);

            const expectedLaw = `Law ${lawData.lawNumber}`;
            if (routingResult.files.includes(expectedLaw)) {
                console.log(`✅ PASSED - Kim successfully routed to ${expectedLaw}.`);
                totalPassed++;
            } else {
                console.log(`❌ FAILED - Expected to route to ${expectedLaw}, but routed to: ${routingResult.files.join(', ') || 'None'}`);
                totalFailed++;
            }
        }
    }

    console.log(`\n=== FINAL LOCAL VALIDATION RESULTS ===`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${totalPassed}`);
    console.log(`❌ Failed: ${totalFailed}`);
    
    if (totalPassed === totalTests && totalTests > 0) {
        console.log('\n🏆 Kim\'s knowledge base is structurally sound and routing perfectly! Ready for production.');
    } else {
        console.log('\n⚠️ Routing logic needs adjustment. Review failed tests above.');
    }
}

validateKimLocally().catch(console.error);