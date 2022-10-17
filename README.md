# AukiLabs Task

## Structure
The code is found in two folders.
**TesterAukiLabs/** and **threejs_viewer/**.

**TesterAukiLabs/** is the Unity Code using AukiLabs SDK.
**threejs_viewer/** is a viewer that will show two phones in a shared session, and one "fake" phone which is a mock device. (I had only two iPhones to test this.).
The viewer reads incoming data from the phone and reflects their pose its coordinate system. 
The viewer also does the majority of the processing.

![start scene](https://user-images.githubusercontent.com/1533281/196245164-bf6d6d7a-d213-4579-89c4-f3830b5851ea.png)

The Unity code was developed in Unity 2020.3.30f1. The viewer in **node v16.18.0**.

## Setting up

Before compiling and running the iOS app (Unity), please set the IP address of your localhost in **ConjureKitDemo.cs**.
You can use the API ketys provided or yours.
To run the viewer simply run ```npm start``` inside **threejs_viewer/**.

Run the viewer first then launch an app and wait until **ConjureKit** is calibrated. Once you see the QR code the phone should start sending data to the viewer. You should see 1 frustum only.

![first client](https://user-images.githubusercontent.com/1533281/196245334-e680d29f-2ffc-45c1-81d2-e8b2a48613f2.png)

[Video](https://youtu.be/vjoU_RG4PNs)

To see the other phone in the viewer you need to scan the first phone's QR code. Once the second phone has joined, should see something similar as below.

![joined](https://user-images.githubusercontent.com/1533281/196245770-fdf96877-7a95-4984-8cb2-5b9cc2ef9108.png)

The frustum's of each camera of each phone are visualised. The vertices that make up the near and far plane are represented with small cubes (blue for first camera and yellow for second).

A video of the above is found here: [Video](https://youtu.be/ZpS-ZRGcUaM)

## Frustums intersection

To implement this I defined 6 planes for each frustum using their vertices and their normals pointing inwards. 
Then if any of the first camera frustum's vertices are in the second camera's frustum or vice versa then a collision is detected.
I check if a point is in a frustum by calculating the query point's signed distance from all the 6 planes of the other frustum. If any returns false then the point is *not* in the frustum.
The text in the lower left of the viewer updates if there is a collision.

## Frustums Intersection on all clients. 

To share the frustum intersection between all viewers, I render the clients (two physical iPhones and the "fake" phone) in the viewer.
When an intersection happens the "fake" phone can see the intersection as it just looks at the scene from a third person-view. 
For the iPhone getting "intersected" you will see the vertices of the other phone, in its view (frustum).
The iPhone that intersects the other iPhone, should see the lines that make up the intersected iPhone's frustum.

![collision still](https://user-images.githubusercontent.com/1533281/196246719-463950bc-42a1-42eb-b270-1e590a4315ee.png)

The frustum intersection is just visible from the mock Phone (camera 3).
