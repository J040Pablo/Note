import { shouldLogDev } from "../utils/runtimeEnv";

export const WEB_APP_URL = shouldLogDev 
  ? "http://localhost:5173" 
  : "https://spectru.vercel.app";
