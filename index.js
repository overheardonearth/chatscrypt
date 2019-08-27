var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
const moment = require('moment'); // for timestamps

var MongoClient = require('mongodb').MongoClient;
//var url = "mongodb+srv://vbkellis:my1password@firstcluster-5wdsw.mongodb.net/test?retryWrites=true&w=majority";
var url = "mongodb+srv://chipingai:Password0212@cluster0-fpdph.gcp.mongodb.net/test?retryWrites=true&w=majority";

var connection = MongoClient.connect(url, {useNewUrlParser: true});

var onlineList = [];

app.get('/', function(req, res){
	res.sendFile(__dirname + '/login.html');
});


io.on('connection', function(socket){
	
	socket.username = '';
		
	socket.on('regCue', function(data){		
		if (data.username.length < 2)
		{
			socket.emit('regShortCue');
			return false;
		}
		
		var query = { username: data.username };
		connection.then(function(db){
			db.db("mydb").collection("users").find(query).toArray(function(err, result) {
				if (err) throw err;
				if (result.length == 0) {
					db.db("mydb").collection("users").insertOne(data, function(err, res) {
						if (err) throw err;
					});
					socket.emit('regConfirmCue');
				}
				else {
					socket.emit('regExistCue');
				}
			});
		});		  
	});
  
  
  
	socket.on('updateChatNumber', function(data) {
		var query = { username:socket.username };
	var newValues = {$set: { chatNumber:data }};
		connection.then(function(db){
			db.db("mydb").collection("users").updateOne(query, newValues, function(err, res) {
				if (err) throw err;
			});
		});
	});		
 
	socket.on('openNewAccount', function(data) {
		console.log(data);	
		connection.then(function(db){
			db.db("mydb").collection("users").find(data).toArray(function(err, result) {
				if (err) throw err;
				if (result.length == 0) {
					socket.emit('loginFailCue');
				}
				else {
					//for (x in io.sockets.sockets)
					//{
					//	if (io.sockets.connected[x].username == data.username)
					//	{
					//		socket.emit('alreadyLoginCue');
					//		return false;
					//	}
					//}
					
					socket.username = data.username;
					socket.join('loggedIn');
					console.log(onlineList);
					if (onlineList.includes(socket.username) == false) 
					{
						onlineList.push(data.username);
						socket.broadcast.to('loggedIn').emit('newcomerCue', data.username);
					}
					
					db.db("mydb").collection("messages").find({ $or:[{ listeners: data.username }, { speaker: socket.username }] }).toArray(function(err, res) {
						if (err) throw err;
						var recent = 0;
						var defaultListeners = [];
						for (x in res){
							if ((res[x].speaker == socket.username) && (res[x].time > recent))
								defaultListeners = res[x].listeners;
						}
						socket.emit('loginConfirmCue', { username:socket.username, usernames:onlineList, listeners:defaultListeners, msgs:res, chatNumber:result[0].chatNumber});
					});					
				}
			});
		});
	});	
 
  
	socket.on('loginCue', function(data) {		
		connection.then(function(db){
			db.db("mydb").collection("users").find(data).toArray(function(err, result) {
				if (err) throw err;
				if (result.length == 0) {
					socket.emit('loginFailCue');
				}
				else {
					//for (x in io.sockets.sockets)
					//{
					//	if (io.sockets.connected[x].username == data.username)
					//	{
					//		socket.emit('alreadyLoginCue');
					//		return false;
					//	}
					//}
					socket.username = data.username;
					socket.join('loggedIn');
					if (onlineList.includes(socket.username) == false) 
					{
						onlineList.push(data.username);
						socket.broadcast.to('loggedIn').emit('newcomerCue', data.username);
					}
					
					db.db("mydb").collection("messages").find({ $or:[{ listeners: data.username }, { speaker: socket.username }] }).toArray(function(err, res) {
						if (err) throw err;
						var recent = 0;
						var defaultListeners = [];
						for (x in res){
							if ((res[x].speaker == socket.username) && (res[x].time > recent))
								defaultListeners = res[x].listeners;
						}
						socket.emit('loginConfirmCue', { username:socket.username, usernames:onlineList, listeners:defaultListeners, msgs:res, chatNumber:result[0].chatNumber});
					});					
				}
			});
		});
	});
	
	socket.on('logoutCue', function(){
		socket.leave('loggedIn');	
		
		for(i = 0; i < onlineList.length; i++)
		{
			if (onlineList[i] == socket.username)
			{
				onlineList.splice(i, 1);
				io.to('loggedIn').emit('departureCue', socket.username);
				i--;
			}
		}
		
		socket.username = '';
	});
  
	socket.on('disconnect', function(){	
		if (socket.username != '')
		{
			for(i = 0; i < onlineList.length; i++)
			{
				if (onlineList[i] == socket.username)
				{
					onlineList.splice(i, 1);
					io.to('loggedIn').emit('disconnectCue', socket.username);
					i--;
				}
			}
			
			socket.username = '';
		}
	});
  
	socket.on('clientMsgCue', function(data){
		
		// send to listed listeners
		for (i = 0; i < data.listeners.length; i++)
		{
			for (x in io.sockets.adapter.rooms['loggedIn'].sockets)
			{
				if (io.sockets.connected[x].username == data.listeners[i])
					io.sockets.connected[x].emit('serverMsgCue', { speaker:socket.username, msg:data.msg, time:data.time, chatID:data.chatID });
			}
		}
		
		// add message to database
		var dbData = { speaker:socket.username, listeners:data.listeners, msg:data.msg, time:data.time, chatID:data.chatID };
		console.log(dbData);
		connection.then(function(db){
				db.db("mydb").collection("messages").insertOne(dbData, function(err, res) {
					if (err) throw err;
				});
		});
		
		// send to self as well, since not listed as a listener
		for (x in io.sockets.adapter.rooms['loggedIn'].sockets)
		{
			if (io.sockets.connected[x].username == socket.username)
				io.sockets.connected[x].emit('serverMsgCue', { speaker:socket.username, msg:data.msg, time:data.time, chatID:data.chatID });
		}
	});
	
	socket.on('addListenerCue', function(candidate){
		if (socket.username == candidate) 
		{
			socket.emit('selfListenerCue');
			return false;
		}
		
		connection.then(function(db){
			db.db("mydb").collection("users").find({ username: candidate }).toArray(function(err, result) {
				if (err) throw err;
				if (result.length == 0) 
					socket.emit('addListenerFailCue');
				else
					socket.emit('addListenerConfirmCue', candidate);
			});
		});	
	});	
});


http.listen(port, function(){
	console.log('listening on *:' + port);
});
