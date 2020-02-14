const express           = require('express');
const cors                      = require('cors');
const http              = require('http');
const port                      = process.env.PORT || 4000;
const app                       = express();
const bodyParser        = require('body-parser');

app.use(bodyParser());

app.use(cors());

app.options('*', cors())

app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header('Access-Control-Allow-Methods', 'DELETE, PUT, GET, POST');
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
});

require('./app/routes.js')(app, cors);

app.listen(port);

console.log('Application started on port ' + port);

