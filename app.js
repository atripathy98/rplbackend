const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');
const admin = require('firebase-admin');

const app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/views'));

//FIREBASE PRIVATE SERVICE KEY
const serviceAccount = require('./resources/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://risingsummoners-e4e70.firebaseio.com"
});

//FIREBASE DB
const db = admin.database();
const summonersref = db.ref("/summoners");
const gamesref = db.ref("/laddergames");

//RIOT API KEYS
const baseapi = "RGAPI-ca99041e-f455-4571-be1c-4d6e5c8d24a7";
const tourneyapi = "RGAPI-d6725b47-cbd7-40d0-a565-570e64c0f93c";

//IMPORT JSON
const mmrData = require('./resources/mmr.json');

//PERMUTATION HELPER CODE
//CREDIT: https://stackoverflow.com/questions/9960908/permutations-in-javascript
function permutator(inputArr) {
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
function binaryCombos(n){
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

function calculateTeamMMR(players){
	var team1 = 0;
	var team2 = 0;
	for(var i=0;i<players.length;i++){
		if(players[i][1] == 0){
			team1 += players[i][2];
		}else{
			team2 += players[i][2];
		}
	}
	return Math.abs(team1-team2);
}

function isPossible(players){
	var total = [0,0,0,0,0];
	for(var i=0;i<players.length;i++){
		total[players[i][0]]++;
	}
	return Math.max(...total) <= 2;
}
function organizeTeams(allPlayers){
	var blueTeam = [{},{},{},{},{}];
	var redTeam = [{},{},{},{},{}];
	var placedPlayers = [];
	var remainingPlayers = [];
	//PLACE EVERYONE IN PREFERRED ROLES BY ORDER SUBMISSION
	allPlayers.forEach(function(player){
		if(!blueTeam[player.mainrole].hasOwnProperty("id")){
			blueTeam[player.mainrole] = player;
			placedPlayers.push([player.mainrole,0,player.mmr,player.id]);
		}else if(!redTeam[player.mainrole].hasOwnProperty("id")){
			redTeam[player.mainrole] = player;
			placedPlayers.push([player.mainrole,1,player.mmr,player.id]);
		}else if(!blueTeam[player.secrole].hasOwnProperty("id")){
			blueTeam[player.secrole] = player;
			player.mmr -= 30;
			placedPlayers.push([player.secrole,0,player.mmr,player.id]);
		}else if(!redTeam[player.secrole].hasOwnProperty("id")){
			redTeam[player.secrole] = player;
			player.mmr -= 30;
			placedPlayers.push([player.secrole,1,player.mmr,player.id]);
		}else{
			//ATTEMPTING TO PLACE IN UNWANTED ROLE
			player.mmr -= 100;
			remainingPlayers.push(player);
		}
	});
	//ADJUST MAIN ROLE PLAYERS
	var potentialSwaps = binaryCombos(10-remainingPlayers.length);
	var mmrDiffs = [];
	for(var i=0;i<potentialSwaps.length;i++){
		var tempArray = [];
		for(var j=0;j<potentialSwaps[i].length;j++){
			tempArray[j] = placedPlayers[j].slice();
			tempArray[j][1] = (potentialSwaps[i][j] ? !tempArray[j][1] : tempArray[j][1]) + 0;
		}
		if(isPossible(tempArray)){
			mmrDiffs.push(calculateTeamMMR(tempArray));
		}else{
			mmrDiffs.push(10000);
		}
	}
	var index = mmrDiffs.indexOf(Math.min(...mmrDiffs));
	//MAKE PROPER SWAPS
	for(var j=0;j<potentialSwaps[index].length;j++){
		var init = placedPlayers[j][1];
		placedPlayers[j][1] = (potentialSwaps[index][j] ? !placedPlayers[j][1] : placedPlayers[j][1]) + 0;
		if(init != placedPlayers[j][1]){
			if(init == 0 && blueTeam[placedPlayers[j][0]]["id"] == placedPlayers[j][3]){
				var tmp = blueTeam[placedPlayers[j][0]];
				blueTeam[placedPlayers[j][0]] = redTeam[placedPlayers[j][0]];
				redTeam[placedPlayers[j][0]] = tmp;
			}else if(init == 1 && redTeam[placedPlayers[j][0]]["id"] == placedPlayers[j][3]){
				var tmp = redTeam[placedPlayers[j][0]];
				redTeam[placedPlayers[j][0]] = blueTeam[placedPlayers[j][0]];
				blueTeam[placedPlayers[j][0]] = tmp;
			}
		}
	}
	//NOW FOR LEFT OVER PLAYERS
	var remainingSpots = [];
	for(var i=0;i<5;i++){
		if(!blueTeam[i].hasOwnProperty("id")){
			remainingSpots.push([i,0]);
		}
		if(!redTeam[i].hasOwnProperty("id")){
			remainingSpots.push([i,1]);
		}
	}
	var potentialTeams = permutator(remainingSpots);
	mmrDiffs = [];
	for(var i=0;i<potentialTeams.length;i++){
		var tempArray = [];
		for(var j=0;j<placedPlayers.length;j++){
			tempArray[j] = placedPlayers[j].slice();
		}
		for(var j=0;j<potentialTeams[i].length;j++){
			var tmp = potentialTeams[i][j].slice();
			tmp[2] = remainingPlayers[j].mmr;
			tempArray.push(tmp);
		}
		mmrDiffs.push(calculateTeamMMR(tempArray));
	}
	index = mmrDiffs.indexOf(Math.min(...mmrDiffs));
	var optimalTeam = potentialTeams[index];
	for(var i=0;i<optimalTeam.length;i++){
		if(optimalTeam[i][1] == 0){
			blueTeam[optimalTeam[i][0]] = remainingPlayers[i];
		}else{
			redTeam[optimalTeam[i][0]] = remainingPlayers[i];
		}
	}
	return {teamone:blueTeam,teamtwo:redTeam};
}
//ASYNC + AWAIT CALLS
async function findSummoner(summoner){
	var response = {};
	try{
    	const snapshot = await summonersref.orderByChild("lowercaseName").equalTo(summoner).once('value');
    	response.success = true;
    	if(snapshot.numChildren() != 0) {
			var datum = snapshot.val();
			var key = Object.keys(datum)[0];
			response.success = true;
			response.time = datum[key]["lastUpdated"];
			response.data = datum[key];
		}else{
			response.success = false;
		}
    }catch(err){
    	response.success = false;
    	response.data = err;
    }
	return response;
}

//RIOT API CALLS
async function getSummoner(summonername){
	var response = {};
	const options = {
      json: true,
      url: "https://na1.api.riotgames.com/lol/summoner/v3/summoners/by-name/"+summonername+"?api_key="+baseapi
    };
    try{
    	response.data = await request.get(options);
    	response.success = true;
    }catch(err){
    	response.success = false;
    	response.data = "Summoner was not found or Riot API reached rate limit.";
    }
    return response;
}
//
async function getTourneyCode(number){
	var response = {};
	var headArr = {
	  "mapType": "SUMMONERS_RIFT",
	  "metadata": "",
	  "pickType": "TOURNAMENT_DRAFT",
	  "spectatorType": "ALL",
	  "teamSize": 5
	};
	const options = {
      json: true,
      method:"POST",
      url: "https://americas.api.riotgames.com/lol/tournament/v3/codes?count="+number.toString()+"&tournamentId=302545&api_key="+tourneyapi,
      body: headArr
    };
    try{
    	response.data = await request(options);
    	response.success = true;
    }catch(err){
    	response.success = false;
    	response.data = "Tournament code was not found.";
    }
    return response;
}

async function getRankedData(summonerid){
	var response = {};
	const options = {
      json: true,
      url: "https://na1.api.riotgames.com/lol/league/v3/positions/by-summoner/"+summonerid+"?api_key="+baseapi
    };
    try{
    	response.data = await request.get(options);
    	response.success = true;
    }catch(err){
    	response.success = false;
    	response.data = "Summoner ranked data was not found or Riot API reached rate limit.";
    }
    return response;
}

app.get('/',(req, res) => {
	res.render("index.html");
});

app.get('/gameRoom', async (req, res) => {
	var response = {
		success:false
	};
	if(!(req.query && req.query.gamekey)){
		//NO ROOM SPECIFIED
		response.message = "A game key needs to be provided in order to access a game.";
		//return res.json(response);
	}else{
		var roomref = gamesref.child("/"+req.query.gamekey);
		const snapshot = await roomref.once('value');
		if(snapshot.numChildren() === 0){
			response.message = "Specified game key was not found.";
		}else{
			var gameData = snapshot.val();
			var players = gameData.players;
			var status = gameData.status;
			if(status == 1 && req.query.summonername){
				response.message = "This game has already reached the maximum capacity.";
			}else if(status == 1){
				response.success = true;
				response.message = "This game room is ready for admin approval.";
			}else if(req.query.summonername && req.query.primary && req.query.secondary){
				var summoner = req.query.summonername;
				var accountdata = {
					summonerName: summoner.toLowerCase().replace(" ","")
				};
				var currentDate = new Date();
				var existingPlayer = await findSummoner(accountdata.summonerName);
				if(existingPlayer.success && (currentDate.getTime() - existingPlayer.time) < 86400000){
					accountdata = existingPlayer.data;
					response.success = true;
					response.message = "Welcome back!";
				}else{
					var summonerData = await getSummoner(accountdata.summonerName);
					if(summonerData.success){
						var accountDetails = summonerData.data;
						accountdata.summonerName = accountDetails.name;
						accountdata.lowercaseName = accountdata.summonerName;
						accountdata.id = accountDetails.id.toString();
						accountdata.accountId = accountDetails.accountId.toString();
						accountdata.summonerLevel = accountDetails.summonerLevel;
						accountdata.lastUpdated = currentDate.getTime();
						var rankedQuery = await getRankedData(accountdata.id);
						if(rankedQuery.success){
							response.success = true;
							var rankedData = rankedQuery.data;
							var ranked = {};
							//INHOUSE DATA
							ranked["RPL_LADDER"] = {};
							ranked["RPL_LADDER"]["wins"] = 0;
							ranked["RPL_LADDER"]["losses"] = 0;
							ranked["RPL_LADDER"]["mmr"] = 1200;
							rankedData.forEach(function(value){
								if(value.queueType === "RANKED_FLEX_SR" || value.queueType === "RANKED_SOLO_5x5"){
									ranked[value.queueType] = {};
									ranked[value.queueType]["tier"] = value.tier;
									ranked[value.queueType]["rank"] = value.rank;
									ranked[value.queueType]["wins"] = value.wins;
									ranked[value.queueType]["losses"] = value.losses;
									ranked[value.queueType]["mmr"] = mmrData[value.tier][value.rank] + Math.round(59.0*(value.leaguePoints/100.0));
								}
							});
							accountdata.data = ranked;
							//ADD USER DATA
							var updateData = {};
							updateData[accountdata.id] = accountdata;
							summonersref.update(updateData);
							response.message = "Summoner has been registered on our application.";
						}else{
							response.message = "Riot API had trouble retrieving this summoner's ranked data.";
							response.error = rankedQuery.data;
						}
					}else{
						response.message = "This summoner likely does not exist or Riot API is causing us trouble. Please try again at a later time.";
						response.error = summonerData.data;
					}
				}
				if(response.success){
					//ADD PLAYER TO ROOM
					var rostersref = roomref.child("/roster");
					var alreadyRegisteredSnap = await rostersref.orderByChild("id").equalTo(accountdata.id).once('value');
					if(alreadyRegisteredSnap.numChildren() != 0){
						response.message += " This player has already registered for this match.";
					}else if(!("RANKED_SOLO_5x5" in accountdata.data)){
						response.message += " You must play Ranked Solo/Duo Queue in order to participate in the RPL Ladder Games.";
					}else if(accountdata["data"]["RANKED_SOLO_5x5"]["wins"] + accountdata["data"]["RANKED_SOLO_5x5"]["losses"] < 30){
						response.message += " You must play at least 30 Ranked Solo/Duo Queue in order to participate in the RPL Ladder Games.";
					}else{
						players++;
						if(players == 10){
							roomref.update({
								status: 1
							});
						}
						roomref.update({
							players: players
						});
						var roomChild = roomref.child("/roster");
						var playerkeyref = roomChild.push();
						playerkeyref.set({
							id: accountdata.id,
							primary:parseInt(req.query.primary),
							secondary:parseInt(req.query.secondary)
						});
						response.message += " Player has been added to the game.";
					}
				}else{
					response.message += " The application was unable to process this player.";
				}
			}else{
				var left = 10-players;
				response.message = "This game requires "+left.toString()+" players. Please provide a summoner name, primary role, and secondary role.";
			}
		}
	}
	return res.json(response);
});

app.get('/approveGame', async (req, res) => {
	var response = {
		success:false
	};
	if(!(req.query && req.query.gamekey)){
		//NO ROOM SPECIFIED
		response.message = "A game key needs to be provided in order to approve a game.";
		//return res.json(response);
	}else{
		var roomref = gamesref.child("/"+req.query.gamekey);
		const snapshot = await roomref.once('value');
		if(snapshot.numChildren() === 0){
			response.message = "Specified game key was not found.";
		}else{
			//GAME EXISTS AND NEEDS APPROVAL
			var gameData = snapshot.val();
			var status = gameData.status;
			if(status == 2){
				response.message = "This game has already been approved.";
				response.data = gameData;
			}else if(status == 1){
				//START MATCHING PLAYERS
				var allPlayers = gameData.roster;
				var actualRoster = [];
				for(var key in allPlayers){
					var id = allPlayers[key]["id"];
					const playersnap = await summonersref.child("/"+id).once('value');
					var accountdata = playersnap.val();
					var player = {};
					player.id = accountdata.id;
					player.name = accountdata.summonerName;
					player.mainrole = allPlayers[key]["primary"];
					player.secrole = allPlayers[key]["secondary"];
					//MMR CALCULATION
					var rankedFlexGames = 0;
					var rankedSoloGames = 0;
					var ladderGames = 0;
					var rankedFlexWins = 0;
					var rankedSoloWins = 0;
					var ladderWins = 0;
					var rankedFlexMMR = 0;
					var rankedSoloMMR = 0;
					var ladderMMR = 0;
					var mmrData = accountdata.data;
					if("RANKED_FLEX_SR" in mmrData){
						rankedFlexGames = mmrData["RANKED_FLEX_SR"]["wins"]+mmrData["RANKED_FLEX_SR"]["losses"];
						rankedFlexWins = mmrData["RANKED_FLEX_SR"]["wins"];
						rankedFlexMMR = mmrData["RANKED_FLEX_SR"]["mmr"] + Math.round((rankedFlexWins*1.0/rankedFlexGames - 0.5)/0.03 * 10);
					}
					if("RANKED_SOLO_5x5" in mmrData){
						rankedSoloGames = mmrData["RANKED_SOLO_5x5"]["wins"]+mmrData["RANKED_SOLO_5x5"]["losses"];
						rankedSoloWins = mmrData["RANKED_SOLO_5x5"]["wins"];
						rankedSoloMMR = mmrData["RANKED_SOLO_5x5"]["mmr"] + Math.round((rankedSoloWins*1.0/rankedSoloGames - 0.5)/0.03 * 10);
					}
					if("RPL_LADDER" in mmrData){
						ladderGames = mmrData["RPL_LADDER"]["wins"]+mmrData["RPL_LADDER"]["losses"];
						ladderWins = mmrData["RPL_LADDER"]["wins"];
						ladderMMR = mmrData["RPL_LADDER"]["mmr"];
					}
					player.mmr = 1200;
					if(rankedFlexGames + rankedSoloGames !== 0 && ladderGames < 5){
						player.mmr = Math.round(rankedFlexMMR*(rankedFlexGames*1.0/(rankedFlexGames+rankedSoloGames)) + rankedSoloMMR*(rankedSoloGames*1.0/(rankedFlexGames+rankedSoloGames)));
					}else{
						//IMPLEMENT LADDER MMR
					}
					actualRoster.push(player);
				}
				var teamsfixed = organizeTeams(actualRoster);
				var getCodeData = await getTourneyCode(1);
				var tCode = "";
				if(getCodeData.success){
					tCode = getCodeData.data[0];
				}
				roomref.update({
					status: 2,
					teams: teamsfixed,
					code: tCode
				});
				response.success = true;
				response.message = "Teams have been organized according to calculated MMR. If there exists large disparity in skill level between players, then teams may have imbalance.";
				response.teams = teamsfixed;
			}else{
				response.message = "This game is not ready for approval.";
			}
		}
	}
	return res.json(response);
});

app.get('/createGame',(req, res) => {
	var gameskey = gamesref.push();
	gameskey.set({
		players: 0,
		key: gameskey.key,
		status:0,
		code:""
	});
	return res.json({success:true,gamekey:gameskey.key});
});

app.get('/getAllGameRooms',(req, res) => {
	var allGames = [];
	gamesref.once("value", function(snapshot){
		snapshot.forEach(function(obj){
			allGames.push(obj.val());
		});
		return res.json({success:true,data:allGames});
	});
});

app.get('/getchampions',(req, res) => {
	url = "https://na1.api.riotgames.com/lol/platform/v3/champions?freeToPlay=false&api_key=RGAPI-0686dbb3-1f2d-4af7-9122-2affcd4b140f";
	request(url,{ json: true }, (err, resp, body) => {
		if (err) {
			res.send(err);
		}else{
			res.json(body);
		}
	});
});

app.listen(app.get('port'));
console.log("Listening on port 5000...");

