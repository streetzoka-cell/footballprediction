// backend/check-firestore.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function checkData() {
  console.log("Checking Firestore for Live Matches...\n");
  
  // 1. Check the liveFixtures collection
  const liveSnap = await db.collection('liveFixtures').limit(5).get();
  console.log("--- liveFixtures Collection (Raw Data) ---");
  liveSnap.forEach(doc => {
    const m = doc.data();
    console.log(`${m.homeTeamName} vs ${m.awayTeamName} | Status: ${m.status} | Score: ${m.goalsHome} - ${m.goalsAway}`);
  });

  // 2. Check the fixture_snapshots document for today
  const today = new Date().toISOString().split('T')[0];
  const snap = await db.collection('fixture_snapshots').doc(today).get();
  
  if (snap.exists) {
    const data = snap.data();
    console.log("\n--- fixture_snapshots Document (Frontend Data) ---");
    console.log(`Matches array length: ${data.matches?.length || 0}`);
    console.log(`Live array length: ${data.live?.length || 0}`);
    
    if (data.live && data.live.length > 0) {
      console.log("\nLive Matches in Snapshot:");
      data.live.slice(0, 5).forEach(m => {
        console.log(`${m.homeTeamName} vs ${m.awayTeamName} | Status: ${m.status} | Score: ${m.goalsHome} - ${m.goalsAway}`);
      });
    }
  } else {
    console.log("\nNo snapshot found for today!");
  }
  
  process.exit(0);
}

checkData().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});