// Starts the office agents (Clerk, Building, Zoning) in one Node process: npm run agents
import "./env"

import { startClerk } from "./clerk"
import { startReviewer } from "./reviewer"

await Promise.all([startClerk(), startReviewer("building"), startReviewer("zoning")])
console.log("clerk, building and zoning are listening on Agent Relay")
