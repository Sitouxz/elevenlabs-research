// ---------------------------------------------------------------------------
// ModelReceiver.cs — Unity (native standalone) 3D model receiver
//
// Listens on the same Socket.IO endpoint the web app pushes to
// (wss://xr-api.fxwebapps.com) for a "message" event whose payload is the RAW
// Tripo signed .glb URL. On receipt it downloads + instantiates the model at
// runtime with glTFast.
//
// WHY URL (not binary): the web app sends the raw Tripo CDN URL. Native Unity
// is NOT bound by browser CORS, so it can fetch tripo-data.*.tripo3d.com
// directly — no proxy, no base64, no bytes over the socket. glTFast streams
// the .glb straight into GPU buffers. This is the most efficient path.
//
// -------------------------------------------------------------------------
// SETUP
// -------------------------------------------------------------------------
// 1. Install glTFast:
//      Window ▸ Package Manager ▸ + ▸ "Add package by name…"
//      name: com.unity.cloud.gltfast
//
// 2. Install a Socket.IO client. This script is written for the widely used
//    "socket.io-client-csharp" (SocketIOClient) package:
//      https://github.com/doghappy/socket.io-client-csharp
//    Install via NuGetForUnity (search "SocketIOClient") OR drop the DLLs into
//    Assets/Plugins. It targets Socket.IO v4 (Engine.IO v4) — matching the
//    server (EIO=4) the web app uses.
//
// 3. Create an empty GameObject in your scene, attach this script, and (option)
//    assign a parent Transform for spawned models in the Inspector.
//
// 4. Press Play. When the web app finishes a 3D generation it emits
//    "message" -> "<url>", and the model appears under `spawnParent`.
// ---------------------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using SocketIOClient;          // socket.io-client-csharp (doghappy)
using GLTFast;                 // com.unity.cloud.gltfast

public class ModelReceiver : MonoBehaviour
{
    [Header("Socket.IO")]
    [Tooltip("Base server URL (no /socket.io path, no query string).")]
    public string serverUrl = "https://xr-api.fxwebapps.com";

    [Tooltip("Event name the web app emits the .glb URL on.")]
    public string eventName = "message";

    [Header("Spawn")]
    [Tooltip("Optional parent for instantiated models. If null, spawns at world origin.")]
    public Transform spawnParent;

    [Tooltip("If true, the previously loaded model is destroyed before loading a new one.")]
    public bool replacePrevious = true;

    [Tooltip("Uniform scale applied to each loaded model.")]
    public float modelScale = 1f;

    private SocketIO _socket;
    private GameObject _currentModel;

    // Socket.IO callbacks fire on a background thread; Unity API calls (loading,
    // instantiating GameObjects) MUST run on the main thread. We queue incoming
    // URLs here and drain the queue in Update().
    private readonly Queue<string> _pendingUrls = new Queue<string>();
    private readonly object _queueLock = new object();

    private async void Start()
    {
        // socket.io-client-csharp appends /socket.io automatically and speaks
        // Engine.IO v4 by default, matching the server's EIO=4 transport.
        _socket = new SocketIO(serverUrl, new SocketIOOptions
        {
            EIO = SocketIO.Core.EngineIO.V4,
            Transport = SocketIOClient.Transport.TransportProtocol.WebSocket,
            Reconnection = true,
            ReconnectionDelay = 2000,
        });

        _socket.OnConnected += (s, e) =>
            Debug.Log("[ModelReceiver] Connected to " + serverUrl);
        _socket.OnDisconnected += (s, e) =>
            Debug.Log("[ModelReceiver] Disconnected: " + e);
        _socket.OnError += (s, e) =>
            Debug.LogWarning("[ModelReceiver] Socket error: " + e);

        // The web app emits: 42["message", "<raw tripo .glb url>"]
        // The payload is a single JSON string argument.
        _socket.On(eventName, response =>
        {
            string url = null;
            try
            {
                // Payload is a plain string argument.
                url = response.GetValue<string>();
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[ModelReceiver] Could not parse payload: " + ex.Message);
                return;
            }

            if (string.IsNullOrEmpty(url) || !LooksLikeGlbUrl(url))
            {
                // Ignore non-model "message" payloads (this event may be shared).
                Debug.Log("[ModelReceiver] Ignoring non-glb message: " + url);
                return;
            }

            Debug.Log("[ModelReceiver] Received model URL: " + url);
            lock (_queueLock) { _pendingUrls.Enqueue(url); }
        });

        try
        {
            await _socket.ConnectAsync();
        }
        catch (Exception ex)
        {
            Debug.LogError("[ModelReceiver] Connect failed: " + ex.Message);
        }
    }

    private void Update()
    {
        // Drain any URLs received on the socket thread and load on main thread.
        string next = null;
        lock (_queueLock)
        {
            if (_pendingUrls.Count > 0) next = _pendingUrls.Dequeue();
        }
        if (next != null)
        {
            // Fire and forget — LoadModel awaits internally.
            _ = LoadModel(next);
        }
    }

    private static bool LooksLikeGlbUrl(string url)
    {
        if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return false;
        // Match ".glb" / ".gltf" even when followed by a signed query string
        // (…/model.glb?Policy=…&Signature=…&Key-Pair-Id=…).
        return url.IndexOf(".glb", StringComparison.OrdinalIgnoreCase) >= 0
            || url.IndexOf(".gltf", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    // GLB / glTF via glTFast (runtime-capable). Downloads (UnityWebRequest) +
    // parses + instantiates. Tripo signed URLs expire, so we load promptly on
    // receipt — that's why the web app sends the URL the instant it's ready.
    private async Task LoadModel(string url)
    {
        Debug.Log("[ModelReceiver] Loading glb via glTFast: " + url);

        var gltf = new GltfImport();
        if (!await gltf.Load(url))
        {
            Debug.LogError("[ModelReceiver] Failed to load glb: " + url);
            return;
        }

        if (replacePrevious && _currentModel != null)
        {
            Destroy(_currentModel);
            _currentModel = null;
        }

        // Fresh container so we can scale/position/destroy the model as a unit.
        var container = new GameObject("TripoModel");
        if (spawnParent != null)
        {
            container.transform.SetParent(spawnParent, false);
        }
        container.transform.localScale = Vector3.one * modelScale;

        if (!await gltf.InstantiateMainSceneAsync(container.transform))
        {
            Debug.LogError("[ModelReceiver] Failed to instantiate scene for: " + url);
            Destroy(container);
            return;
        }

        _currentModel = container;
        Debug.Log("[ModelReceiver] Model instantiated.");
    }

    private async void OnDestroy()
    {
        if (_socket != null)
        {
            try { await _socket.DisconnectAsync(); } catch { /* ignore */ }
            _socket.Dispose();
            _socket = null;
        }
    }
}
