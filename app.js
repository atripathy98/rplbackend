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

//PROMISE CALLS
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
				var accountdata = {
					summonerName: req.query.summonername
				};
				var currentDate = new Date();
				var existingPlayer = await findSummoner(accountdata.summonerName.toLowerCase().trim());
				if(existingPlayer.success && (currentDate.getTime() - existingPlayer.time) < 86400000){
					accountdata = existingPlayer.data;
					response.success = true;
					response.message = "Welcome back!";
				}else{
					var summonerData = await getSummoner(accountdata.summonerName.toLowerCase().trim());
					if(summonerData.success){
						var accountDetails = summonerData.data;
						accountdata.summonerName = accountDetails.name;
						accountdata.lowercaseName = accountDetails.name.toLowerCase().trim();
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

