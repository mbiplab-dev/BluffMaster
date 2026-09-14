export default function health(_req: unknown, res: { json: (value: unknown) => void }) {
  res.json({ status: "ok" });
}
