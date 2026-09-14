// Vercel's Node runtime supports exporting an HTTP server for WebSocket
// upgrades. Socket.IO is attached to the server in server/index.ts.
import { http } from "../server/index.js";

export default http;
