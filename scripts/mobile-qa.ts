// Mobile viewport QA — set 390x844 (iPhone 12 Pro) via CDP
// Usage: bun run scripts/mobile-qa.ts
import WebSocket from 'ws'

const CDP_PORT = 45727 // agent-browser's chrome --remote-debugging-port (random)
const CDP_URL = `http://127.0.0.1:${CDP_PORT}/json`
const TARGET_URL = 'http://localhost:3000'

interface Target { id: string; url: string; webSocketDebuggerUrl: string; type: string }

async function main() {
  const res = await fetch(`${CDP_URL}`)
  const targets: Target[] = await res.json() as Target[]
  const target = targets.find((t) => t.url.includes('localhost:3000') || t.type === 'page')
  if (!target) {
    console.error('No page target found. Open the page first via agent-browser open.')
    process.exit(1)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id
      ws.send(JSON.stringify({ id: msgId, method, params }))
      const handler = (data: WebSocket.RawData) => {
        const m = JSON.parse(data.toString())
        if (m.id === msgId) {
          ws.off('message', handler)
          if (m.error) reject(new Error(JSON.stringify(m.error)))
          else resolve(m.result)
        }
      }
      ws.on('message', handler)
    })

  ws.on('open', async () => {
    console.log('Connected to', target.url)
    // Reset to desktop viewport explicitly
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 800,
    })
    console.log('Device reset to desktop 1280x800')
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
    await new Promise((r) => setTimeout(r, 200))
    ws.close()
    process.exit(0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
