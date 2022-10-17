using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using Auki;
using UnityEngine;
using Auki.Model;
using Auki.Vikja;
using Auki.Manna;
using UnityEngine.Networking;

public class ConjureKitDemo : MonoBehaviour
{
    private IConjureKit _conjureKit;
    private Camera _arCamera;
    private Dictionary<uint, GameObject> _entityIdToGameObject = new Dictionary<uint, GameObject>();
    private Vikja _vikja;
    private Manna _manna;
    private PostDataFrustum data;
    private float elapsed = 0f;
    private float TIME_LIMIT = 0.3f; //in seconds
    private string IP_ADDRESS = "192.168.10.8";

    IEnumerator sendFrustumData(string url, string json_data)
    {
        UnityWebRequest uwr = new UnityWebRequest(url, "POST");
        byte[] bodyRaw = Encoding.UTF8.GetBytes(json_data);
        uwr.uploadHandler = (UploadHandler)new UploadHandlerRaw(bodyRaw);
        uwr.downloadHandler = (DownloadHandler)new DownloadHandlerBuffer();
        uwr.SetRequestHeader("Content-Type", "application/json");
        yield return uwr.SendWebRequest();
        if (uwr.result != UnityWebRequest.Result.Success)
        {
            Debug.Log("Error While Sending: " + uwr.error);
        }
        uwr.Dispose();
    }

    private void CreateCube(Entity entity)
    {
        // If an Entity has a flag set to 1, this means that it is a
        // participants device entity.
        if (entity.Flag == EntityFlag.EntityFlagParticipantEntity) return;
        if (_entityIdToGameObject.ContainsKey(entity.Id)) return;

        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        var meshRenderer = cube.GetComponent<MeshRenderer>();
        meshRenderer.material = new Material(Shader.Find("Diffuse"));
        cube.transform.position = entity.Pose.position;
        cube.transform.rotation = entity.Pose.rotation;
        // Scale the cube to be 10cm in size
        cube.transform.localScale = Vector3.one * 0.1f;
        _entityIdToGameObject.Add(entity.Id, cube);
    }
    
    private void logJoinAction(Session session)
    {
        Debug.Log($"Joined Session! {session}");
    }
    
    private void updateSessionServer()
    {
        Transform cameraTransform = _arCamera.transform;
        Session session = _conjureKit.GetSession();
        
        float[] cameraWorldPoseVals =
        {
            cameraTransform.position.x, cameraTransform.position.y, cameraTransform.position.z,
            cameraTransform.rotation.x, cameraTransform.rotation.y, cameraTransform.rotation.z,
            cameraTransform.rotation.w
        };
        string world_pose_str = String.Join(",", cameraWorldPoseVals);

        data.pixelHeight = _arCamera.pixelHeight.ToString();
        data.pixelWidth = _arCamera.pixelWidth.ToString();
        data.aspect = _arCamera.aspect.ToString();
        data.fieldOfView = _arCamera.fieldOfView.ToString();
        data.nearClipPlane = _arCamera.nearClipPlane.ToString();
        data.farClipPlane = _arCamera.farClipPlane.ToString();
        data.cameraPoseWorld = world_pose_str;
        data.sessionID = session.Id;
        data.participantID = session.ParticipantId.ToString();
        StartCoroutine(sendFrustumData($"http://{IP_ADDRESS}:3000/view_collaborative_session", JsonUtility.ToJson(data)));
    }
    
    private void DeleteCube(uint entityId)
    {
        if (!_entityIdToGameObject.ContainsKey(entityId)) return;
        Destroy(_entityIdToGameObject[entityId]);
        _entityIdToGameObject.Remove(entityId);
    }
    
    private void CreateCubeEntity()
    {
        // The Cube will be positioned 50cm directly in front of the client that creates it.
        var position = _arCamera.transform.position + _arCamera.transform.forward * 0.5f;
        var rotation = Quaternion.Euler(0, _arCamera.transform.eulerAngles.y, 0);

        _conjureKit.AddEntity(
            new Pose(position, rotation),
            entity => CreateCube(entity),
            error => Debug.Log($"Failed to add Cube: {error}"));
    }
    
    private void Start()
    {
         data = new PostDataFrustum();
        _conjureKit = new ConjureKit(
            AukiConfiguration.Get(),
            "86bcd3de-ac53-4a97-8b3e-ef392111ffd1",
            "c624b098-4593-4a2a-85f4-be67b96e299b527aaa4c-c300-49ee-9e3b-cfbcb6db1be2");
        
        _arCamera = _conjureKit.GetSceneRig().CameraManager.GetComponent<Camera>();
        _vikja = new Vikja(_conjureKit);
        _manna = new Manna(_conjureKit, _vikja);
        _manna.SetLighthouseVisible(true);
        // Subscribe to OnEntityDeleted
        _conjureKit.OnEntityDeleted += DeleteCube;
        // Subscribe to OnEntityAdded
        // Note: This will only be called when another participant in the session creates and Entity.
        _conjureKit.OnEntityAdded += CreateCube;
        _conjureKit.OnJoined += logJoinAction;
        _conjureKit.Connect();
    }
    
    private void Update()
    {
        elapsed += Time.deltaTime;

        // If State is not Calibrated, just return.
        if (_conjureKit.GetState() != State.Calibrated)
            return;

        if (elapsed > TIME_LIMIT) // if more than 0.3 second has passed
        {
            updateSessionServer();
            elapsed = 0f;
        }
    }
    
}