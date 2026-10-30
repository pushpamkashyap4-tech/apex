import { transcription } from "../lib/api-handlers.js";
export default transcription;
export const config = { api: { bodyParser: { sizeLimit: "24mb" } } };
