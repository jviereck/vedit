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

app.get('/fs/:name', function(req, res) {
  res.sendfile(req.params.name.replace(/\|/g, '/'));
})

app.post('/fs/:name', function(req, res) {
  console.log('Save file: ' + req.params.name);
  var filePath = req.params.name.replace(/\|/g, '/');
  fs.writeFileSync(filePath, req.text, 'utf8');
  res.send(200, 'saved');
})

app.use(express.static(__dirname)); //  "public" off of current is root

var serverPort = 7777;
app.listen(serverPort);
console.log('Listening on port ' + serverPort);
