const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize Firebase
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});
const db = admin.firestore();

async function test() {
  console.log('Fetching ALL documents from fixture_snapshots collection...');
  
  try {
    const snap = await db.collection('fixture_snapshots').get();
    
    if (snap.empty) {
      console.log('❌ No snapshots found in Firestore at all.');
      return;
    }

    console.log(`✅ Found ${snap.size} date documents in Firestore.\n`);
    console.log('==========================================');
    console.log('   DATE          |   TOTAL MATCHES SAVED   ');
    console.log('==========================================');

    let grandTotal = 0;

    snap.docs.forEach(doc => {
      const dateStr = doc.id;
      const data = doc.data();
      
      // Count matches, live, and finished arrays
      const matchesCount = data.matches?.length || 0;
      const liveCount = data.live?.length || 0;
      const finishedCount = data.finished?.length || 0;
      
      const total = matchesCount + liveCount + finishedCount;
      grandTotal += total;
      
      console.log(`${dateStr}   |   ${total} matches (Matches: ${matchesCount}, Live: ${liveCount}, FT: ${finishedCount})`);
    });

    console.log('==========================================');
    console.log(`TOTAL MATCHES ACROSS ALL DATES: ${grandTotal}\n`);

    // Print a sample match from the first document we find
    const firstDoc = snap.docs[0].data();
    const firstMatchArray = firstDoc.matches || firstDoc.live || firstDoc.finished || [];
    
    if (firstMatchArray.length > 0) {
      console.log('🔍 Sample Match Data Structure (First match found):');
      console.log(JSON.stringify(firstMatchArray[0], null, 2));
    }

  } catch (err) {
    console.error('❌ Error fetching Firestore data:', err.message);
  }
}

test();