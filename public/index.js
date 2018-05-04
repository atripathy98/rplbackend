var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var admin = require('firebase-admin');
/* CREATE EXPRESS APP AND SERVER */
var app = express();
var server = http.createServer(app);

/* MISC. */
app.engine('html', require('ejs').renderFile);
app.set('views', __dirname + '/views');
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

/* FIREBASE ADMINS */
// Firebase Admins SetUp
/*var serviceAccount = require('./resources/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://webscience2018.firebaseio.com/",
  // Rules Option
  databaseAuthVariableOverride: {
  	uid: "nodejs-worker-application"
  }
});*/

/* WEB APPLICATION ROUTES */
// Landing Route
app.get('/',function(req,res){
	res.render('index.html');
});