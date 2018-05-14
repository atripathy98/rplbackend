const admin = require('firebase-admin');

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


//ASYNC + AWAIT CALLS
exports.getSummoner = async function(summonerName){
	var response = {};
	try{
    	const snapshot = await summonersref.orderByChild("lowercaseName").equalTo(summonerName).once('value');
    	if(snapshot.numChildren() != 0) {
    		response.success = true;
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
    	response.status = err.status;
    }
	return response;
}

exports.getGameData = async function(gameKey,includeKeys){
	var response = {};
	try{
    	const snapshot = await gamesref.child("/"+gameKey).once('value');
    	if(snapshot.numChildren() != 0){
    		response.success = true;
    		var gameData = snapshot.val();
			response.status = gameData.status;
			if(response.status == 3){
				response.matchId = gameData.matchId;
			}
			if(gameData.roster){
				if(includeKeys){
					response.roster = gameData.roster;
				}else{
					response.roster = Object.values(gameData.roster);
				}
			}else{
				response.roster = [];
			}
			
			response.players = gameData.players;
			if(response.status <= 1){
				response.code = "Not available yet.";
			}else if(response.status == 2){
				response.code = gameData.code;
			}else{
				response.code = "Game has been completed.";
			}
		}else{
			response.success = false;
			response.message = "Specified game key does not exist.";
		}
    }catch(err){
    	response.success = false;
    	response.status = err.status;
    }
	return response;
}

exports.createGame = function(tournamentCode){
	var gameskey = gamesref.push();
	gameskey.set({
		players: 0,
		key: gameskey.key,
		status:0,
		code:tournamentCode
	});
	return gameskey.key;
}

exports.registerPlayer = function(accountData){
	var updateData = {};
	updateData[accountData.id] = accountData;
	summonersref.update(updateData);
}

exports.checkGameForPlayer = async function(gameKey,accountId){
	var rostersref = gamesref.child("/"+gameKey+"/roster");
	var alreadyRegisteredSnap = await rostersref.orderByChild("id").equalTo(accountId).once('value');
	if(alreadyRegisteredSnap.numChildren() != 0){
		return true;
	}
	return false;
}

exports.addPlayerToGame = async function(gameKey,accountId,mainRole,secRole){
	var roomref = gamesref.child("/"+gameKey);
	var snapshot = await roomref.child("/players").once('value');
	var players = snapshot.val();
	players++;
	roomref.update({
		players: players
	});
	if(players == 10){
		roomref.update({
			status: 1
		});
	}
	var roomChild = roomref.child("/roster");
	var playerkeyref = roomChild.push();
	playerkeyref.set({
		id: accountId,
		mainrole:mainRole,
		secrole:secRole
	});
	return playerkeyref.key;
}

exports.getPlayerInfo = async function(accountId){
	var snapshot = await summonersref.child("/"+accountId).once('value');
	var playerData = snapshot.val();
	var retData = {};
	retData.name = playerData.summonerName;
	retData.opgg = "http://na.op.gg/summoner/userName="+playerData.lowercaseName;
	retData.wins = playerData.mmrData["RPL_LADDER"]["wins"];
	retData.losses = playerData.mmrData["RPL_LADDER"]["losses"];
	return retData;
}

exports.getAllGames = async function(){
	var allGames = [];
	var snapshot = await gamesref.once('value');
	snapshot.forEach(function(obj){
		var valObj = obj.val();
		var gameObject = {};
		gameObject.gamekey = valObj.key;
		gameObject.players = valObj.players;
		gameObject.status = valObj.status;
		allGames.push(gameObject);
	});
	return allGames;
}

exports.organizeGameData = async function(allPlayers){
	var gameRoster = [];
	for(var key in allPlayers){
		var id = allPlayers[key]["id"];
		var playerSnap = await summonersref.child("/"+id).once('value');
		var accountData = playerSnap.val();
		var player = {};
		player.id = id;
		player.key = key;
		player.name = accountData.summonerName;
		//BROKEN
		player.totalGames = accountData["mmrData"]["RPL_LADDER"]["totalGames"];
		player.autofill = accountData["mmrData"]["RPL_LADDER"]["autofill"];
		player.mainrole = allPlayers[key]["mainrole"];
		player.secrole = allPlayers[key]["secrole"];
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
		var mmrData = accountData.mmrData;
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
		gameRoster.push(player);
	}
	return gameRoster;
}

exports.updateGameRoster = function(gameKey,gameRoster){
	var gameRosterObject = {};
	for(var i=0;i<10;i++){
		var actualKey = gameRoster[i].key;
		delete gameRoster[i].key;
		gameRosterObject[actualKey] = gameRoster[i];
	}
	var roomref = gamesref.child("/"+req.query.gamekey);
	roomref.update({
		status: 2,
		roster: gameRosterObject
	});
}

exports.deletePlayer = function(gameKey,playerKey){
	var gameRosterObject = {};
	var playerref = gamesref.child("/"+req.query.gamekey+"/roster/"+playerKey);2
	playerref.remove();
}