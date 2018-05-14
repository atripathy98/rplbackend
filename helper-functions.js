/* IMPORT */
var riotapi = require('./riot-api');

//IMPORT JSON
const mmrData = require('./resources/mmr.json');

/* HELPER FUNCTIONS FOR RPL BACKEND */

//UNIQUE FILTER
//INSPIRED BY
//https://stackoverflow.com/questions/1960473
function onlyUnique(value, index, self) { 
	var foundIndex = -1;
	for(var i=0;i<self.length;i++){
		var found = true;
		for(var j=0;j<self[i].length;j++){
			found = found && (self[i][j] == value[j]);
		}
		if(found){
			foundIndex = i;
			break;
		}
	}
    return foundIndex == index;
}
//PERMUTATION HELPER CODE
//CREDIT: https://stackoverflow.com/questions/9960908
function permutation(inputArr) {
  var results = [];
  function permute(arr, memo) {
    var cur, memo = memo || [];
    for (var i = 0; i < arr.length; i++) {
      cur = arr.splice(i, 1);
      if (arr.length === 0) {
        results.push(memo.concat(cur));
      }
      permute(arr.slice(), memo.concat(cur));
      arr.splice(i, 0, cur[0]);
    }
    return results;
  }
  return permute(inputArr);
}

//BINARY COMBINATORICS
//http://zacg.github.io/blog/2013/08/02/binary-combinations-in-javascript/
function swapCombinatorics(n){
    var result = [];
    for(y=0; y<Math.pow(2,n); y++){
        var combo = [];
        for(x=0; x<n; x++){
            //shift bit and and it with 1
            if((y >> x) & 1)
                combo.push(true);
             else 
                combo.push(false);
        }
        result.push(combo);
    }
    return result;
}

function calculateMMRDifference(gamePlayers){
	var teamMMR = [0,0];
	for(var i=0;i<10;i++){
		if(gamePlayers[i].hasOwnProperty("assignedRole")){
			teamMMR[gamePlayers[i].teamId] += gamePlayers[i].mmr;
		}
	}
	return Math.abs(teamMMR[0]-teamMMR[1]);
}
exports.balanceGame = function(allPlayers){
	//ARRAY OF 10 OBJECTS
	var preferenceTable = [];
	var mainRoleCounter = [0,0,0,0,0];
	var playerInPositions = [0,0,0,0,0];
	//COUNT MAIN ROLE
	for(var i=0;i<10;i++){
		mainRoleCounter[allPlayers[i].mainrole]++;
	}
	var remainingIndex = [];
	var weights = [];
	//ASSIGN ROLES FOR MAIN ROLES THEN SECONDARY
	for(var i=0;i<10;i++){
		if(mainRoleCounter[allPlayers[i].mainrole] <= 2){
			allPlayers[i].assignedRole = allPlayers[i].mainrole;
			playerInPositions[allPlayers[i].mainrole]++;
		}else if(mainRoleCounter[allPlayers[i].secrole] < 2 && playerInPositions[allPlayers[i].secrole] < 2){
			allPlayers[i].assignedRole = allPlayers[i].secrole;
			playerInPositions[allPlayers[i].secrole]++;
		}else{
			remainingIndex.push(i);
			var autofillWeight = 1.0;
			if(allPlayers[i].totalGames > 0){
				autofillWeight = 1.0-(allPlayers[i].autofill+0.0)/allPlayers[i].totalGames;
			}
			weights.push(autofillWeight);
		}
	}
	//FINAL SMOOTHING OVER FOR AUTOFILLED PLAYERS
	var autofillIndex = [];
	for(var i=0;i<remainingIndex.length;i++){
		var minDex = weights.indexOf(Math.min(...weights));
		var index = remainingIndex[minDex];
		if(playerInPositions[allPlayers[index].mainrole] < 2){
			allPlayers[index].assignedRole = allPlayers[index].mainrole;
			playerInPositions[allPlayers[index].mainrole]++;
			weights[minDex] = 1000;
		}else{
			//ADD PLAYER TO AUTO FILL LIST
			autofillIndex.push(index);
			allPlayers[index].mmr -= 100;
			allPlayers[index].autofill++;
			weights[minDex] += 100;
		}
	}
	//AUTO PLACE TEAMS
	var teamIds = [0,0,0,0,0];
	for(var i=0;i<10;i++){
		if(allPlayers[i].hasOwnProperty("assignedRole")){
			allPlayers[i].teamId = teamIds[allPlayers[i].assignedRole];
			teamIds[allPlayers[i].assignedRole]++;
		}
	}
	//INITIAL BALANCING
	var potentialSwaps = swapCombinatorics(5);
	var swappedGames = [];
	var gameMMRDiffs = [];
	for(var i=0;i<potentialSwaps.length;i++){
		//COPY AND MAKE APPROPRIATE SWAPS
		var playerObjects = JSON.parse(JSON.stringify(allPlayers));
		for(var j=0;j<10;j++){
			if(allPlayers[j].hasOwnProperty("assignedRole") && potentialSwaps[i][playerObjects[j].assignedRole]){
				playerObjects[j].teamId = (potentialSwaps[i][playerObjects[j].assignedRole] ? !playerObjects[j].teamId : playerObjects[j].teamId) + 0;
			}
		}
		//CALCULATE MMR DIFFERENCES AND STORE TEAMS
		swappedGames.push(playerObjects);
		gameMMRDiffs.push(calculateMMRDifference(playerObjects));
	}
	allPlayers = swappedGames[gameMMRDiffs.indexOf(Math.min(...gameMMRDiffs))];
	//FIND ALL OPEN SPOTS THAT NEED AUTOFILLING
	var openPositions = [];
	for(var i=0;i<5;i++){
		var j = 2-playerInPositions[i];
		while(j>0){
			openPositions.push(i);
			j--;
		}
	}
	var possiblePlacements = permutation(openPositions).filter(onlyUnique);
	var allPossibleMatches = [];
	gameMMRDiffs = [];
	for(var i=0;i<possiblePlacements.length;i++){
		var playerObjects = JSON.parse(JSON.stringify(allPlayers));
		for(var j=0;j<possiblePlacements[i].length;j++){
			playerObjects[possiblePlacements[i][j]].assignedRole = openPositions[j];
		}
		allPossibleMatches.push(playerObjects);
		gameMMRDiffs.push(calculateMMRDifference(playerObjects));
	}
	if(possiblePlacements.length !=0){
		allPlayers = allPossibleMatches[gameMMRDiffs.indexOf(Math.min(...gameMMRDiffs))];
	}
	for(var i=0;i<10;i++){
		delete allPlayers[i].mmr;
		delete allPlayers[i].totalGames;
	}
	return allPlayers;
};

