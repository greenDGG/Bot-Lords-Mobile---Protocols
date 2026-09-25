import WebSocket from "ws";

const url = "http://192.168.18.31:3100";

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("Connected to the server");
});

ws.on("close", () => {
  console.log("Disconnected from the server");
}); 

