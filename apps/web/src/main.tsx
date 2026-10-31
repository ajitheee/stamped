// Dev entry until the shared apps/web scaffold lands. That scaffold mounts <OfficeScreen permitId={id} /> at /office/:id.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { OfficeScreen } from "./office/OfficeScreen"

const id = decodeURIComponent(location.pathname.match(/^\/office\/([^/]+)/)?.[1] ?? "")

createRoot(document.getElementById("root")!).render(
  <StrictMode>{id ? <OfficeScreen permitId={id} /> : <p style={{ padding: 24, fontFamily: "sans-serif" }}>Open /office/&lt;permit id&gt;</p>}</StrictMode>,
)
