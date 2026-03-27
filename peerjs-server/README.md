# PeerJS Server for File Sharing App

This is a simple PeerJS signaling server to enable WebRTC connections for the file sharing app.

## Deployment to Heroku

1. Create a new Heroku app
2. Connect your GitHub repo or push this code
3. Set the buildpack to Node.js
4. Deploy

## Deployment to Railway

1. Go to railway.app
2. Create new project
3. Connect GitHub repo with this code
4. Deploy

## Usage

Once deployed, get the URL (e.g., https://your-app-name.herokuapp.com)

Then in your main app's index.html, update the Peer constructor:

```js
peer = new Peer({
  host: "your-app-name.herokuapp.com",
  secure: true,
  port: 443,
  path: "/peerjs",
  debug: 0,
});
```

Replace 'your-app-name.herokuapp.com' with your actual deployed URL.
