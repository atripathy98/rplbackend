const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
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
const summoners = db.ref("/summoners");
const gamesref = db.ref("/laddergames");

app.get('/',(req, res) => {
	res.render("index.html");
});

app.get('/gameroom',(req, res) => {
	if(!(req.query && req.query.gameid)){
		//NO ROOM SPECIFIED
	}else{
		//ROOM SPECIFIED

	}
});

app.get('/creategame',(req, res) => {
	var gameskey = gamesref.push();
	gameskey.set({
		players: 0,
		key: gameskey.key,
		roster:{},
		code:""
	});
	return res.json({success:true,gameid:gameskey.key});
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