exports.createPlayerProfile = async function(accountDetails,lowercaseName,currentDate){
	var accountData = {};
	accountData.lowercaseName = lowercaseName;
	accountData.summonerName = accountDetails.name;
	accountData.id = accountDetails.id.toString();
	accountData.accountId = accountDetails.accountId.toString();
	accountData.summonerLevel = accountDetails.summonerLevel;
	accountData.lastUpdated = currentDate.getTime();
	var rankedJSON = await riotapi.getRankedData(accountData.id);
	var hiddenInfo = {};
	if(rankedJSON.success){
		var rankedData = rankedJSON.data;
		//INHOUSE DATA
		hiddenInfo["RPL_LADDER"] = {};
		hiddenInfo["RPL_LADDER"]["wins"] = 0;
		hiddenInfo["RPL_LADDER"]["losses"] = 0;
		hiddenInfo["RPL_LADDER"]["mmr"] = 1200;
		hiddenInfo["RPL_LADDER"]["autofill"] = 0;
		hiddenInfo["RPL_LADDER"]["totalGames"] = 0;
		rankedData.forEach(function(value){
			if(value.queueType === "RANKED_FLEX_SR" || value.queueType === "RANKED_SOLO_5x5"){
				hiddenInfo[value.queueType] = {};
				hiddenInfo[value.queueType]["tier"] = value.tier;
				hiddenInfo[value.queueType]["rank"] = value.rank;
				hiddenInfo[value.queueType]["wins"] = value.wins;
				hiddenInfo[value.queueType]["losses"] = value.losses;
				hiddenInfo[value.queueType]["mmr"] = mmrData[value.tier][value.rank] + Math.round(60.0*(value.leaguePoints/100.0));
			}
		});
	}
	accountData.mmrData = hiddenInfo;
	return accountData;
}