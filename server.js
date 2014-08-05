var exec = require('exec');
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

// FS stuff.
app.get('/fs/:name', function(req, res) {
  res.sendfile(decodeURL(req.params.name));
});

app.post('/fs/:name', function(req, res) {
  var filePath = decodeURL(req.params.name);
  console.log('Save file: ' + filePath);
  fs.writeFileSync(filePath, req.text, 'utf8');
  res.status(200).send('saved');
});

// EXEC stuff.
app.post('/exec/', function(req, res) {
  var data = JSON.parse(req.text);
  exec(data.cmd, data.options || {}, function(err, out, code) {
    if (err instanceof Error) {
	  res.status(500).send(err.toString());
    } else {
	  res.status(200).send(out);
    }
  });
});

app.use(express.static(__dirname)); //  "public" off of current is root

var serverPort = 7777;
app.listen(serverPort);
console.log('Listening on port ' + serverPort);
