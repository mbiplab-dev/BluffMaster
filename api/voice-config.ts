export default function voiceConfig(
  _req: unknown,
  res: { json: (value: unknown) => void },
) {
  const iceServers: object[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ enabled: process.env.VOICE_CHAT !== "false", iceServers });
}
