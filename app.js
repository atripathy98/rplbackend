const express = require('express');
const bodyParser = require('body-parser');
var fbconn = require('./firebase-connector');
var riotapi = require('./riot-api');
var helper = require('./helper-functions');


const app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/views'));

app.get('/',(req, res) => {
	res.render("index.html");
});

//CREATE A GAME ROOM
app.get('/createGame', async (req, res) => {
	var response = {};
	var jsonData = await riotapi.getTourneyCode(1);
	if(jsonData.success){
		var tCode = jsonData.data[0];
		response.success = true;
		response.gamekey = fbconn.createGame(tCode);
	}else{
		response.success = false;
		response.message = "Unable to create room. Tournament code could not be assigned.";
		response.err = jsonData.message;
	}
	return res.json(response);
});

//GET GAME INFORMATION
app.get('/getGame', async (req, res) => {
	var response = {};
	if(!(req.query && req.query.gamekey)){
		response.message = "Parameter 'gamekey' has not been provided.";
		response.success = false;
	}else{
		response = await fbconn.getGameData(req.query.gamekey,false);
	}
	return res.json(response);
});

//ADD A PLAYER TO A GAME
app.get('/addPlayer', async (req, res) => {
	var response = {};
	if(!(req.query && req.query.gamekey && req.query.summoner && req.query.primary && req.query.secondary)){
		response.message = "Parameters 'gamekey','summoner','primary', and 'secondary' have not been provided.";
		response.success = false;
	}else{
		var gameData = await fbconn.getGameData(req.query.gamekey,false);
		if(!gameData.success){
			response = gameData;
		}else if(gameData.status > 0){
			response.success = false;
			response.message = "This game has already reached the maximum capacity.";
		}else{
			var accountData = {};
			accountData.summonerName = req.query.summoner.toLowerCase().replace(/\s/g,'');
			var currentDate = new Date();
			var existingPlayer = await fbconn.getSummoner(accountData.summonerName);
			if(existingPlayer.success && (currentDate.getTime() - existingPlayer.time) < 86400000*2){
				accountData = existingPlayer.data;
				response.success = true;
				response.message = "Welcome back summoner! Enjoy your match!";
			}else{
				var summonerData = await riotapi.getSummoner(accountData.summonerName);
				if(summonerData.success){
					//INCOMING USER TO SERVER
					accountData = await helper.createPlayerProfile(summonerData.data,accountData.summonerName,currentDate);
					if(accountData["mmrData"].hasOwnProperty("RPL_LADDER")){
						if(existingPlayer.success){
							accountData["mmrData"]["RPL_LADDER"] = existingPlayer["data"]["mmrData"]["RPL_LADDER"];
						}
						//PLAYER RANKED DATA WAS FOUND
						//ADD USER DATA
						response.success = true;
						fbconn.registerPlayer(accountData);
						response.message = "Welcome to the Rising Premier League Ladder Games! Enjoy your first match!";
					}else{
						response.success = false;
						response.message = "We could not find your ranked data. Please try again later.";
					}
				}else{
					response.success = false;
					response.error = summonerData.error;
					response.message = "Summoner name could not be found. Please recheck your entry.";
				}
			}
			//NOW ADD PLAYER TO THE GAME
			if(response.success){
				var registered = await fbconn.checkGameForPlayer(req.query.gamekey,accountData.id);
				if(registered){
					response.message = "Player has already been registered for this match.";
				}else if(!(accountData["mmrData"].hasOwnProperty("RANKED_SOLO_5x5"))){
					response.message = "Player must play Ranked Solo/Duo Queue in order to participate in the RPL Ladder Games.";
				}else if(accountData["mmrData"]["RANKED_SOLO_5x5"]["wins"] + accountData["mmrData"]["RANKED_SOLO_5x5"]["losses"] < 30){
					response.message = "Player must play at least 30 Ranked Solo/Duo Queue in order to participate in the RPL Ladder Games.";
				}else if(accountData["mmrData"]["RANKED_SOLO_5x5"]["mmr"] >= 2030 || accountData["mmrData"]["RANKED_FLEX_SR"]["mmr"] >= 2030){
					response.message = "Player must be Platinum I 100LP or below in both Solo/Duo and Flex.";
				}else{
					var mainrole = parseInt(req.query.primary);
					var secrole = parseInt(req.query.secondary);
					response.playerkey = await fbconn.addPlayerToGame(req.query.gamekey,accountData.id,mainrole,secrole);
					response.message += " Player has been added to the game.";
				}
			}
		}
	}
	return res.json(response);
});

app.get('/approveGame', async (req, res) => {
	var response = {};
	if(!(req.query && req.query.gamekey)){
		response.success = false;
		response.message = "A 'gamekey' needs to be provided in order to approve a game.";
	}else{
		var gameData = await fbconn.getGameData(req.query.gamekey,true);
		if(!gameData.success){
			response = gameData;
		}else if(gameData.status != 1){
			//CHECK STATUS CODE
			if(gameData.status == 0){
				response.success = false;
				response.message = "This game is not ready to be approved.";
			}else{
				response.success = true;
				response.message = "This game has already been approved.";
			}
		}else{
			//STUCK HERE
			var gameRoster = await fbconn.organizeGameData(gameData.roster);
			fbconn.updateGameRoster(req.query.gamekey,helper.balanceGame(gameRoster));
			response.success = true;
			response.message = "Teams have been organized according to calculated MMR. If there exists large disparity in skill level between players, then teams may have imbalance.";
		}
	}
	return res.json(response);
});

app.get('/removePlayer', async (req, res) => {
	var response = {};
	if(!(req.query && req.query.gamekey && req.query.playerkey)){
		response.success = false;
		response.message = "A 'gamekey' and 'playerkey' needs to be provided to remove a player.";
	}else{
		var gameData = await fbconn.getGameData(req.query.gamekey,false);
		if(!gameData.success){
			response = gameData;
		}else if(gameData.status > 0){
			//CHECK STATUS CODE
			response.success = false;
			response.message = "This game has already been approved.";
		}else{
			//STUCK HERE
			fbconn.deletePlayer(req.query.gamekey,req.query.playerkey);
			response.success = true;
			response.message = "Player has been removed from this game.";
		}
	}
	return res.json(response);
});

app.get('/getAllGameRooms', async (req, res) => {
	var response = {};
	response.success = true;
	response.data = await fbconn.getAllGames();
	return res.json(response);
});

app.listen(app.get('port'));
console.log("Listening on port 5000...");