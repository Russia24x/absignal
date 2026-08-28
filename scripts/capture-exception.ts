// Capture full runtime exceptions via CDP — connects to agent-browser's chrome,
// reloads the page, and prints complete stack traces of any exception thrown.
import WebSocket from 'ws'

const CDP_PORT = Number(process.argv[2] || 45727)

interface Target { id: string; url: string; webSocketDebuggerUrl: string; type: string }

async function main() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
  const targets: Target[] = (await res.json()) as Target[]
  const target = targets.find((t) => t.url.includes('localhost:3000'))
  if (!target) {
    console.error('No page target. Open the page first.')
    process.exit(1)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<number, (v: unknown) => void>()
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise((resolve) => {
      const msgId = ++id
      pending.set(msgId, resolve)
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })

  const exceptions: unknown[] = []
  ws.on('message', (data: WebSocket.RawData) => {
    const m = JSON.parse(data.toString())
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)?.(m.result)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails)
    }
  })

  ws.on('open', async () => {
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Page.reload', { ignoreCache: false })
    // Collect for 15s
    await new Promise((r) => setTimeout(r, 15000))
    for (const ex of exceptions) {
      const d = ex as { text?: string; exception?: { description?: string }; stackTrace?: { callFrames: { functionName: string; url: string; lineNumber: number; columnNumber: number }[] } }
      console.log('=== EXCEPTION:', d.text)
      if (d.exception?.description) console.log(d.exception.description.slice(0, 3000))
      if (d.stackTrace?.callFrames) {
        console.log('FRAMES:')
        for (const f of d.stackTrace.callFrames.slice(0, 12)) {
          console.log(`  ${f.functionName || '<anon>'} @ ${f.url}:${f.lineNumber}:${f.columnNumber}`)
        }
      }
      console.log('')
    }
    console.log(`TOTAL: ${exceptions.length} exceptions`)
    ws.close()
    process.exit(0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
