const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.set('views', __dirname + '/views');
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.get('/',(req, res) => {
	res.render("index.html");
});


app.get('/timestamp',(req, res) => {
	res.send(`${Date.now()}`);
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

app.listen(3000);
console.log("Listening on port 8000...");

