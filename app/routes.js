const express 		= require('express');
const bodyParser 	= require('body-parser');
const spawn 		= require("child_process").spawn;
const jsonParser 	= bodyParser.json();
const turf = require('@turf/turf');
const https = require("https");

module.exports = function(app, cors) {
	var apiRoutes = express.Router();

	//-42.568484/-19.350608/689/-82.65/89.01

	apiRoutes.get('/ptz/:towerlng/:towerlat/:heightm/:pan/:tilt', cors(), function(req, res){
		const pythonProcess = spawn('python3.5',["/opt/pymap3d/pyecef.py", req.params.towerlng, req.params.towerlat, req.params.heightm, req.params.pan, req.params.tilt]);
		const origin = {"latitude": req.params.towerlat, "longitude": req.params.towerlng, "pan": req.params.pan, "tilt": req.params.tilt, "height": req.params.heightm};

		pythonProcess.stdout.on('data', function(data){
			const target_on_ellipsoid = JSON.parse(data.toString().replace(/\n/g, ""));

			//We are searching a point of intersection with the teraain between the origin (tower) and the target (point on ellipsoid with 0m height)			
			let geojson = {"type": "FeatureCollection", "features": []};

			const url = "https://maps.googleapis.com/maps/api/elevation/json?path=" + parseFloat(origin.latitude) + "," + parseFloat(origin.longitude) + "|" + parseFloat(target_on_ellipsoid.latitude) + "," + parseFloat(target_on_ellipsoid.longitude) +"&samples=512&key=AIzaSyCmURugp5QEYHqtSgldW006i6yrDyTOgTw"

			https.get(url, resp => {
			  resp.setEncoding("utf8");
			  let body = "";
			  resp.on("data", data => {
			    body += data;
			  });
			  resp.on("end", () => {
			    body = JSON.parse(body);
			    let elevations = body.results;

			    let destination_pt = turf.point([parseFloat(target_on_ellipsoid.longitude), parseFloat(target_on_ellipsoid.latitude)]);
			    let observer_height = elevations[0].elevation;
			    let total_distance = turf.distance(turf.point([elevations[0].location.lng, elevations[0].location.lat]), destination_pt, {units: 'kilometers'}) * 1000;
			    
			    let alfa_rad = Math.atan((observer_height / total_distance));
			    let alfa = alfa_rad * 180 / Math.PI;

			    

			    let vertices = [];
			    let matches = [];
			    for(var i = 1;i<elevations.length-1;i++){
			    	let pt1 = turf.point([elevations[i].location.lng, elevations[i].location.lat]);
					let options = {units: 'kilometers'};

					let distance_from_current_point = turf.distance(pt1, destination_pt, options) * 1000;

					let height_on_losline = Math.tan(alfa_rad) * distance_from_current_point;

					if(matches.length < 1){
						let status = (elevations[i].elevation > height_on_losline) ? true : false;
						if(status){
							matches.push(status);
							geojson.features.push({"type": "Feature", "properties": {"name": "The calculated intersection point with terrain"}, "geometry": {"type": "Point", "coordinates": [elevations[i].location.lng, elevations[i].location.lat]}});
						}
					}

			    	vertices.push([elevations[i].location.lng, elevations[i].location.lat]);
			    }

			    geojson.features.push({"type": "Feature", "properties": {"alfa": alfa, "tower_height": Math.tan(alfa_rad) * total_distance}, "geometry": {"type": "LineString", "coordinates": vertices}});

			    res.json(geojson);
			  });
			});


			
		});	
		pythonProcess.stderr.on('data', function(data){
		  console.log('stderr:', data.toString());
		});

		pythonProcess.on('close', function(code){
		  console.log('child process exited with code: ', code);
		});
			
	});

	app.use('/api', apiRoutes);

};
