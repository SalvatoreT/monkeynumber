function isLowercaseLetter(letter) {
  return /^[a-z]+$/.test(letter);
}

function toAlphabeticalIndex(letter) {
  return letter.charCodeAt(0) - 97; // 97 is 'a'
}

function stringToIndexArray(string) {
  return string.toLowerCase().split('')
          .filter(isLowercaseLetter)
          .map(toAlphabeticalIndex)
}

function displayAnswer(seed, targetLength) {
  return "ruby -e \"srand("+seed+");puts "+targetLength+".times.map{rand(97..123).chr}.join\""
}

function limitedRand(limit){
  var value; 
  while (limit < (value = mt.int() & 31));
  return value;
}

function startAnimation() {
  $('.typewriter-monkey').addClass('animated');
}

function stopAnimation() {
  setTimeout(function(){
    $('.typewriter-monkey').removeClass('animated');
  }, 1000);
}

$('#word-input-form').submit(function(event) {
  var targetString = $('#target-word-input').val();
  $('#word-input-form').slideUp();
  var seed = 0;
  var mt = new MersenneTwister(seed);
  var targetArray = stringToIndexArray(targetString);
  var targetLength = targetString.length;
  var monkeys = [];
  var numMonkeys = 4;
  for (var i = 0; i < numMonkeys; i++) {
    var worker = new Worker("js/monkey.js");;
    worker.onmessage = function(e){
      switch(e.data.type) {
        case 'completed':
          for(monkey of monkeys) {
            monkey.terminate();
          }
          $('#monkey-result').text(displayAnswer(e.data.seed, targetArray.length));
          $('#monkey-result-row').removeClass('hidden');
          stopAnimation();
          break;
        case 'highScore':
          console.log("A monkey has one length "+e.data.length+" ("+e.data.seed+")");
          break;
        default:
          break;
      }
    };

    worker.postMessage({
      start:i,
      offset:numMonkeys,
      targetArray:targetArray
    });

    monkeys.push(worker);
  };
  startAnimation();
  event.preventDefault();
});
