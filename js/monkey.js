importScripts("mersennetwister/src/MersenneTwister.js");

var mt = new MersenneTwister();
function limitedRand(limit){
  var value; 
  while (limit < (value = mt.int() & 31));
  return value;
}

function messageFinished(seed) {
  postMessage({
    type: 'completed',
    seed: seed
  });
}

function messageHighScore(seed, length) {
  postMessage({
    type: 'highScore',
    seed: seed,
    length: length
  });
}

onmessage = function(e) {
  var start = e.data.start;
  var seed = start;
  var offset = e.data.offset;
  var targetArray = e.data.targetArray;
  var targetLength = targetArray.length;
  
  var index = 0;
  var highScore = 0;
  mt.seed(seed);
  while(index < targetLength) {
    if (limitedRand(26) === targetArray[index]) {
      index++;
    } else {
      if (index > highScore) {
        // messageHighScore(seed, index);
        highScore = index;
      }
      index = 0;
      seed += offset;
      mt.seed(seed);
    };
  }
  messageFinished(seed);
}
