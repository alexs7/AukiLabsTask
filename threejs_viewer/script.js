const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const { execSync } = require('child_process');
const {Vector3} = require("three");
const {getCurrentWindow, globalShortcut} = require('electron').remote;

//3D Objects
var phone_cam;
var scene;
var server;
var camera; //ThreeJS Camera
var controls;
var red = 0xff0000;
var green = 0x00ff00;
var blue = 0x0000ff;
var yellow = 0xffff00;
var white = 0xffffff;
var orange = 0xffa500;
var pink = 0xFFC0CB;
var remote_cameras = {};
var g_sessions_id = null;
var camera_one_renderer = null;
var camera_two_renderer = null;

window.onload = function() {

    //start server
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    app.use(bodyParser.json({limit: '10mb'}));

    app.post('/view_collaborative_session', (req, res) => {

        console.log("Received!");

        var demo_camera = null;
        var demo_camera_helper = null;
        var anchors = null;
        var frustum = null;
        var session_id = req.body.sessionID;
        var participant_id = req.body.participantID;

        if(g_sessions_id == null){ //first time a request is received.
            g_sessions_id = session_id;
        }

        //The code here is tailored for two participants and tested with two devices.
        if(session_id === g_sessions_id) { // then we have a valid potential participant
            if (!(participant_id in remote_cameras)) { //only add prticipant if we didn't add him yet
                demo_camera = new THREE.PerspectiveCamera(75, 0.5, 0.1, 0.6); // random values will be replaced later
                demo_camera_helper = new THREE.CameraHelper(demo_camera);
                scene.add(demo_camera_helper);
                demo_camera_helper.visible = false;
                var color = null;
                if (participant_id === "1")
                    color = blue;
                else {
                    color = yellow;
                }
                anchors = createAnchors(color);
                frustum = new THREE.Frustum();
                remote_cameras[participant_id] = [demo_camera, demo_camera_helper, anchors, frustum]; //can also use a dict here for cleaner code
                // UI, divide by three so the canvas elements fit the window.
                var canvas_id = "#camera" + participant_id + "DS";
                $(canvas_id).height(parseFloat(req.body.pixelHeight) / 3);
                $(canvas_id).width(parseFloat(req.body.pixelWidth) / 3);
            }

            // anytime you update, demo_camera, demo_camera_helper, anchors, the values in remote_cameras will change too
            // The array contains references to the objects, not copies of them, https://stackoverflow.com/questions/24304383/javascript-return-reference-to-array-item
            demo_camera = remote_cameras[participant_id][0];
            demo_camera_helper = remote_cameras[participant_id][1];
            anchors = remote_cameras[participant_id][2];
            frustum = remote_cameras[participant_id][3];

            demo_camera.fov = parseFloat(req.body.fieldOfView);
            demo_camera.pixelWidth = parseFloat(req.body.pixelWidth);
            demo_camera.pixelHeight = parseFloat(req.body.pixelHeight);
            demo_camera.aspect = parseFloat(req.body.aspect);
            //These are sample values below used just for testing. Also change the anchors scale.
            //If you use the originals then the frustum is too long and looks ugly for demo purposes.
            demo_camera.near = 0.1; //parseFloat(req.body.nearClipPlane);
            demo_camera.far = 0.55; //parseFloat(req.body.farClipPlane);
            demo_camera.updateProjectionMatrix();
            demo_camera.updateMatrixWorld(true);
            demo_camera_helper.update();

            if (Object.keys(remote_cameras).length > 1) {
                var w = 1, h = 1;
                // near plane
                var n1 = new THREE.Vector3(-w, -h, -1);
                var n2 = new THREE.Vector3(w, -h, -1);
                var n3 = new THREE.Vector3(-w, h, -1);
                var n4 = new THREE.Vector3(w, h, -1);
                // far plane
                var f1 = new THREE.Vector3(-w, -h, 1);
                var f2 = new THREE.Vector3(w, -h, 1);
                var f3 = new THREE.Vector3(-w, h, 1);
                var f4 = new THREE.Vector3(w, h, 1);

                var all_planes_vertices = [f1, f2, f3, f4, n1, n2, n3, n4];
                var scale = 0.04; //far_scale

                for (var i = 0; i < anchors.length; i++) {
                    //Projecting from NDC image coordinates to world space (unprojecting)
                    all_planes_vertices[i].unproject(demo_camera);
                    anchors[i].position.set(all_planes_vertices[i].x, all_planes_vertices[i].y, all_planes_vertices[i].z);
                    if (i > 3) { // set the near anchors' scale
                        scale = 0.006;
                    }
                    anchors[i].scale.set(scale, scale, scale);
                    if (!(anchors[i].visible)) {
                        anchors[i].visible = true;
                    }
                }

                var planes = getPlanes(all_planes_vertices);
                frustum.set(planes[0], planes[1], planes[2], planes[3], planes[4], planes[5]);

                var participant_1_anchors = remote_cameras["1"][2];
                var participant_2_anchors = remote_cameras["2"][2];
                var participant_1_frustum = remote_cameras["1"][3];
                var participant_2_frustum = remote_cameras["2"][3];
                checkForCollisions(participant_1_anchors, participant_2_anchors,
                    participant_1_frustum, participant_2_frustum);

                //update the scene at the same frequency tou receive an HTTP request
                camera_one_renderer.render(scene, remote_cameras["1"][0]);
                camera_two_renderer.render(scene, remote_cameras["2"][0]);
            }

            var pose = req.body.cameraPoseWorld;
            var camera_pose = pose.split(',');

            var tx = parseFloat(camera_pose[0]);
            var ty = parseFloat(camera_pose[1]);
            var tz = -parseFloat(camera_pose[2]); //minus due to coordinate system diff (Unity left handed, THREEJS right handed)
            var qx = parseFloat(camera_pose[3]);
            var qy = parseFloat(camera_pose[4]);
            var qz = parseFloat(camera_pose[5]);
            var qw = parseFloat(camera_pose[6]);

            var quaternion = new THREE.Quaternion();
            quaternion.fromArray([-qx, -qy, qz, qw]); //minus due to coordinate system diff (Unity left handed, THREEJS right handed)
            demo_camera.setRotationFromQuaternion(quaternion);

            demo_camera.position.x = tx;
            demo_camera.position.y = ty;
            demo_camera.position.z = tz;

            demo_camera_helper.setRotationFromQuaternion(quaternion);
            demo_camera_helper.position.x = tx;
            demo_camera_helper.position.y = ty;
            demo_camera_helper.position.z = tz;

            if (!(demo_camera_helper.visible)) {
                demo_camera_helper.visible = true;
            }
        }
        res.sendStatus(200);
    });

    server = app.listen(3000, () => console.log(`Started server at http://localhost:3000!`));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

    var renderer = new THREE.WebGLRenderer({canvas: document.getElementById( "drawingSurface" )});
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    var size = 10;
    var divisions = 10;

    var gridHelper = new THREE.GridHelper( size, divisions );
    scene.add( gridHelper );

    var axesHelper = new THREE.AxesHelper( 5 );
    scene.add( axesHelper );

    // lights
    var light = new THREE.DirectionalLight( white );
    var ambientLight = new THREE.AmbientLight( pink );
    light.position.set( 50, 50, 50 );
    scene.add( light );
    scene.add(ambientLight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    camera.position.set( 1, 1, 1 );
    camera.lookAt(scene.position);

    controls.update(); //must be called after any manual changes to the camera's transform

    // just add some sample 3D objects for reference
    var geometry = new THREE.SphereGeometry( 1, 16, 16 );
    var material = new THREE.MeshPhongMaterial( {color: white } );
    var sphere = new THREE.Mesh( geometry, material );
    scene.add( sphere );
    sphere.scale.set(0.1,0.1,0.1);
    sphere.position.z -= 0.5;

    var geometry = new THREE.BoxGeometry( 1, 1, 1 );
    var material = new THREE.MeshPhongMaterial( {color: red } );
    var cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    cube.scale.set(0.15,0.15,0.15);
    cube.position.z -= 0.5;
    cube.position.x -= 0.5;

    //set up the renderers of camera 1 and 2 (for more cameras this might be inefficient)
    camera_one_renderer = new THREE.WebGLRenderer({canvas: document.getElementById( "camera1DS" )});
    camera_one_renderer.setSize( camera_one_renderer.domElement.clientWidth, camera_one_renderer.domElement.clientHeight );

    camera_two_renderer = new THREE.WebGLRenderer({canvas: document.getElementById( "camera2DS" )});
    camera_two_renderer.setSize( camera_two_renderer.domElement.clientWidth, camera_two_renderer.domElement.clientHeight );

    function animate() {
        requestAnimationFrame( animate );
        // required if controls.enableDamping or controls.autoRotate are set to true
        controls.update();
        renderer.render( scene, camera );
    }

    animate();
};

function getPlanes(all_planes_vertices){
    // all_planes_vertices order = [f1,f2,f3,f4,n1,n2,n3,n4];
    var f1 = all_planes_vertices[0];
    var f2 = all_planes_vertices[1];
    var f3 = all_planes_vertices[2];
    var f4 = all_planes_vertices[3];
    var n1 = all_planes_vertices[4];
    var n2 = all_planes_vertices[5];
    var n3 = all_planes_vertices[6];
    var n4 = all_planes_vertices[7];
    var p0 = new THREE.Plane(), p1 = new THREE.Plane(), p2 = new THREE.Plane(),
        p3 = new THREE.Plane(), p4 = new THREE.Plane(), p5 = new THREE.Plane();

    p0.setFromCoplanarPoints(n2,n4,f4);
    p1.setFromCoplanarPoints(f2,f4,f3);
    p2.setFromCoplanarPoints(f1,f3,n3);
    p3.setFromCoplanarPoints(n1,n3,n4);
    p4.setFromCoplanarPoints(n2,f2,f1);
    p5.setFromCoplanarPoints(n3,f3,f4);

    return [ p0, p1, p2, p3, p4, p5 ];
}

function createAnchors(color){
    var anchors = []

    for (var i = 0; i < 8; i++) {
        var geometry = new THREE.BoxGeometry( 1, 1, 1 );
        var material = new THREE.MeshPhongMaterial( {color: color} );
        var anchor = new THREE.Mesh( geometry, material );
        anchor.visible = false;
        scene.add(anchor);
        anchors.push(anchor)
    }
    return anchors;
}

function checkForCollisions(participant_1_anchors, participant_2_anchors,
                            participant_1_frustum, participant_2_frustum){
    for (var i = 0; i < participant_1_anchors.length; i++) {
        if(participant_2_frustum.containsPoint(participant_1_anchors[i].position)){
            $("#overlay").text("Blue collided in Yellow!");
            return;
        }
        if(participant_1_frustum.containsPoint(participant_2_anchors[i].position)){
            $("#overlay").text("Yellow collided in Blue!");
            return;
        }
    }
    $("#overlay").text("No collisions");
}