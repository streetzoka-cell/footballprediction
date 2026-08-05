// backend-v1/src/services/UserPredictionStore.js

async function processPendingSync(force = false) {

  try {

    const pending = await getPendingPredictions(force);


    if (!pending.length) {

      console.log(
        '[UserPredictionSync] No pending predictions'
      );

      return {
        synced: 0
      };

    }


    let synced = 0;


    const batch = db.batch();


    for (const prediction of pending) {


      // Skip already synced records
      if (
        prediction.synced === true &&
        !force
      ) {
        continue;
      }



      const ref = db
        .collection('predictions')
        .doc(prediction.id);



      batch.update(ref, {

        synced: true,

        syncedAt:
          new Date()

      });


      synced++;

    }


    if (synced > 0) {

      await batch.commit();

    }


    console.log(
      `[UserPredictionSync] Synced ${synced} predictions`
    );


    return {
      synced
    };


  } catch(err) {

    console.error(
      '[UserPredictionSync] Failed:',
      err.message
    );


    return {
      synced: 0,
      error: err.message
    };

  }

}