var express = require('express');
var fs = require('fs');
var path = require('path');

var app = express();

app.use(function(req, res, next){
  req.text = '';
  req.setEncoding('utf8');
  req.on('data', function(chunk){ req.text += chunk });
  req.on('end', next);
});

function decodeURL(url) {
	return url.replace(/\|/g, '/')
}

app.get('/fs/:name', function(req, res) {
  res.sendfile(decodeURL(req.params.name));
})

app.post('/fs/:name', function(req, res) {
	var filePath = decodeURL(req.params.name);
  console.log('Save file: ' + filePath);
  fs.writeFileSync(filePath, req.text, 'utf8');
  res.send(200, 'saved');
})

app.use(express.static(__dirname)); //  "public" off of current is root

var serverPort = 7777;
app.listen(serverPort);
console.log('Listening on port ' + serverPort);
