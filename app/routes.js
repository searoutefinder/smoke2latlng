const express 		= require('express');
const bodyParser 	= require('body-parser');
const spawn 		= require("child_process").spawn;
const jsonParser 	= bodyParser.json();
const turf = require('@turf/turf');
const https = require("https");


Number.prototype.toRadians = function() { return this * Math.PI / 180; };
Number.prototype.toDegrees = function() { return this * 180 / Math.PI; };


function _destinationPoint(latlon, distance, bearing, radius=6371e3){
    const δ = distance / radius; // angular distance in radians
    const θ = Number(bearing).toRadians();

    const φ1 = latlon.lat.toRadians(), λ1 = latlon.lon.toRadians();

    const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
    const φ2 = Math.asin(sinφ2);
    const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
    const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);

    const _lat = φ2.toDegrees();
    const _lon = λ2.toDegrees();

    return {"lat": _lat, "lon": _lon};	
}

module.exports = function(app, cors) {
	var apiRoutes = express.Router();

	//-42.568484/-19.350608/689/-82.65/89.01

	apiRoutes.get('/ptz/:towerlng/:towerlat/:heightm/:pan/:tilt', cors(), function(req, res){
		const pythonProcess = spawn('python3.5',["/opt/pymap3d/pyecef.py", req.params.towerlng, req.params.towerlat, req.params.heightm, req.params.pan, req.params.tilt]);
		const origin = {"latitude": req.params.towerlat, "longitude": req.params.towerlng, "pan": req.params.pan, "tilt": req.params.tilt, "height": req.params.heightm};

		pythonProcess.stdout.on('data', function(data){
			
			const target_on_ellipsoid = JSON.parse(data.toString().replace(/\n/g, ""));

			let dest_point = _destinationPoint({"lat": parseFloat(origin.latitude), "lon": parseFloat(origin.longitude)}, parseFloat(target_on_ellipsoid.distance), parseFloat(req.params.pan) * -1 );

			//We are searching a point of intersection with the terrain between the origin (tower) and the target (point on ellipsoid with 0m height)			
			let geojson = {"type": "FeatureCollection", "features": []};

			const url = "https://maps.googleapis.com/maps/api/elevation/json?path=" + parseFloat(origin.latitude) + "," + parseFloat(origin.longitude) + "|" + parseFloat(dest_point.lat) + "," + parseFloat(dest_point.lon) +"&samples=512&key=AIzaSyCmURugp5QEYHqtSgldW006i6yrDyTOgTw"

			https.get(url, resp => {
			  resp.setEncoding("utf8");
			  let body = "";
			  resp.on("data", data => {
			    body += data;
			  });
			  resp.on("end", () => {
			    body = JSON.parse(body);
			    let elevations = body.results;

			    let destination_pt = turf.point([parseFloat(dest_point.lon), parseFloat(dest_point.lat)]);
			    let total_distance = turf.distance(turf.point([parseFloat(origin.longitude), parseFloat(origin.latitude)]), destination_pt, {units: 'kilometers'}) * 1000;
			    
			    let alfa_rad = Math.atan((parseFloat(req.params.heightm)/ total_distance));
			    let alfa = alfa_rad.toDegrees();

			    console.log("Angle at the destination towards the tower is ", alfa);

			    
				geojson.features.push({"type": "Feature", "properties": {"name": "Point on the geoid where los pierces geoid surface"}, "geometry": {"type": "Point", "coordinates": [parseFloat(dest_point.lon), parseFloat(dest_point.lat)]}});


			    let vertices = [];
			    let matches = [];
			    let matched = false;
			    for(var i = 0;i<elevations.length;i++){
			    	let pt1 = turf.point([elevations[i].location.lng, elevations[i].location.lat]);
					let options = {units: 'kilometers'};

					let distance_from_current_point = turf.distance(pt1, destination_pt, options) * 1000;

					let alfa_idx = Math.atan((elevations[i].elevation / distance_from_current_point)).toDegrees();

					let status;
					if(i>0){
						status = (alfa_idx > alfa) ? false : true;	
					}
					else if(i==0)
					{
						status = true;
					}

					if(!matched){
						if(!status){
							geojson.features.push({"type": "Feature", "properties": {"name": "Place of intersection with terrain"}, "geometry": {"type": "Point", "coordinates": [elevations[i].location.lng, elevations[i].location.lat]}});
							matched = true;
						}
					}

			    	vertices.push([elevations[i].location.lng, elevations[i].location.lat]);
			    }

			    geojson.features.push({"type": "Feature", "properties": {"angle_towards_tower": alfa, "tower_height": Math.tan(alfa_rad) * total_distance}, "geometry": {"type": "LineString", "coordinates": vertices}});

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
